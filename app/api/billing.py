"""Billing router — subscription management.

POST /billing/create-upgrade-link   (JWT required) — legacy one-time payment link
POST /billing/create-subscription   (JWT required) — Razorpay recurring subscription
POST /billing/cancel-subscription   (JWT required) — cancel auto-renewal
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.carpenter import Carpenter
from app.services.auth_service import auth_service
from app.services.razorpay_subscription_service import (
    cancel_subscription,
    create_subscription,
)
from app.services.trial_subscription_service import PLAN_PRICES_INR

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSubscriptionRequest(BaseModel):
    plan_type: str  # "basic_499" | "pro_799" | "premium_999"


@router.get("/usage")
async def get_usage(
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Private (JWT) — return this month's usage stats for the current carpenter."""
    plan = carpenter.subscription_plan or carpenter.plan or "free_trial"
    price_inr = PLAN_PRICES_INR.get(plan, 0)

    paid_regenerates = max(
        0, carpenter.regenerates_used_this_month - carpenter.regenerates_free_limit
    )

    return {
        "plan": plan,
        "subscription_expires_at": (
            carpenter.subscription_expires_at.isoformat()
            if carpenter.subscription_expires_at else None
        ),
        "next_payment_date": (
            carpenter.next_payment_date.isoformat()
            if carpenter.next_payment_date else None
        ),
        "next_payment_amount_inr": price_inr,
        "images": {
            "used": carpenter.images_used_this_month,
            "limit": carpenter.images_limit_this_month,
        },
        "quotes": {
            "sent_this_month": carpenter.quotes_sent_this_month,
            "limit": carpenter.quotes_sent_limit_this_month,
        },
        "regenerates": {
            "used": carpenter.regenerates_used_this_month,
            "free_limit": carpenter.regenerates_free_limit,
            "paid_used": paid_regenerates,
            "paid_cost_total_inr": paid_regenerates * 10,
            "cost_per_paid_inr": 10,
        },
    }


@router.post("/create-subscription")
async def create_subscription_endpoint(
    body: CreateSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Create a Razorpay subscription for the chosen plan.

    Returns {subscription_id, short_url, plan, amount_inr}.
    Frontend uses subscription_id to open the Razorpay checkout modal.
    """
    try:
        result = await create_subscription(carpenter, db, body.plan_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except httpx.HTTPStatusError as exc:
        logger.error("Razorpay subscription creation failed: %s", exc.response.text)
        raise HTTPException(status_code=502, detail="Payment provider error. Please try again.")
    except Exception as exc:
        logger.error("Subscription creation error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to create subscription. Please try again.")

    return result


@router.post("/cancel-subscription")
async def cancel_subscription_endpoint(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Cancel the carpenter's current Razorpay subscription at end of billing cycle."""
    if not carpenter.razorpay_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription found.")

    try:
        await cancel_subscription(carpenter, db)
    except httpx.HTTPStatusError as exc:
        logger.error("Razorpay cancel failed: %s", exc.response.text)
        raise HTTPException(status_code=502, detail="Failed to cancel subscription. Please contact support.")

    return {"message": "Subscription will be cancelled at the end of your current billing cycle."}


@router.post("/create-upgrade-link")
async def create_upgrade_link(
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Legacy: create a one-time Razorpay payment link for the Basic plan (₹499/month)."""
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(status_code=503, detail="Payment provider not configured.")

    expire_by = int((datetime.now(timezone.utc) + timedelta(hours=24)).timestamp())

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.razorpay.com/v1/payment_links",
                json={
                    "amount": 499 * 100,
                    "currency": "INR",
                    "description": "CarpentrIQ Basic — 1 month",
                    "expire_by": expire_by,
                    "notify": {"sms": False, "email": False},
                    "notes": {
                        "carpenter_id": str(carpenter.id),
                        "type": "subscription",
                        "plan": "basic",
                    },
                },
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            )
            resp.raise_for_status()
            payment_link = resp.json()["short_url"]
    except httpx.HTTPStatusError as exc:
        logger.error("Razorpay upgrade link failed: %s", exc.response.text)
        raise HTTPException(status_code=502, detail="Failed to create payment link. Try again.")
    except Exception as exc:
        logger.error("Razorpay upgrade link error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to create payment link. Try again.")

    logger.info("Upgrade link created for carpenter %s", carpenter.id)
    return {"payment_link": payment_link, "amount": 499}
