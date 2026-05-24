"""Razorpay Subscription service — create, renew, and cancel carpenter subscriptions.

Flow:
  1. Carpenter hits POST /billing/create-subscription with plan_type.
  2. This service creates a Razorpay subscription and returns {subscription_id, short_url}.
  3. Frontend opens Razorpay checkout with subscription_id.
  4. On first payment, Razorpay fires subscription.charged webhook.
  5. process_renewal_webhook() resets quotas and extends subscription_expires_at by 30 days.

Razorpay plan IDs are stored in config (RAZORPAY_PLAN_ID_BASIC/PRO/PREMIUM).
If not configured, a stub subscription link is returned for testing.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.carpenter import Carpenter
from app.models.subscription import SubscriptionHistory
from app.services.trial_subscription_service import PLAN_PRICES_INR, reset_monthly_quotas

logger = logging.getLogger(__name__)

PlanType = Literal["basic_499", "pro_799", "premium_999"]

_PLAN_MAP: dict[str, tuple[str, str]] = {
    # plan_type -> (plan_name, config_key_attr)
    "basic_499":   ("basic",   "razorpay_plan_id_basic"),
    "pro_799":     ("pro",     "razorpay_plan_id_pro"),
    "premium_999": ("premium", "razorpay_plan_id_premium"),
}


def _get_plan_id(plan_type: str) -> str | None:
    attr = _PLAN_MAP.get(plan_type, ("", ""))[1]
    return getattr(settings, attr, "") or None


async def create_subscription(
    carpenter: Carpenter,
    db: AsyncSession,
    plan_type: str,
) -> dict:
    """Create a Razorpay subscription for the carpenter.

    Returns:
        {
            "subscription_id": "sub_xxx",
            "short_url": "https://rzp.io/...",
            "plan": "basic" | "pro" | "premium",
            "amount_inr": int,
        }
    Raises HTTPException on Razorpay API error.
    """
    if plan_type not in _PLAN_MAP:
        raise ValueError(f"Unknown plan_type '{plan_type}'. Use: basic_499, pro_799, premium_999")

    plan_name = _PLAN_MAP[plan_type][0]
    amount_inr = PLAN_PRICES_INR[plan_name]
    plan_id = _get_plan_id(plan_type)

    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        logger.warning("Razorpay not configured — returning stub subscription for carpenter %s", carpenter.id)
        return {
            "subscription_id": f"sub_stub_{plan_type}",
            "short_url": "https://razorpay.com/",
            "plan": plan_name,
            "amount_inr": amount_inr,
        }

    if not plan_id:
        logger.warning(
            "Razorpay plan ID not configured for %s — create the plan in Razorpay dashboard "
            "and set RAZORPAY_PLAN_ID_%s in .env",
            plan_type, plan_name.upper(),
        )
        plan_id = await _create_razorpay_plan(plan_name, amount_inr)

    subscription_payload = {
        "plan_id": plan_id,
        "total_count": 12,          # auto-renew up to 12 months; carpenter can cancel anytime
        "quantity": 1,
        "notes": {
            "carpenter_id": str(carpenter.id),
            "plan_type": plan_type,
            "plan_name": plan_name,
        },
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/subscriptions",
            json=subscription_payload,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        )
        resp.raise_for_status()

    data = resp.json()
    subscription_id: str = data["id"]
    short_url: str = data.get("short_url", "")

    carpenter.razorpay_subscription_id = subscription_id
    await db.flush()

    logger.info(
        "Razorpay subscription %s created for carpenter %s (%s)",
        subscription_id, carpenter.id, plan_name,
    )

    return {
        "subscription_id": subscription_id,
        "short_url": short_url,
        "plan": plan_name,
        "amount_inr": amount_inr,
    }


async def process_renewal_webhook(payload: dict, db: AsyncSession) -> None:
    """Handle subscription.charged — reset quotas, extend expiry, log history.

    Called when Razorpay auto-debits a recurring subscription payment.
    """
    sub_entity  = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    pay_entity  = payload.get("payload", {}).get("payment",      {}).get("entity", {})

    subscription_id: str = sub_entity.get("id", "")
    payment_id: str      = pay_entity.get("id", "")
    amount_paise: int    = pay_entity.get("amount", 0)
    amount_inr: float    = amount_paise / 100

    # current_end is the Unix timestamp when this billing cycle ends
    current_end_ts: int  = sub_entity.get("current_end") or 0
    if current_end_ts:
        new_expiry = datetime.fromtimestamp(current_end_ts, tz=timezone.utc)
    else:
        new_expiry = datetime.now(timezone.utc) + timedelta(days=30)

    if not subscription_id:
        logger.warning("subscription.charged: missing subscription id")
        return

    result = await db.execute(
        select(Carpenter).where(Carpenter.razorpay_subscription_id == subscription_id)
    )
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        logger.warning("subscription.charged: no carpenter found for sub %s", subscription_id)
        return

    old_plan = carpenter.subscription_plan

    # Derive plan from subscription notes or current carpenter plan
    notes = sub_entity.get("notes", {})
    plan_name = notes.get("plan_name") or carpenter.subscription_plan or "basic"

    carpenter.subscription_plan = plan_name
    carpenter.plan              = plan_name
    carpenter.subscription_expires_at  = new_expiry
    carpenter.next_payment_date        = new_expiry
    carpenter.last_payment_date        = datetime.now(timezone.utc)
    carpenter.is_trial_active          = False
    carpenter.auto_renew_enabled       = True

    await reset_monthly_quotas(db, carpenter)

    history = SubscriptionHistory(
        carpenter_id=carpenter.id,
        event_type="renewed",
        plan_before=old_plan,
        plan_after=plan_name,
        amount_charged=amount_inr,
        razorpay_payment_id=payment_id,
        success=True,
    )
    db.add(history)
    await db.commit()

    logger.info(
        "Subscription renewed for carpenter %s — %s until %s",
        carpenter.id, plan_name, new_expiry.date(),
    )


async def cancel_subscription(carpenter: Carpenter, db: AsyncSession) -> None:
    """Cancel the Razorpay subscription and mark carpenter as cancelled."""
    subscription_id = carpenter.razorpay_subscription_id

    if subscription_id and settings.razorpay_key_id and settings.razorpay_key_secret:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"https://api.razorpay.com/v1/subscriptions/{subscription_id}/cancel",
                    json={"cancel_at_cycle_end": 1},  # cancel at end of current billing cycle
                    auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
                )
                resp.raise_for_status()
                logger.info("Razorpay subscription %s cancelled", subscription_id)
        except httpx.HTTPStatusError as exc:
            logger.error("Razorpay cancel failed: %s", exc.response.text)
            raise

    old_plan = carpenter.subscription_plan
    carpenter.auto_renew_enabled = False

    history = SubscriptionHistory(
        carpenter_id=carpenter.id,
        event_type="cancelled",
        plan_before=old_plan,
        plan_after=old_plan,
        success=True,
    )
    db.add(history)
    await db.commit()

    logger.info("Subscription cancelled for carpenter %s", carpenter.id)


async def _create_razorpay_plan(plan_name: str, amount_inr: int) -> str:
    """Create a Razorpay plan via API and return its plan_id.

    In production, create plans once in the Razorpay dashboard and set the IDs
    in .env. This helper is a fallback for first-time dev setup only.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/plans",
            json={
                "period": "monthly",
                "interval": 1,
                "item": {
                    "name": f"CarpentrIQ {plan_name.title()} — ₹{amount_inr}/month",
                    "amount": amount_inr * 100,
                    "currency": "INR",
                    "description": f"CarpentrIQ {plan_name} monthly subscription",
                },
            },
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        )
        resp.raise_for_status()

    plan_id: str = resp.json()["id"]
    logger.info(
        "Auto-created Razorpay plan %s for %s. Add RAZORPAY_PLAN_ID_%s=%s to .env",
        plan_id, plan_name, plan_name.upper(), plan_id,
    )
    return plan_id
