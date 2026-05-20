"""Carpenter router — JWT-protected profile, dashboard, and credit purchase.

Endpoints:
  GET  /carpenter/me                — current carpenter profile
  PUT  /carpenter/profile           — update name, city, photo_url, business_logo_url, etc.
  GET  /carpenter/dashboard         — summary stats (enquiries, quotes, revenue)
  POST /carpenter/buy-pdf-credit    — create ₹99 Razorpay payment link for 1 PDF credit
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.enquiry import Enquiry
from app.models.portfolio import CarpenterPortfolio, CarpenterReview
from app.models.quote import Quote
from app.services.auth_service import auth_service

PDF_CREDIT_PRICE_INR = 99

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/directory")
async def get_directory(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Public — list all carpenters for the community explore page.
    Returns profile, portfolio preview, and rating. Never exposes phone numbers.
    """
    result = await db.execute(
        select(Carpenter).where(
            Carpenter.name != "",
            Carpenter.quote_link_slug.isnot(None),
        ).order_by(Carpenter.created_at.desc())
    )
    carpenters = result.scalars().all()

    output = []
    for c in carpenters:
        photos_result = await db.execute(
            select(CarpenterPortfolio)
            .where(CarpenterPortfolio.carpenter_id == c.id)
            .order_by(CarpenterPortfolio.upload_order, CarpenterPortfolio.created_at)
            .limit(4)
        )
        photos = photos_result.scalars().all()

        rating_result = await db.execute(
            select(func.count(CarpenterReview.id), func.avg(CarpenterReview.rating))
            .where(CarpenterReview.carpenter_id == c.id)
        )
        review_count, avg_rating = rating_result.one()

        output.append({
            "slug": c.quote_link_slug,
            "name": c.name,
            "city": c.city,
            "photo_url": c.photo_url,
            "speciality": c.speciality or [],
            "avg_rating": round(float(avg_rating), 1) if avg_rating else None,
            "review_count": int(review_count) if review_count else 0,
            "portfolio_count": len(photos),
            "hero_image": photos[0].image_url if photos else None,
            "portfolio_preview": [p.image_url for p in photos[:3]],
        })

    return output


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    business_name: str | None = None
    city: str | None = None
    email: str | None = None
    whatsapp_number: str | None = None
    speciality: list[str] | None = None
    experience: str | None = None            # "1-3"|"3-7"|"7-15"|"15+"
    labour_rate_sqft: float | None = None   # ₹ per sqft, overrides default in quotes
    upi_id: str | None = None
    bio: str | None = None
    quote_link_slug: str | None = None
    photo_url: str | None = None
    business_logo_url: str | None = None


@router.get("/check-slug/{slug}")
async def check_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — check if a slug is available (excluding current carpenter)."""
    conflict = await db.execute(
        select(Carpenter).where(
            func.lower(Carpenter.quote_link_slug) == slug.lower(),
            Carpenter.id != carpenter.id,
        )
    )
    return {"available": conflict.scalar_one_or_none() is None}


@router.get("/me")
async def get_me(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — return current carpenter's profile."""
    return _carpenter_to_dict(carpenter)


