"""Public carpenter profile — portfolio, reviews, and review submission."""

import hashlib
import logging
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import auth_service
from app.models.carpenter import Carpenter
from app.models.portfolio import CarpenterPortfolio, CarpenterReview
from app.models.quote import Quote
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PORTFOLIO_PHOTOS = 20
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


# ── Public profile ─────────────────────────────────────────────────────────────

@router.get("/{slug}")
async def get_public_profile(slug: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Public — full carpenter profile for the share-link page."""
    result = await db.execute(
        select(Carpenter).where(func.lower(Carpenter.quote_link_slug) == slug.lower())
    )
    carpenter = result.scalar_one_or_none()
    if not carpenter:
        raise HTTPException(status_code=404, detail="Profile not found.")

    # Portfolio photos
    portfolio_result = await db.execute(
        select(CarpenterPortfolio)
        .where(CarpenterPortfolio.carpenter_id == carpenter.id)
        .order_by(CarpenterPortfolio.upload_order, CarpenterPortfolio.created_at)
    )
    photos = portfolio_result.scalars().all()

    # Reviews
    reviews_result = await db.execute(
        select(CarpenterReview)
        .where(CarpenterReview.carpenter_id == carpenter.id)
        .order_by(CarpenterReview.created_at.desc())
    )
    reviews = reviews_result.scalars().all()

    # Aggregate rating
    avg_rating = None
    review_count = len(reviews)
    if reviews:
        avg_rating = round(sum(r.rating for r in reviews) / review_count, 1)

    return {
        "slug": carpenter.quote_link_slug,
        "name": carpenter.name,
        "city": carpenter.city,
        "photo_url": carpenter.photo_url,
        "business_logo_url": carpenter.business_logo_url,
        "speciality": carpenter.speciality or [],
        "whatsapp_number": carpenter.whatsapp_number,
        "avg_rating": avg_rating,
        "review_count": review_count,
        "portfolio": [
            {
                "id": str(p.id),
                "image_url": p.image_url,
                "caption": p.caption,
                "item_type": p.item_type,
            }
            for p in photos
        ],
        "reviews": [
            {
                "id": str(r.id),
                "client_name": r.client_name,
                "rating": r.rating,
                "review_text": r.review_text,
                "is_verified": r.is_verified,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ],
    }


# ── Public review submission ───────────────────────────────────────────────────

class ReviewBody(BaseModel):
    client_name: str = Field(..., min_length=2, max_length=100)
    rating: int = Field(..., ge=1, le=5)
    review_text: str | None = Field(None, max_length=500)


@router.post("/{slug}/review", status_code=201)
async def submit_review(
    slug: str,
    body: ReviewBody,
    quote_token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Public — client submits a review. Optionally verified via quote share_token."""
    result = await db.execute(
        select(Carpenter).where(func.lower(Carpenter.quote_link_slug) == slug.lower())
    )
    carpenter = result.scalar_one_or_none()
    if not carpenter:
        raise HTTPException(status_code=404, detail="Profile not found.")

    quote_id = None
    is_verified = False

    if quote_token:
        q_result = await db.execute(
            select(Quote).where(
                Quote.share_token == quote_token,
                Quote.carpenter_id == carpenter.id,
            )
        )
        quote = q_result.scalar_one_or_none()
        if quote:
            quote_id = quote.id
            is_verified = True

            # Prevent duplicate verified review for same quote
            existing = await db.execute(
                select(CarpenterReview).where(CarpenterReview.quote_id == quote_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Review already submitted for this quote.")

    review = CarpenterReview(
        carpenter_id=carpenter.id,
        quote_id=quote_id,
        client_name=body.client_name.strip(),
        rating=body.rating,
        review_text=(body.review_text or "").strip() or None,
        is_verified=is_verified,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    return {"id": str(review.id), "is_verified": is_verified}


# ── Portfolio management (private — JWT required) ──────────────────────────────

@router.get("/me/portfolio")
async def list_portfolio(
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Private — list own portfolio photos."""
    result = await db.execute(
        select(CarpenterPortfolio)
        .where(CarpenterPortfolio.carpenter_id == carpenter.id)
        .order_by(CarpenterPortfolio.upload_order, CarpenterPortfolio.created_at)
    )
    photos = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "image_url": p.image_url,
            "caption": p.caption,
            "item_type": p.item_type,
            "upload_order": p.upload_order,
        }
        for p in photos
    ]


@router.post("/me/portfolio", status_code=201)
async def upload_portfolio_photo(
    photo: UploadFile = File(...),
    caption: str | None = None,
    item_type: str | None = None,
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Private — upload a portfolio photo (max 20)."""
    count_result = await db.execute(
        select(func.count()).where(CarpenterPortfolio.carpenter_id == carpenter.id)
    )
    count = count_result.scalar() or 0
    if count >= MAX_PORTFOLIO_PHOTOS:
        raise HTTPException(status_code=422, detail=f"Maximum {MAX_PORTFOLIO_PHOTOS} portfolio photos allowed.")

    content_type = (photo.content_type or "").lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=422, detail="Only JPG, PNG, or WebP images are accepted.")

    file_bytes = await photo.read()
    if len(file_bytes) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=422, detail="Photo must be under 5 MB.")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    image_hash = hashlib.sha256(file_bytes).hexdigest()[:16]
    storage_path = f"portfolio/{carpenter.id}/{image_hash}.{ext}"

    try:
        image_url = await storage_service.upload(file_bytes, storage_path, content_type)
    except Exception as exc:
        logger.error("Portfolio upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    portfolio_item = CarpenterPortfolio(
        carpenter_id=carpenter.id,
        image_url=image_url,
        storage_path=storage_path,
        caption=caption,
        item_type=item_type,
        upload_order=count,
    )
    db.add(portfolio_item)
    await db.commit()
    await db.refresh(portfolio_item)

    return {
        "id": str(portfolio_item.id),
        "image_url": portfolio_item.image_url,
        "caption": portfolio_item.caption,
        "item_type": portfolio_item.item_type,
    }


@router.delete("/me/portfolio/{photo_id}", status_code=204)
async def delete_portfolio_photo(
    photo_id: str,
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Private — delete a portfolio photo."""
    result = await db.execute(
        select(CarpenterPortfolio).where(
            CarpenterPortfolio.id == photo_id,
            CarpenterPortfolio.carpenter_id == carpenter.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Photo not found.")

    if item.storage_path:
        try:
            await storage_service.delete(item.storage_path)
        except Exception as exc:
            logger.warning("Storage delete failed for %s: %s", item.storage_path, exc)

    await db.delete(item)
    await db.commit()


# ── My reviews (private) ───────────────────────────────────────────────────────

@router.get("/me/reviews")
async def list_reviews(
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Private — list all reviews received by the carpenter."""
    result = await db.execute(
        select(CarpenterReview)
        .where(CarpenterReview.carpenter_id == carpenter.id)
        .order_by(CarpenterReview.created_at.desc())
    )
    reviews = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "client_name": r.client_name,
            "rating": r.rating,
            "review_text": r.review_text,
            "is_verified": r.is_verified,
            "created_at": r.created_at.isoformat(),
        }
        for r in reviews
    ]
