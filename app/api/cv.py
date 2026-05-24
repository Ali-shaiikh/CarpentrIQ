"""CV router — trigger and retrieve YOLOv8 room analysis.

Endpoints (JWT required):
  POST /cv/analyse/:enquiry_id  — download photos, run YOLOv8, cache and return results
  GET  /cv/result/:enquiry_id   — retrieve most recent cached CVResult
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.ml.room_analyser import RoomAnalyser
from app.models.carpenter import Carpenter
from app.models.enquiry import CVResult, Enquiry, EnquiryPhoto
from app.services.auth_service import auth_service

from app.dependencies import get_redis
from app.services.fal_service import edit_room_image_kontext, edit_room_image_kontext_multi
from app.services.furniture_prompt_builder import (
    build_complete_image_prompt,
    build_kontext_edit_prompt,
)
from app.services.furniture_scraper import get_furniture_images_for_items
from app.services.image_generation_service import generate_room_image
from app.services.replicate_service import gpt_image_2
from app.services.trial_subscription_service import (
    check_regenerate_cost,
    increment_regenerate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class RegenerateImageRequest(BaseModel):
    room_type: str = "living"
    room_dims: dict | None = None
    furniture_items: list[dict] = []
    material_grade: str = "standard"
    notes: str = ""
    mood_hint: str = ""
    confirmed: bool = False
    reference_room_url: str | None = None
    furniture_references: list[dict] = []
    mood_reference_url: str | None = None
    selected_style: str | None = None


@router.post("/regenerate-image")
async def regenerate_image(
    body: RegenerateImageRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    redis=Depends(get_redis),
) -> dict:
    """Private (JWT) — regenerate a room image using the regenerate quota (not image quota).

    Free regenerates: first N per month (plan-defined) are free.
    Paid regenerates: ₹10 each after free limit is exhausted.
    When cost > 0, the caller must send confirmed=True to proceed.
    Returns 402 with requires_confirmation=True if confirmation is needed.
    """
    cost_info = check_regenerate_cost(carpenter)

    if not cost_info["allowed"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "regenerate_blocked", "message": cost_info["message"]},
        )

    if not cost_info["free"] and not body.confirmed:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "confirmation_required",
                "requires_confirmation": True,
                "cost_inr": cost_info["cost_inr"],
                "message": cost_info["message"],
            },
        )

    button_scraped: dict[int, str] = {}
    notes_scraped: list[tuple[str, str]] = []
    remove_types: set[str] = set()
    if body.furniture_items or body.notes:
        try:
            button_scraped, notes_scraped, remove_types = await get_furniture_images_for_items(
                body.furniture_items, notes=body.notes, redis=redis
            )
        except Exception as exc:
            logger.warning("Furniture scrape failed (proceeding without): %s", exc)

    user_ref_urls: list[str] = []
    if body.mood_reference_url:
        user_ref_urls.append(body.mood_reference_url)
    for ref in (body.furniture_references or []):
        url = ref.get("url") if isinstance(ref, dict) else None
        if url and url not in user_ref_urls:
            user_ref_urls.append(url)

    base_offset = 1 + len(user_ref_urls)
    scraped_image_indices: dict[int, int] = {}
    scraped_urls_ordered: list[str] = []
    for item_idx, img_url in button_scraped.items():
        scraped_image_indices[item_idx] = base_offset + len(scraped_urls_ordered) + 1
        scraped_urls_ordered.append(img_url)

    notes_image_indices: list[tuple[str, int]] = []
    for label, img_url in notes_scraped:
        notes_image_indices.append((label, base_offset + len(scraped_urls_ordered) + 1))
        scraped_urls_ordered.append(img_url)

    all_ref_urls = user_ref_urls + scraped_urls_ordered

    prompt_furniture_items = [
        item for item in body.furniture_items
        if item.get("item_type") not in remove_types
    ]

    transform_prompt = build_kontext_edit_prompt(
        room_type=body.room_type,
        furniture_items=prompt_furniture_items,
        material_grade=body.material_grade,
        notes=body.notes,
        selected_style=body.selected_style,
        scraped_image_indices=scraped_image_indices if scraped_image_indices else None,
        notes_image_indices=notes_image_indices if notes_image_indices else None,
    )

    if body.reference_room_url:
        all_images = [body.reference_room_url] + all_ref_urls
        result = await edit_room_image_kontext_multi(all_images, transform_prompt)
        if "error" in result:
            logger.warning("Kontext multi failed, falling back to gpt-image-2: %s", result["error"])
            result = await gpt_image_2(
                prompt=transform_prompt,
                image_url=body.reference_room_url,
                extra_image_urls=all_ref_urls or None,
            )
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
    else:
        result = await gpt_image_2(
            prompt=transform_prompt,
            extra_image_urls=all_ref_urls or None,
        )
        if "error" in result:
            logger.warning("gpt-image-2 fresh gen failed, falling back to DALL-E 3: %s", result["error"])
            fallback_prompt = build_complete_image_prompt(
                room_type=body.room_type,
                dims=body.room_dims,
                furniture_items=body.furniture_items,
                material_grade=body.material_grade,
                notes=body.notes,
                selected_style=body.selected_style,
            )
            result = await generate_room_image(fallback_prompt)

    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    await increment_regenerate(db, carpenter, cost_inr=cost_info["cost_inr"])
    await db.commit()

    logger.info(
        "Room image regenerated for carpenter %s (free=%s cost=₹%d %.1fs)",
        carpenter.id, cost_info["free"], cost_info["cost_inr"], result["generation_time"],
    )

    return {
        "image_url": result["image_url"],
        "revised_prompt": result["revised_prompt"],
        "generation_time": result["generation_time"],
        "cost_inr": cost_info["cost_inr"],
        "regenerates_used": carpenter.regenerates_used_this_month,
        "regenerates_free_limit": carpenter.regenerates_free_limit,
    }


@router.post("/analyse/{enquiry_id}")
async def analyse(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — download enquiry photos, run YOLOv8, return dimension estimate."""
    try:
        eq_uuid = UUID(enquiry_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid enquiry_id format")

    result = await db.execute(select(Enquiry).where(Enquiry.id == eq_uuid))
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.carpenter_id != carpenter.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if enquiry.status != "photos_uploaded":
        raise HTTPException(
            status_code=400,
            detail=f"Expected status 'photos_uploaded', got '{enquiry.status}'.",
        )

    photos_q = await db.execute(
        select(EnquiryPhoto)
        .where(EnquiryPhoto.enquiry_id == eq_uuid)
        .order_by(EnquiryPhoto.upload_order)
    )
    photos = list(photos_q.scalars().all())
    if not photos:
        raise HTTPException(status_code=400, detail="No photos found for this enquiry")

    local_paths: list[str] = []
    photo_ids: list[UUID] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for photo in photos:
            try:
                resp = await client.get(photo.storage_url)
                resp.raise_for_status()
                ext = _ext_from_content_type(resp.headers.get("content-type", ""))
                tmp_path = f"/tmp/cv_{photo.image_hash or str(photo.id)}.{ext}"
                Path(tmp_path).write_bytes(resp.content)
                local_paths.append(tmp_path)
                photo_ids.append(photo.id)
            except Exception as exc:
                logger.warning("Photo download failed %s: %s", photo.id, exc)

    if not local_paths:
        raise HTTPException(status_code=502, detail="Could not download any photos for analysis")

    try:
        analysis = await RoomAnalyser().analyse_enquiry_photos(local_paths, photo_ids, db)
    finally:
        for p in local_paths:
            try:
                os.unlink(p)
            except OSError:
                pass

    return {
        "width_mm": analysis.width_mm,
        "length_mm": analysis.length_mm,
        "height_mm": analysis.height_mm,
        "confidence_score": analysis.confidence_score,
        "needs_manual_check": analysis.needs_manual_check,
        "message_for_carpenter": analysis.message_for_carpenter,
        "detected_objects": analysis.detected_objects,
        "reference_used": analysis.reference_used,
    }


@router.get("/result/{enquiry_id}")
async def get_result(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — return most recent CVResult for the enquiry."""
    try:
        eq_uuid = UUID(enquiry_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid enquiry_id format")

    result = await db.execute(select(Enquiry).where(Enquiry.id == eq_uuid))
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.carpenter_id != carpenter.id:
        raise HTTPException(status_code=403, detail="Access denied")

    photos_q = await db.execute(
        select(EnquiryPhoto.id).where(EnquiryPhoto.enquiry_id == eq_uuid)
    )
    photo_ids = [row[0] for row in photos_q.all()]

    if not photo_ids:
        return {"status": "not_analysed", "message": "Click Analyse to process photos."}

    cv_q = await db.execute(
        select(CVResult)
        .where(CVResult.enquiry_photo_id.in_(photo_ids))
        .order_by(CVResult.created_at.desc())
        .limit(1)
    )
    cv = cv_q.scalars().first()

    if cv is None:
        return {"status": "not_analysed", "message": "Click Analyse to process photos."}

    return {
        "status": "analysed",
        "room_width_mm": cv.room_width_mm,
        "room_length_mm": cv.room_length_mm,
        "room_height_mm": cv.room_height_mm,
        "confidence_score": float(cv.confidence_score) if cv.confidence_score is not None else None,
        "detected_objects": cv.detected_objects,
        "created_at": cv.created_at.isoformat() if cv.created_at else None,
    }


def _ext_from_content_type(content_type: str) -> str:
    if "png" in content_type:
        return "png"
    if "webp" in content_type:
        return "webp"
    return "jpg"