@router.put("/profile")
async def update_profile(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — update mutable profile fields. Only supplied fields are changed."""
    if body.name is not None:
        carpenter.name = body.name.strip()
    if body.business_name is not None:
        carpenter.business_name = body.business_name.strip() or None
    if body.city is not None:
        carpenter.city = body.city.strip()
    if body.email is not None:
        carpenter.email = body.email.strip() or None
    if body.whatsapp_number is not None:
        carpenter.whatsapp_number = body.whatsapp_number.strip() or None
    if body.speciality is not None:
        carpenter.speciality = body.speciality
    if body.experience is not None:
        carpenter.experience = body.experience.strip() or None
    if body.labour_rate_sqft is not None:
        carpenter.labour_rate_sqft = body.labour_rate_sqft if body.labour_rate_sqft > 0 else None
    if body.upi_id is not None:
        carpenter.upi_id = body.upi_id.strip() or None
    if body.bio is not None:
        carpenter.bio = body.bio.strip() or None
    if body.photo_url is not None:
        carpenter.photo_url = body.photo_url.strip() or None
    if body.business_logo_url is not None:
        carpenter.business_logo_url = body.business_logo_url.strip() or None

    if body.quote_link_slug is not None:
        slug = body.quote_link_slug.strip().lower()
        # Uniqueness check excluding self
        conflict = await db.execute(
            select(Carpenter).where(
                func.lower(Carpenter.quote_link_slug) == slug,
                Carpenter.id != carpenter.id,
            )
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="This slug is already taken.")
        carpenter.quote_link_slug = slug

    await db.commit()
    await db.refresh(carpenter)
    return _carpenter_to_dict(carpenter)


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — aggregate stats for the carpenter's home screen."""
    eq_counts = await db.execute(
        select(Enquiry.status, func.count().label("cnt"))
        .where(Enquiry.carpenter_id == carpenter.id)
        .group_by(Enquiry.status)
    )
    enquiry_by_status: dict[str, int] = {row.status: row.cnt for row in eq_counts.all()}

    quote_counts = await db.execute(
        select(Quote.status, func.count().label("cnt"))
        .where(Quote.carpenter_id == carpenter.id)
        .group_by(Quote.status)
    )
    quote_by_status: dict[str, int] = {row.status: row.cnt for row in quote_counts.all()}

    new_this_week = await db.execute(
        select(func.count())
        .select_from(Enquiry)
        .where(
            Enquiry.carpenter_id == carpenter.id,
            Enquiry.created_at >= datetime.now(timezone.utc) - timedelta(days=7),
        )
    )

    return {
        "carpenter_id": str(carpenter.id),
        "name": carpenter.name,
        "plan": carpenter.plan,
        "trial_ends_at": carpenter.trial_ends_at.isoformat() if carpenter.trial_ends_at else None,
        "pdf_credits_remaining": carpenter.pdf_credits_remaining or 0,
        "total_quotes_sent": carpenter.total_quotes_sent or 0,
        "total_revenue_processed": float(carpenter.total_revenue_processed or 0),
        "enquiries": {
            "total": sum(enquiry_by_status.values()),
            "new_this_week": new_this_week.scalar() or 0,
            "by_status": enquiry_by_status,
        },
        "quotes": {
            "total": sum(quote_by_status.values()),
            "by_status": quote_by_status,
        },
    }


@router.post("/buy-pdf-credit", status_code=201)
async def buy_pdf_credit(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — create a ₹99 Razorpay payment link for one PDF credit.

    The hallmark-free badge type is stored in Razorpay notes so the webhook
    can identify and credit the account on payment.captured.
    """
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=503,
            detail="Payment gateway not configured. Contact support.",
        )

    amount_paise = PDF_CREDIT_PRICE_INR * 100
    expire_by = int((datetime.now(timezone.utc) + timedelta(days=1)).timestamp())

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.razorpay.com/v1/payment_links",
                json={
                    "amount": amount_paise,
                    "currency": "INR",
                    "description": "CarpentrIQ — Hallmark-free PDF credit (×1)",
                    "expire_by": expire_by,
                    "notify": {"sms": False, "email": False},
                    "notes": {
                        "type": "pdf_credit",
                        "carpenter_id": str(carpenter.id),
                        "credits": 1,
                    },
                },
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            )
            resp.raise_for_status()
            payment_link = resp.json()["short_url"]
    except Exception as exc:
        logger.error("Razorpay link creation failed for carpenter %s: %s", carpenter.id, exc)
        raise HTTPException(status_code=502, detail="Could not create payment link. Please retry.")

    logger.info("PDF credit payment link created for carpenter %s", carpenter.id)

    return {
        "payment_link": payment_link,
        "amount_inr": PDF_CREDIT_PRICE_INR,
        "credits_to_receive": 1,
        "current_credits": carpenter.pdf_credits_remaining or 0,
        "message": (
            f"Pay ₹{PDF_CREDIT_PRICE_INR} to remove the CarpentrIQ hallmark from one PDF. "
            "Your credit will be added automatically after payment."
        ),
    }


def _carpenter_to_dict(c: Carpenter) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "business_name": c.business_name,
        "phone": c.phone,
        "email": c.email,
        "city": c.city,
        "photo_url": c.photo_url,
        "business_logo_url": c.business_logo_url,
        "whatsapp_number": c.whatsapp_number,
        "speciality": c.speciality or [],
        "experience": c.experience,
        "labour_rate_sqft": float(c.labour_rate_sqft) if c.labour_rate_sqft else None,
        "upi_id": c.upi_id,
        "bio": c.bio,
        "plan": c.plan,
        "subscription_plan": c.subscription_plan,
        "quote_link_slug": c.quote_link_slug,
        "trial_ends_at": c.trial_ends_at.isoformat() if c.trial_ends_at else None,
        "subscription_expires_at": (
            c.subscription_expires_at.isoformat() if c.subscription_expires_at else None
        ),
        "total_quotes_sent": c.total_quotes_sent or 0,
        "total_revenue_processed": float(c.total_revenue_processed or 0),
        "pdf_credits_remaining": c.pdf_credits_remaining or 0,
        # monthly quota fields (used by frontend for send-button gating)
        "images_used_this_month": c.images_used_this_month,
        "images_limit_this_month": c.images_limit_this_month,
        "quotes_sent_this_month": c.quotes_sent_this_month,
        "quotes_sent_limit_this_month": c.quotes_sent_limit_this_month,
        "regenerates_used_this_month": c.regenerates_used_this_month,
        "regenerates_free_limit": c.regenerates_free_limit,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
