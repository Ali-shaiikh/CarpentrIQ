"""Quote router — generate, edit, send, and client-facing approval.

Private (JWT required):
  POST /quote/generate              — build quote from material estimates
  GET  /quote/:quote_id             — get quote detail
  PUT  /quote/:quote_id             — edit draft quote
  POST /quote/:quote_id/send        — generate PDF + Razorpay link, mark sent

Public (no auth):
  GET  /quote/:share_token/view     — client views quote
  POST /quote/:share_token/approve  — client approves, creates Job
  POST /quote/:share_token/reject   — client rejects
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import hashlib

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.enquiry import Enquiry
from app.models.material import Job
from app.models.quote import FurnitureItem, Quote
from app.models.saved_design import SavedDesign
from app.services.auth_service import auth_service
from app.services.furniture_prompt_builder import (
    DESIGNER_STYLE_NAMES,
    build_complete_image_prompt,
    build_kontext_edit_prompt,
)
from app.services.fal_service import edit_room_image_kontext
from app.services.image_generation_service import (
    describe_furniture_from_image,
    generate_room_image,
    translate_change_request,
)
from app.services.replicate_service import gpt_image_2
from app.services.material_estimator import MaterialEstimator
from app.services.storage_service import storage_service
from app.services.trial_subscription_service import (
    check_image_quota,
    check_quote_send_quota,
    increment_image_usage,
    increment_quote_sent,
    log_usage,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_estimator = MaterialEstimator()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FurnitureItemInput(BaseModel):
    item_type: str
    config: dict
    material_grade: str = "standard"


class GenerateQuoteRequest(BaseModel):
    enquiry_id: UUID
    furniture_items: list[FurnitureItemInput]
    labour_rate: float | None = None
    margin_pct: float | None = None
    notes: str | None = None


class UpdateQuoteRequest(BaseModel):
    margin_pct: float | None = None
    notes: str | None = None
    validity_days: int | None = None
    advance_requested: float | None = None


class RejectQuoteRequest(BaseModel):
    reason: str | None = None


class SendQuoteRequest(BaseModel):
    remove_hallmark: bool = False


class PreviewImageRequest(BaseModel):
    room_type: str = "living"
    room_dims: dict | None = None
    furniture_items: list[dict] = []
    material_grade: str = "standard"
    notes: str = ""
    mood_hint: str = ""
    reference_room_url: str | None = None      # uploaded room photo → gpt-image-1 edit mode
    furniture_references: list[dict] = []      # [{item_index: int, url: str}, ...]
    mood_reference_url: str | None = None      # style / inspiration image → described via vision
    selected_style: str | None = None          # designer style name from frontend picker


class ApplyChangeRequest(BaseModel):
    image_url: str                             # current generated image URL
    change_request: str                        # user text — Hindi, Urdu, Marathi, or English
    room_type: str = "living"
    material_grade: str = "standard"


# ── Public endpoints ─────────────────────────────────────────────────────────

@router.get("/designer-styles")
async def list_designer_styles():
    """Return all available designer style names for the frontend style picker."""
    return {"styles": DESIGNER_STYLE_NAMES}


# ── Private endpoints ─────────────────────────────────────────────────────────

@router.post("/preview-image")
async def preview_room_image(
    body: PreviewImageRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — generate a DALL-E 3 full-room image preview.

    Checks the monthly image quota before generating.
    Increments images_used_this_month and logs usage on success.
    Returns {"image_url", "images_remaining"} or 402 on quota exceeded.
    """
    if not check_image_quota(carpenter):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "quota_exceeded",
                "message": (
                    f"Monthly image limit reached "
                    f"({carpenter.images_used_this_month}/{carpenter.images_limit_this_month}). "
                    "Upgrade your plan to generate more images."
                ),
            },
        )

    ref_descriptions: dict[int, str] = {}
    mood_description: str = ""

    # Haiku vision descriptions are only needed for the DALL-E 3 text-only fallback.
    # On the edit path (reference_room_url provided), gpt-image-2 sees the images directly
    # so we skip Haiku to save latency and API cost.
    if not body.reference_room_url:
        import asyncio as _asyncio

        async def _describe_furniture(item_index: int, url: str) -> tuple[int, str]:
            return item_index, await describe_furniture_from_image(url)

        async def _describe_mood(url: str) -> tuple[int, str]:
            return -1, await describe_furniture_from_image(url)

        tasks = []
        if body.furniture_references:
            tasks.extend([_describe_furniture(r["item_index"], r["url"]) for r in body.furniture_references])
        if body.mood_reference_url:
            tasks.append(_describe_mood(body.mood_reference_url))
        if tasks:
            for res in await _asyncio.gather(*tasks, return_exceptions=True):
                if isinstance(res, tuple):
                    idx, desc = res
                    if not desc:
                        continue
                    if idx == -1:
                        mood_description = desc
                    else:
                        ref_descriptions[idx] = desc

    # Collect all reference image URLs to pass to gpt-image-2 alongside the room photo
    ref_image_urls: list[str] = []
    if body.mood_reference_url:
        ref_image_urls.append(body.mood_reference_url)
    for ref in (body.furniture_references or []):
        url = ref.get("url") if isinstance(ref, dict) else None
        if url and url not in ref_image_urls:
            ref_image_urls.append(url)

    has_furniture_reference = bool(ref_image_urls)

    # Build transformation prompt — full interior redesign while preserving room geometry.
    # Constraints (camera angle, door/window positions) lead the prompt so the model
    # locks them in before processing the transformation instructions.
    transform_prompt = build_kontext_edit_prompt(
        room_type=body.room_type,
        furniture_items=body.furniture_items,
        material_grade=body.material_grade,
        notes=body.notes,
        mood_description=mood_description,
        selected_style=body.selected_style,
        has_furniture_reference=has_furniture_reference,
    )

    if body.reference_room_url:
        # FLUX Kontext PRIMARY — purpose-built for in-context editing.
        # Preserves walls, arches, ceiling, camera angle and room geometry while
        # applying the transformation. gpt-image-2 generates new rooms; Kontext edits them.
        result = await edit_room_image_kontext(body.reference_room_url, transform_prompt)
        if "error" in result:
            logger.warning("FLUX Kontext failed, falling back to gpt-image-2: %s", result["error"])
            result = await gpt_image_2(
                prompt=transform_prompt,
                image_url=body.reference_room_url,
                extra_image_urls=ref_image_urls or None,
            )
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
    else:
        # No room photo — fresh generation. Pass any reference images so the model
        # can use the furniture/style references even without a base room photo.
        result = await gpt_image_2(
            prompt=transform_prompt,
            extra_image_urls=ref_image_urls or None,
        )
        if "error" in result:
            logger.warning("gpt-image-2 fresh gen failed, falling back to DALL-E 3: %s", result["error"])
            fallback_prompt = build_complete_image_prompt(
                room_type=body.room_type,
                dims=body.room_dims,
                furniture_items=body.furniture_items,
                material_grade=body.material_grade,
                notes=body.notes,
                mood_hint=body.mood_hint,
                reference_descriptions=ref_descriptions or None,
                mood_description=mood_description,
                selected_style=body.selected_style,
            )
            result = await generate_room_image(fallback_prompt)

    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    await increment_image_usage(db, carpenter)
    await log_usage(db, carpenter.id, "room_image_generated")
    await db.commit()

    images_remaining = carpenter.images_limit_this_month - carpenter.images_used_this_month

    logger.info(
        "Room image generated for carpenter %s (%.1fs, %d remaining)",
        carpenter.id, result["generation_time"], images_remaining,
    )

    return {
        "image_url": result["image_url"],
        "prompt_used": result["prompt_used"],
        "revised_prompt": result["revised_prompt"],
        "generation_time": result["generation_time"],
        "images_remaining": images_remaining,
    }


