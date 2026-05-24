"""Enquiry router — public client form + private carpenter list.

Client endpoints (NO login required — share_token = client session):
  GET  /enquiry/form/{slug}        — client loads form for carpenter
  POST /enquiry/submit             — client submits enquiry
  POST /enquiry/{enquiry_id}/photos — client uploads room photos
  GET  /enquiry/{share_token}      — client polls status

Carpenter endpoints (JWT required):
  GET  /enquiry/list               — carpenter sees their enquiries (paginated)
"""

from __future__ import annotations

import hashlib
import logging
import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.enquiry import Enquiry, EnquiryPhoto
from app.models.material import FurnitureCatalogue
from app.models.quote import Quote
from app.services.auth_service import auth_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()

_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
_VALID_ROOM_TYPES = {"bedroom", "living", "kitchen", "dining", "study"}
_ACCEPTED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTOS_PER_ENQUIRY = 8
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


# ── Schemas ───────────────────────────────────────────────────────────────────

class SubmitEnquiryRequest(BaseModel):
    carpenter_slug: str
    client_name: str
    client_phone: str
    room_type: str
    furniture_needed: list[str]
    room_notes: str | None = None

    @field_validator("client_name")
    @classmethod
    def name_min_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator("client_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _INDIAN_MOBILE_RE.match(v):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return v

    @field_validator("room_type")
    @classmethod
    def validate_room_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in _VALID_ROOM_TYPES:
            raise ValueError(f"room_type must be one of: {', '.join(sorted(_VALID_ROOM_TYPES))}")
        return v

    @field_validator("furniture_needed")
    @classmethod
    def at_least_one_item(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Select at least one furniture item")
        return v

    @field_validator("room_notes")
    @classmethod
    def notes_max_length(cls, v: str | None) -> str | None:
        if v and len(v) > 500:
            raise ValueError("Notes must be under 500 characters")
        return v


# ── Endpoints — PUBLIC ────────────────────────────────────────────────────────

@router.get("/form/{slug}")
async def get_client_form(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — load carpenter's client-facing enquiry form."""
    result = await db.execute(
        select(Carpenter).where(
            func.lower(Carpenter.quote_link_slug) == slug.lower()
        )
    )
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Link not found",
                "message": "Ask your carpenter for a new link.",
            },
        )

    cat_result = await db.execute(
        select(FurnitureCatalogue)
        .where(FurnitureCatalogue.is_active)
        .order_by(FurnitureCatalogue.sort_order)
    )
    catalogue = cat_result.scalars().all()

    return {
        "carpenter_name": carpenter.name,
        "carpenter_photo_url": carpenter.photo_url,
        "carpenter_city": carpenter.city,
        "speciality": carpenter.speciality or [],
        "furniture_types": [
            {
                "item_type": item.item_type,
                "display_name": item.display_name,
                "thumbnail_url": item.thumbnail_url,
            }
            for item in catalogue
        ],
    }


@router.post("/submit", status_code=201)
async def submit_enquiry(
    body: SubmitEnquiryRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client submits an enquiry for a carpenter."""
    result = await db.execute(
        select(Carpenter).where(
            func.lower(Carpenter.quote_link_slug) == body.carpenter_slug.lower()
        )
    )
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        raise HTTPException(status_code=404, detail="Carpenter not found")

    share_token = secrets.token_urlsafe(9)  # 12-char URL-safe string

    enquiry = Enquiry(
        carpenter_id=carpenter.id,
        client_name=body.client_name,
        client_phone=body.client_phone,
        room_type=body.room_type,
        furniture_needed=body.furniture_needed,
        room_notes=body.room_notes,
        status="new",
        share_token=share_token,
    )
    db.add(enquiry)
    await db.commit()
    await db.refresh(enquiry)

    logger.info("New enquiry %s for carpenter %s", enquiry.id, carpenter.id)

    return {
        "enquiry_id": str(enquiry.id),
        "share_token": share_token,
        "message": (
            f"Request sent! Upload photos of your room to help "
            f"{carpenter.name} quote accurately."
        ),
        "upload_url": f"/enquiry/{enquiry.id}/photos",
    }


@router.post("/{enquiry_id}/photos", status_code=201)
async def upload_photos(
    enquiry_id: str,
    photos: list[UploadFile] = File(..., description="Room photos (jpg/png/webp, max 5 MB each)"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client uploads room photos. Appends to existing; max 8 total per enquiry."""
    if not photos:
        raise HTTPException(status_code=422, detail="At least one photo is required")

    result = await db.execute(
        select(Enquiry).where(Enquiry.id == enquiry_id)
    )
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Count existing photos so we can append without exceeding the cap
    count_result = await db.execute(
        select(func.count()).where(EnquiryPhoto.enquiry_id == enquiry.id)
    )
    existing_count = count_result.scalar() or 0

    if existing_count >= MAX_PHOTOS_PER_ENQUIRY:
        raise HTTPException(
            status_code=400,
            detail=f"This enquiry already has {existing_count} photos (maximum {MAX_PHOTOS_PER_ENQUIRY}).",
        )

    slots_remaining = MAX_PHOTOS_PER_ENQUIRY - existing_count
    if len(photos) > slots_remaining:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {slots_remaining} more photo(s) allowed "
                f"(max {MAX_PHOTOS_PER_ENQUIRY} total)."
            ),
        )

    uploaded = []
    for idx, upload in enumerate(photos):
        content_type = (upload.content_type or "").lower()
        if content_type not in _ACCEPTED_MIME:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{content_type}'. Accepted: jpg, png, webp.",
            )

        # Reject early if Content-Length header already signals oversize
        declared_size = upload.size  # FastAPI populates this from the multipart header
        if declared_size is not None and declared_size > MAX_PHOTO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Photo {idx + 1} is too large. Maximum size is 5 MB.",
            )

        file_bytes = await upload.read()
        if len(file_bytes) > MAX_PHOTO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Photo {idx + 1} is too large. Maximum size is 5 MB.",
            )

        image_hash = hashlib.sha256(file_bytes).hexdigest()
        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
        order = existing_count + idx
        storage_path = f"{enquiry.carpenter_id}/{enquiry_id}/photo_{order}.{ext}"

        try:
            storage_url = await storage_service.upload(file_bytes, storage_path, content_type)
        except Exception as exc:
            logger.error("Upload failed enquiry %s photo %d: %s", enquiry_id, order, exc)
            raise HTTPException(status_code=502, detail="Photo upload failed — please try again")

        photo_row = EnquiryPhoto(
            enquiry_id=enquiry.id,
            storage_url=storage_url,
            image_hash=image_hash,
            photo_type="room",
            upload_order=order,
        )
        db.add(photo_row)
        uploaded.append(storage_url)

    enquiry.status = "photos_uploaded"
    await db.commit()

    total = existing_count + len(uploaded)
    logger.info("Enquiry %s: %d photo(s) uploaded (%d total)", enquiry_id, len(uploaded), total)

    return {
        "photos_uploaded": len(uploaded),
        "total_photos": total,
        "enquiry_id": enquiry_id,
        "message": "Photos received! Your carpenter will review and send a quote.",
    }