@router.post("/apply-change")
async def apply_room_change(
    body: ApplyChangeRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — apply a multilingual change request to an existing generated image.

    Translates the user's request (Hindi/Urdu/Marathi/English) into an English
    design instruction via Claude Haiku, then edits the image with FLUX Kontext.
    Falls back to gpt-image-2 if Kontext fails.
    Counts against the monthly image quota.
    """
    if not check_image_quota(carpenter):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "quota_exceeded",
                "message": (
                    f"Monthly image limit reached "
                    f"({carpenter.images_used_this_month}/{carpenter.images_limit_this_month}). "
                    "Upgrade your plan to generate more images."
                ),
            },
        )

    english_instruction = await translate_change_request(body.change_request)

    prompt = (
        f"Apply this specific change to the room: {english_instruction}. "
        "Keep everything else exactly as-is — same camera angle, room layout, "
        "lighting, and all unchanged furniture and surfaces."
    )

    result = await edit_room_image_kontext(body.image_url, prompt)
    if "error" in result:
        logger.warning(
            "FLUX Kontext failed for apply-change, falling back to gpt-image-2: %s",
            result["error"],
        )
        result = await gpt_image_2(prompt=prompt, image_url=body.image_url)

    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    await increment_image_usage(db, carpenter)
    await log_usage(db, carpenter.id, "room_change_applied")
    await db.commit()

    images_remaining = carpenter.images_limit_this_month - carpenter.images_used_this_month

    logger.info(
        "Room change applied for carpenter %s (%.1fs, %d remaining)",
        carpenter.id, result["generation_time"], images_remaining,
    )

    return {
        "image_url": result["image_url"],
        "prompt_used": prompt,
        "translated_request": english_instruction,
        "generation_time": result["generation_time"],
        "images_remaining": images_remaining,
    }


_MAX_REF_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/upload-reference")
async def upload_reference_photo(
    photo: UploadFile = File(...),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — upload a reference room photo for image-edit mode.

    Stores the image in Supabase and returns a public URL. The URL is then
    passed as reference_room_url in the preview-image request so the backend
    can download and send it to DALL-E 2 for image editing.
    """
    content_type = (photo.content_type or "").lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=422, detail="Only JPG, PNG, or WebP images are accepted.")

    file_bytes = await photo.read()
    if len(file_bytes) > _MAX_REF_BYTES:
        raise HTTPException(status_code=422, detail="Reference photo must be under 10 MB.")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    image_hash = hashlib.sha256(file_bytes).hexdigest()[:16]
    storage_path = f"studio/reference/{carpenter.id}/{image_hash}.{ext}"

    try:
        url = await storage_service.upload(file_bytes, storage_path, content_type)
    except Exception as exc:
        logger.error("Reference photo upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    return {"url": url}


# ── Room photo validation ─────────────────────────────────────────────────────

class ValidateRoomPhotoRequest(BaseModel):
    url: str


@router.post("/validate-room-photo")
async def validate_room_photo(
    body: ValidateRoomPhotoRequest,
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Use Claude Haiku vision to check if a room photo is usable for FLUX Kontext transformation.

    Checks angle and usability only — not aesthetics. Returns a warning (not a hard block);
    the frontend shows the message but lets the carpenter proceed.

    Returns {"suitable": bool, "warning": str}
    On any error, returns suitable=True (never blocks generation).
    """
    if not settings.anthropic_api_key:
        return {"suitable": True, "warning": ""}

    from anthropic import AsyncAnthropic
    import json as _json

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": body.url}},
                    {
                        "type": "text",
                        "text": (
                            "You are assessing a room photo for an Indian carpenter's interior design app. "
                            "Evaluate TWO things:\n\n"
                            "1. SUITABILITY for FLUX Kontext Pro (AI that transforms room interiors).\n"
                            "Struggles with: camera pointing at ceiling/floor only, outdoor scenes, "
                            "extreme close-ups with no room context, completely black/blurred images.\n\n"
                            "2. CONTEXT CLARITY — can you confidently identify what space this is and "
                            "what the carpenter intends to design here? Set needs_context=true if:\n"
                            "- The room type is genuinely ambiguous (could be multiple room types)\n"
                            "- It is under heavy construction with no clear intended use\n"
                            "- It is an unusual space (storage, industrial, open terrace) where furniture intent is unclear\n"
                            "- You cannot tell what furniture or design is wanted for this space\n"
                            "Do NOT ask for context if the room type is obvious (bedroom, kitchen, corridor, etc.), "
                            "even if it is messy, dark, or unfurnished.\n\n"
                            "If needs_context=true, write a short, specific question (max 15 words) asking "
                            "exactly what you need to know to design this space correctly.\n\n"
                            "Respond ONLY with this JSON (no other text):\n"
                            '{"suitable": true, "warning": "", "needs_context": false, "context_question": ""}'
                        ),
                    },
                ],
            }],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = _json.loads(text)
        return {
            "suitable":         bool(data.get("suitable", True)),
            "warning":          str(data.get("warning", "")),
            "needs_context":    bool(data.get("needs_context", False)),
            "context_question": str(data.get("context_question", "")),
        }
    except Exception as exc:
        logger.warning("Room photo validation non-fatal error: %s", exc)
        return {"suitable": True, "warning": "", "needs_context": False, "context_question": ""}


# ── Saved designs ─────────────────────────────────────────────────────────────

class SaveDesignRequest(BaseModel):
    name: str
    generated_image_url: str
    selected_style: str | None = None
    notes: str | None = None
    material_grade: str = "standard"
    room_type: str | None = None
    furniture_items: list[dict] = []


@router.post("/saved-designs", status_code=201)
async def create_saved_design(
    body: SaveDesignRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    design = SavedDesign(
        carpenter_id=carpenter.id,
        name=body.name.strip() or "Untitled Design",
        generated_image_url=body.generated_image_url,
        selected_style=body.selected_style,
        notes=body.notes,
        material_grade=body.material_grade,
        room_type=body.room_type,
        furniture_items=body.furniture_items or [],
    )
    db.add(design)
    await db.commit()
    await db.refresh(design)
    return _design_dict(design)


@router.get("/saved-designs")
async def list_saved_designs(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    result = await db.execute(
        select(SavedDesign)
        .where(SavedDesign.carpenter_id == carpenter.id)
        .order_by(SavedDesign.created_at.desc())
        .limit(20)
    )
    designs = result.scalars().all()
    return {"designs": [_design_dict(d) for d in designs]}


@router.delete("/saved-designs/{design_id}")
async def delete_saved_design(
    design_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> Response:
    try:
        did = UUID(design_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid design_id")
    result = await db.execute(
        select(SavedDesign).where(
            SavedDesign.id == did,
            SavedDesign.carpenter_id == carpenter.id,
        )
    )
    design = result.scalar_one_or_none()
    if design is None:
        raise HTTPException(status_code=404, detail="Design not found")
    await db.delete(design)
    await db.commit()
    return Response(status_code=204)


def _design_dict(d: SavedDesign) -> dict:
    return {
        "id":                  str(d.id),
        "name":                d.name,
        "generated_image_url": d.generated_image_url,
        "selected_style":      d.selected_style,
        "notes":               d.notes,
        "material_grade":      d.material_grade,
        "room_type":           d.room_type,
        "furniture_items":     d.furniture_items or [],
        "created_at":          d.created_at.isoformat() if d.created_at else None,
    }


@router.post("/generate", status_code=201)
async def generate_quote(
    body: GenerateQuoteRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — estimate materials, build line items, save draft quote."""
    result = await db.execute(
        select(Enquiry).where(Enquiry.id == body.enquiry_id)
    )
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.carpenter_id != carpenter.id:
        raise HTTPException(status_code=403, detail="Access denied")

    city = carpenter.city or "Mumbai"
    line_items: list[dict] = []
    subtotal = Decimal("0")

    for fi_input in body.furniture_items:
        try:
            estimate = await _estimator.estimate(
                fi_input.item_type,
                fi_input.config,
                city,
                fi_input.material_grade,
                db_session=db,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        line = _estimator.compute_final_price(
            estimate,
            labour_rate_per_sqft=body.labour_rate,
            margin_pct=body.margin_pct,
        )

        fi_row = FurnitureItem(
            enquiry_id=body.enquiry_id,
            item_type=fi_input.item_type,
            config=fi_input.config,
            material_breakdown=_breakdown_to_json(estimate.material_breakdown),
            material_cost=float(line.material_cost),
            labour_cost=float(line.labour_cost),
            margin_pct=float(line.margin / line.final_price * 100) if line.final_price else 0,
            final_price=float(line.final_price),
        )
        db.add(fi_row)
        subtotal += line.final_price

        line_items.append({
            "item_type": fi_input.item_type,
            "display_name": line.display_name,
            "material_cost": float(line.material_cost),
            "labour_cost": float(line.labour_cost),
            "margin": float(line.margin),
            "final_price": float(line.final_price),
            "notes": line.notes,
            "dimensions_display": estimate.dimensions_display,
            "material_breakdown": _breakdown_to_json(estimate.material_breakdown),
        })

    total_amount = subtotal  # no tax in v1
    advance_requested = _round_to_hundred(float(total_amount) * 0.35)

    seq_result = await db.execute(select(func.count()).select_from(Quote))
    seq = (seq_result.scalar() or 0) + 1
    year = datetime.now(timezone.utc).year
    quote_number = f"CIQ-{year}-{seq:05d}"
    share_token = secrets.token_urlsafe(16)

    quote = Quote(
        enquiry_id=body.enquiry_id,
        carpenter_id=carpenter.id,
        quote_number=quote_number,
        line_items=line_items,
        subtotal=float(subtotal),
        tax_amount=0,
        total_amount=float(total_amount),
        advance_requested=advance_requested,
        validity_days=7,
        notes=body.notes,
        status="draft",
        share_token=share_token,
    )
    db.add(quote)
    await db.commit()
    await db.refresh(quote)

    logger.info("Draft quote %s (%s) created for enquiry %s", quote_number, quote.id, body.enquiry_id)

    return _quote_to_dict(quote, line_items)


@router.get("/list/{enquiry_id}")
async def list_quotes_for_enquiry(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> list:
    """Private (JWT) — all quotes for a given enquiry."""
    import uuid as _uuid
    try:
        eid = _uuid.UUID(enquiry_id)
    except ValueError:
        return []

    result = await db.execute(
        select(Quote)
        .where(Quote.enquiry_id == eid, Quote.carpenter_id == carpenter.id)
        .order_by(Quote.created_at.desc())
    )
    quotes = result.scalars().all()
    return [
        {
            "id": str(q.id),
            "quote_number": q.quote_number,
            "status": q.status,
            "total_amount": float(q.total_amount or 0),
            "share_token": q.share_token,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        }
        for q in quotes
    ]


@router.get("/{quote_id}")
async def get_quote(
    quote_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — return quote with furniture items."""
    quote, _ = await _get_owned_quote(quote_id, carpenter, db)

    fi_result = await db.execute(
        select(FurnitureItem).where(FurnitureItem.enquiry_id == quote.enquiry_id)
    )
    items = fi_result.scalars().all()

    return {
        **_quote_to_dict(quote, quote.line_items or []),
        "furniture_items": [_fi_to_dict(fi) for fi in items],
    }


@router.put("/{quote_id}")
async def update_quote(
    quote_id: str,
    body: UpdateQuoteRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — edit draft quote fields; recalculates totals if margin_pct changes."""
    quote, _ = await _get_owned_quote(quote_id, carpenter, db)

    if quote.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Quote has already been {quote.status}. Only draft quotes can be edited.",
        )

    if body.notes is not None:
        quote.notes = body.notes
    if body.validity_days is not None:
        quote.validity_days = body.validity_days
    if body.advance_requested is not None:
        quote.advance_requested = body.advance_requested

    if body.margin_pct is not None:
        fi_result = await db.execute(
            select(FurnitureItem).where(FurnitureItem.enquiry_id == quote.enquiry_id)
        )
        items = list(fi_result.scalars().all())

        new_subtotal = Decimal("0")
        new_line_items: list[dict] = []

        for fi in items:
            mat = Decimal(str(fi.material_cost or 0))
            lab = Decimal(str(fi.labour_cost or 0))
            new_margin = ((mat + lab) * Decimal(str(body.margin_pct)) / 100).quantize(
                Decimal("1")
            )
            new_final = mat + lab + new_margin
            fi.margin_pct = body.margin_pct
            fi.final_price = float(new_final)
            new_subtotal += new_final

            existing = next(
                (li for li in (quote.line_items or []) if li.get("item_type") == fi.item_type),
                {},
            )
            new_line_items.append({
                **existing,
                "margin": float(new_margin),
                "final_price": float(new_final),
            })

        quote.line_items = new_line_items
        quote.subtotal = float(new_subtotal)
        quote.total_amount = float(new_subtotal)
        if body.advance_requested is None:
            quote.advance_requested = _round_to_hundred(float(new_subtotal) * 0.35)

    await db.commit()
    await db.refresh(quote)
    return _quote_to_dict(quote, quote.line_items or [])


@router.post("/{quote_id}/send")
async def send_quote(
    quote_id: str,
    body: SendQuoteRequest = None,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — generate PDF, create Razorpay link, mark quote sent.

    remove_hallmark=True removes the CarpentrIQ footer badge from the PDF.
    Requires a pdf_credit on the carpenter account (₹99/credit). Returns 402
    if no credits are available.
    """
    if body is None:
        body = SendQuoteRequest()

    # Quota gate: trial users capped at 3 quotes/month
    if not check_quote_send_quota(carpenter):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "quota_exceeded",
                "message": (
                    f"Monthly quote limit reached "
                    f"({carpenter.quotes_sent_this_month}/{carpenter.quotes_sent_limit_this_month}). "
                    "Upgrade your plan to send more quotes."
                ),
            },
        )

    quote, enquiry = await _get_owned_quote(quote_id, carpenter, db)

    if quote.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Quote is already '{quote.status}'. Only draft quotes can be sent.",
        )

    # Credit check before doing any work
    if body.remove_hallmark:
        if (carpenter.pdf_credits_remaining or 0) < 1:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "No PDF credits remaining.",
                    "message": (
                        "Buy a ₹99 credit at POST /carpenter/buy-pdf-credit "
                        "to remove the CarpentrIQ hallmark from this PDF."
                    ),
                },
            )
        carpenter.pdf_credits_remaining = (carpenter.pdf_credits_remaining or 0) - 1
        logger.info("PDF credit consumed for carpenter %s (remove_hallmark)", carpenter.id)

    # 1. Generate PDF
    pdf_url: str | None = None
    try:
        from app.services.pdf_generator import PDFGenerator
        quote_data = _quote_to_dict(quote, quote.line_items or [])
        quote_data["client_name"] = enquiry.client_name if enquiry else None
        quote_data["client_phone"] = enquiry.client_phone if enquiry else None
        quote_data["room_type"] = enquiry.room_type if enquiry else None
        carpenter_data = {
            "name": carpenter.name,
            "phone": carpenter.phone,
            "city": carpenter.city,
            "photo_url": carpenter.photo_url,
            "business_logo_url": carpenter.business_logo_url,
        }
        pdf_bytes = await PDFGenerator().generate_quote_pdf(
            quote_data, carpenter_data, show_hallmark=not body.remove_hallmark
        )
        pdf_path = f"quotes/{carpenter.id}/{quote.id}.pdf"
        pdf_url = await storage_service.upload(pdf_bytes, pdf_path, "application/pdf")
        quote.pdf_url = pdf_url
    except Exception as exc:
        logger.error("PDF generation failed for quote %s: %s", quote.id, exc)

    # 2. Create Razorpay payment link
    razorpay_link: str | None = None
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        try:
            razorpay_link = await _create_razorpay_link(quote, enquiry, carpenter)
        except Exception as exc:
            logger.error("Razorpay payment link failed for quote %s: %s", quote.id, exc)
    else:
        logger.info("Razorpay not configured — skipping payment link for quote %s", quote.id)

    # 3. Persist updates
    quote.status = "sent"
    quote.razorpay_payment_link = razorpay_link
    await increment_quote_sent(db, carpenter, quote.id, quote.enquiry_id)
    await db.commit()

    # 4. Email notification (non-blocking)
    if carpenter.email and settings.resend_api_key:
        client_name = enquiry.client_name if enquiry else "client"
        await _send_email(
            to=carpenter.email,
            subject=f"Quote #{quote.quote_number} sent to {client_name}",
            html=(
                f"<p>Your quote <strong>#{quote.quote_number}</strong> has been sent to "
                f"{client_name}.</p>"
                f"<p>Total: ₹{quote.total_amount:,.0f} | Advance: ₹{quote.advance_requested:,.0f}</p>"
            ),
        )

    logger.info("Quote %s (%s) sent", quote.quote_number, quote.id)

    return {
        "quote_id": str(quote.id),
        "share_token": quote.share_token,
        "pdf_url": pdf_url,
        "razorpay_payment_link": razorpay_link,
        "quote_number": quote.quote_number,
    }


# ── Public endpoints — NOTE: registered after private ones ───────────────────

@router.get("/{share_token}/view")
async def view_quote(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client views their quote; sets viewed_at on first view."""
    quote = await _get_quote_by_token(share_token, db)

    if quote.viewed_at is None:
        quote.viewed_at = datetime.now(timezone.utc)
        await db.commit()

    carp_result = await db.execute(
        select(Carpenter).where(Carpenter.id == quote.carpenter_id)
    )
    carpenter = carp_result.scalar_one_or_none()

    enq_result = await db.execute(
        select(Enquiry).where(Enquiry.id == quote.enquiry_id)
    )
    enquiry = enq_result.scalar_one_or_none()

    return {
        "quote_number": quote.quote_number,
        "status": quote.status,
        "created_at": quote.created_at.isoformat() if quote.created_at else None,
        "approved_at": quote.approved_at.isoformat() if quote.approved_at else None,
        "carpenter_name": carpenter.name if carpenter else None,
        "carpenter_phone": carpenter.phone if carpenter else None,
        "carpenter_city": carpenter.city if carpenter else None,
        "carpenter_photo_url": carpenter.photo_url if carpenter else None,
        "carpenter_whatsapp": carpenter.whatsapp_number if carpenter else (carpenter.phone if carpenter else None),
        "client_name": enquiry.client_name if enquiry else None,
        "room_type": enquiry.room_type if enquiry else None,
        "furniture_needed": enquiry.furniture_needed if enquiry else [],
        "line_items": quote.line_items or [],
        "subtotal": float(quote.subtotal or 0),
        "tax_amount": float(quote.tax_amount or 0),
        "total_amount": float(quote.total_amount or 0),
        "advance_requested": float(quote.advance_requested or 0),
        "validity_days": quote.validity_days,
        "notes": quote.notes,
        "razorpay_payment_link": quote.razorpay_payment_link,
        "valid_until": _valid_until(quote),
    }


@router.post("/{share_token}/approve")
async def approve_quote(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client approves quote; creates Job, notifies carpenter."""
    quote = await _get_quote_by_token(share_token, db)

    if quote.status == "approved":
        raise HTTPException(status_code=400, detail="Quote already approved.")

    if _is_expired(quote):
        raise HTTPException(status_code=400, detail="Quote has expired.")

    quote.status = "approved"
    quote.approved_at = datetime.now(timezone.utc)

    job = Job(
        quote_id=quote.id,
        carpenter_id=quote.carpenter_id,
        status="not_started",
    )
    db.add(job)

    enq_result = await db.execute(
        select(Enquiry).where(Enquiry.id == quote.enquiry_id)
    )
    enquiry = enq_result.scalar_one_or_none()
    if enquiry:
        enquiry.status = "approved"

    await db.commit()

    # Notify carpenter
    carp_result = await db.execute(
        select(Carpenter).where(Carpenter.id == quote.carpenter_id)
    )
    carpenter = carp_result.scalar_one_or_none()

    if carpenter and carpenter.email and settings.resend_api_key:
        enq_result = await db.execute(
            select(Enquiry).where(Enquiry.id == quote.enquiry_id)
        )
        enquiry = enq_result.scalar_one_or_none()
        client_name = enquiry.client_name if enquiry else "Your client"
        await _send_email(
            to=carpenter.email,
            subject=f"Client approved quote #{quote.quote_number}!",
            html=(
                f"<p><strong>{client_name}</strong> has approved your quote "
                f"<strong>#{quote.quote_number}</strong>.</p>"
                f"<p>Total: ₹{quote.total_amount:,.0f} | Advance: ₹{quote.advance_requested:,.0f}</p>"
            ),
        )

    carpenter_name = carpenter.name if carpenter else "your carpenter"
    return {
        "message": f"Quote approved! {carpenter_name} will contact you shortly.",
        "payment_link": quote.razorpay_payment_link,
    }


@router.post("/{share_token}/reject")
async def reject_quote(
    share_token: str,
    body: RejectQuoteRequest = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client rejects quote; notifies carpenter."""
    quote = await _get_quote_by_token(share_token, db)

    if quote.status in ("approved", "rejected"):
        raise HTTPException(
            status_code=400,
            detail=f"Quote is already '{quote.status}'.",
        )

    quote.status = "rejected"
    await db.commit()

    carp_result = await db.execute(
        select(Carpenter).where(Carpenter.id == quote.carpenter_id)
    )
    carpenter = carp_result.scalar_one_or_none()

    if carpenter and carpenter.email and settings.resend_api_key:
        reason_text = f"<p>Reason: {body.reason}</p>" if (body and body.reason) else ""
        await _send_email(
            to=carpenter.email,
            subject=f"Client rejected quote #{quote.quote_number}",
            html=(
                f"<p>A client has rejected quote <strong>#{quote.quote_number}</strong>.</p>"
                f"{reason_text}"
            ),
        )

    return {"message": "Feedback sent to your carpenter."}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_owned_quote(
    quote_id: str, carpenter: Carpenter, db: AsyncSession
) -> tuple[Quote, Enquiry | None]:
    try:
        q_uuid = UUID(quote_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid quote_id format")

    result = await db.execute(select(Quote).where(Quote.id == q_uuid))
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.carpenter_id != carpenter.id:
        raise HTTPException(status_code=403, detail="Access denied")

    enq_result = await db.execute(select(Enquiry).where(Enquiry.id == quote.enquiry_id))
    enquiry = enq_result.scalar_one_or_none()

    return quote, enquiry


async def _get_quote_by_token(share_token: str, db: AsyncSession) -> Quote:
    result = await db.execute(select(Quote).where(Quote.share_token == share_token))
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote


def _is_expired(quote: Quote) -> bool:
    if quote.created_at is None or quote.validity_days is None:
        return False
    expiry = quote.created_at + timedelta(days=quote.validity_days)
    return datetime.now(timezone.utc) > expiry


def _valid_until(quote: Quote) -> str | None:
    if quote.created_at is None or quote.validity_days is None:
        return None
    expiry = quote.created_at + timedelta(days=quote.validity_days)
    return expiry.isoformat()


def _round_to_hundred(amount: float) -> float:
    return round(amount / 100) * 100


def _breakdown_to_json(breakdown: list) -> list[dict]:
    return [
        {
            "name": line.name,
            "qty": line.qty,
            "unit": line.unit,
            "unit_price": float(line.unit_price),
            "total": float(line.total),
        }
        for line in breakdown
    ]


def _quote_to_dict(quote: Quote, line_items: list) -> dict:
    return {
        "id": str(quote.id),
        "quote_number": quote.quote_number,
        "status": quote.status,
        "share_token": quote.share_token,
        "line_items": line_items,
        "subtotal": float(quote.subtotal or 0),
        "tax_amount": float(quote.tax_amount or 0),
        "total_amount": float(quote.total_amount or 0),
        "advance_requested": float(quote.advance_requested or 0),
        "validity_days": quote.validity_days,
        "notes": quote.notes,
        "pdf_url": quote.pdf_url,
        "razorpay_payment_link": quote.razorpay_payment_link,
        "created_at": quote.created_at.isoformat() if quote.created_at else None,
    }


def _fi_to_dict(fi: FurnitureItem) -> dict:
    return {
        "id": str(fi.id),
        "item_type": fi.item_type,
        "config": fi.config,
        "material_cost": float(fi.material_cost or 0),
        "labour_cost": float(fi.labour_cost or 0),
        "margin_pct": float(fi.margin_pct or 0),
        "final_price": float(fi.final_price or 0),
        "material_breakdown": fi.material_breakdown or [],
    }


async def _create_razorpay_link(
    quote: Quote, enquiry: Enquiry | None, carpenter: Carpenter
) -> str:
    advance_paise = int((quote.advance_requested or 0) * 100)
    if advance_paise <= 0:
        raise ValueError("advance_requested must be > 0 to create payment link")

    furniture_str = ", ".join(enquiry.furniture_needed or []) if enquiry else "furniture"
    description = f"Advance: {furniture_str} - {carpenter.name}"

    expire_by = int(
        (datetime.now(timezone.utc) + timedelta(days=quote.validity_days or 7)).timestamp()
    )

    payload: dict[str, Any] = {
        "amount": advance_paise,
        "currency": "INR",
        "description": description[:255],
        "expire_by": expire_by,
        "notify": {"sms": False, "email": False},
        "notes": {
            "quote_id": str(quote.id),
            "carpenter_id": str(carpenter.id),
        },
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/payment_links",
            json=payload,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        )
        resp.raise_for_status()
        return resp.json()["short_url"]


async def _send_email(to: str, subject: str, html: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                json={
                    "from": settings.resend_from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
            resp.raise_for_status()
            logger.info("Email sent to %s: %s", to, subject)
    except Exception as exc:
        logger.error("Email send failed to %s: %s", to, exc)