@router.get("/list")
async def list_enquiries(
    page: int = Query(default=1, ge=1),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — carpenter's paginated enquiry list, 20 per page."""
    PAGE_SIZE = 20
    offset = (page - 1) * PAGE_SIZE

    query = select(Enquiry).where(Enquiry.carpenter_id == carpenter.id)
    if status_filter:
        query = query.where(Enquiry.status == status_filter)
    query = query.order_by(Enquiry.created_at.desc()).offset(offset).limit(PAGE_SIZE)

    result = await db.execute(query)
    enquiries = result.scalars().all()

    # Single query: photo counts for all returned enquiries at once
    ids = [e.id for e in enquiries]
    photo_counts: dict = {}
    if ids:
        counts_result = await db.execute(
            select(EnquiryPhoto.enquiry_id, func.count().label("cnt"))
            .where(EnquiryPhoto.enquiry_id.in_(ids))
            .group_by(EnquiryPhoto.enquiry_id)
        )
        photo_counts = {row.enquiry_id: row.cnt for row in counts_result.all()}

    return {
        "page": page,
        "page_size": PAGE_SIZE,
        "enquiries": [
            {
                "id": str(e.id),
                "client_name": e.client_name,
                "client_phone": e.client_phone,
                "room_type": e.room_type,
                "furniture_needed": e.furniture_needed or [],
                "photo_count": photo_counts.get(e.id, 0),
                "status": e.status,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in enquiries
        ],
    }


@router.get("/by-id/{enquiry_id}")
async def get_enquiry_by_id(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — carpenter fetches a single enquiry with photos."""
    import uuid as _uuid
    try:
        eid = _uuid.UUID(enquiry_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid enquiry ID")

    result = await db.execute(
        select(Enquiry).where(Enquiry.id == eid, Enquiry.carpenter_id == carpenter.id)
    )
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    photos_result = await db.execute(
        select(EnquiryPhoto).where(EnquiryPhoto.enquiry_id == enquiry.id)
        .order_by(EnquiryPhoto.upload_order)
    )
    photos = photos_result.scalars().all()

    return {
        "id": str(enquiry.id),
        "client_name": enquiry.client_name,
        "client_phone": enquiry.client_phone,
        "room_type": enquiry.room_type,
        "furniture_needed": enquiry.furniture_needed or [],
        "room_notes": enquiry.room_notes,
        "status": enquiry.status,
        "share_token": enquiry.share_token,
        "created_at": enquiry.created_at.isoformat() if enquiry.created_at else None,
        "photos": [
            {
                "id": str(p.id),
                "storage_url": p.storage_url,
                "photo_type": p.photo_type,
                "upload_order": p.upload_order,
            }
            for p in photos
        ],
    }


# NOTE: this route must be LAST — /{share_token} would otherwise match /list and /form
@router.get("/{share_token}")
async def get_status(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public — client polls enquiry status by share_token."""
    result = await db.execute(
        select(Enquiry).where(Enquiry.share_token == share_token)
    )
    enquiry = result.scalar_one_or_none()
    if enquiry is None:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Look up carpenter name
    carp_result = await db.execute(
        select(Carpenter).where(Carpenter.id == enquiry.carpenter_id)
    )
    carpenter = carp_result.scalar_one_or_none()

    # Include quote link only once the quote has been sent
    quote_link = None
    if enquiry.status in ("quoted", "approved", "in_progress", "completed"):
        quote_result = await db.execute(
            select(Quote).where(Quote.enquiry_id == enquiry.id)
            .order_by(Quote.created_at.desc())
        )
        quote = quote_result.scalars().first()
        if quote and quote.share_token:
            quote_link = f"/quote/{quote.share_token}/view"

    return {
        "status": enquiry.status,
        "carpenter_name": carpenter.name if carpenter else None,
        "furniture_needed": enquiry.furniture_needed or [],
        "last_updated": enquiry.created_at.isoformat() if enquiry.created_at else None,
        "quote_link": quote_link,
    }
