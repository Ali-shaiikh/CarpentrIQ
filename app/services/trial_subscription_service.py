"""Trial and subscription management service."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.carpenter import Carpenter
from app.models.subscription import SubscriptionHistory, UsageLog

logger = logging.getLogger(__name__)

TRIAL_DAYS = 10

PLAN_LIMITS = {
    "free_trial": {
        "images_per_month": 5,
        "quotes_per_month": 3,
        "regenerates_free": 5,
        "extra_image_cost_inr": 0,
    },
    "basic": {
        "images_per_month": 20,
        "quotes_per_month": 9999,   # unlimited
        "regenerates_free": 5,
        "extra_image_cost_inr": 0,  # no overage on basic
    },
    "pro": {
        "images_per_month": 40,
        "quotes_per_month": 9999,   # unlimited
        "regenerates_free": 5,
        "extra_image_cost_inr": 30,
    },
    "premium": {
        "images_per_month": 60,
        "quotes_per_month": 9999,   # unlimited
        "regenerates_free": 10,
        "extra_image_cost_inr": 25,
    },
}

# Canonical plan pricing — must match Razorpay plan amounts
PLAN_PRICES_INR = {
    "basic":   499,
    "pro":     799,
    "premium": 999,
}


def calculate_trial_end_date() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)


async def create_trial_carpenter(
    db: AsyncSession,
    phone: str,
    name: str,
    city: str = "Mumbai",
) -> Carpenter:
    trial_end = calculate_trial_end_date()
    limits = PLAN_LIMITS["free_trial"]

    carpenter = Carpenter(
        name=name,
        phone=phone,
        city=city,
        plan="trial",
        subscription_plan="free_trial",
        trial_ends_at=trial_end,
        is_trial_active=True,
        images_limit_this_month=limits["images_per_month"],
        quotes_sent_limit_this_month=limits["quotes_per_month"],
        regenerates_free_limit=limits["regenerates_free"],
    )
    db.add(carpenter)
    await db.flush()

    history = SubscriptionHistory(
        carpenter_id=carpenter.id,
        event_type="trial_started",
        plan_before=None,
        plan_after="free_trial",
        success=True,
    )
    db.add(history)
    await db.commit()
    await db.refresh(carpenter)

    logger.info("Trial carpenter created: %s (trial ends %s)", carpenter.id, trial_end.date())
    return carpenter


def is_trial_active(carpenter: Carpenter) -> bool:
    if not carpenter.is_trial_active:
        return False
    now = datetime.now(timezone.utc)
    ends_at = carpenter.trial_ends_at
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return now < ends_at


def is_trial_expired(carpenter: Carpenter) -> bool:
    if not carpenter.is_trial_active:
        return False
    return not is_trial_active(carpenter)


def has_active_subscription(carpenter: Carpenter) -> bool:
    if carpenter.subscription_plan in ("basic", "pro"):
        if carpenter.subscription_expires_at:
            exp = carpenter.subscription_expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            return datetime.now(timezone.utc) < exp
    return False


def is_access_allowed(carpenter: Carpenter) -> bool:
    return is_trial_active(carpenter) or has_active_subscription(carpenter)


def check_image_quota(carpenter: Carpenter) -> bool:
    """Return True if carpenter can generate another image this month."""
    return carpenter.images_used_this_month < carpenter.images_limit_this_month


def check_quote_send_quota(carpenter: Carpenter) -> bool:
    """Return True if carpenter can send another quote this month."""
    if has_active_subscription(carpenter) and carpenter.subscription_plan == "pro":
        return True
    return carpenter.quotes_sent_this_month < carpenter.quotes_sent_limit_this_month


def check_regenerate_cost(carpenter: Carpenter) -> dict:
    """Return cost info for a regeneration attempt.

    Returns {"allowed": bool, "free": bool, "cost_inr": int, "message": str}.
    """
    used = carpenter.regenerates_used_this_month
    free_limit = carpenter.regenerates_free_limit

    if used < free_limit:
        return {
            "allowed": True,
            "free": True,
            "cost_inr": 0,
            "message": f"{free_limit - used} free regenerates remaining this month",
        }

    if not is_access_allowed(carpenter):
        return {
            "allowed": False,
            "free": False,
            "cost_inr": 0,
            "message": "Trial expired. Please upgrade to continue.",
        }

    cost = 10  # ₹10 per regenerate after free limit
    return {
        "allowed": True,
        "free": False,
        "cost_inr": cost,
        "message": f"Free regenerates exhausted. This will cost ₹{cost}.",
    }


async def log_usage(
    db: AsyncSession,
    carpenter_id: uuid.UUID,
    action_type: str,
    quote_id: Optional[uuid.UUID] = None,
    enquiry_id: Optional[uuid.UUID] = None,
    cost_to_carpenter: Optional[float] = None,
) -> None:
    entry = UsageLog(
        carpenter_id=carpenter_id,
        action_type=action_type,
        quote_id=quote_id,
        enquiry_id=enquiry_id,
        cost_to_carpenter=cost_to_carpenter,
    )
    db.add(entry)
    await db.flush()


async def increment_image_usage(db: AsyncSession, carpenter: Carpenter) -> None:
    carpenter.images_used_this_month += 1
    await db.flush()
    await log_usage(db, carpenter.id, "image_generated")


async def increment_quote_sent(
    db: AsyncSession,
    carpenter: Carpenter,
    quote_id: Optional[uuid.UUID] = None,
    enquiry_id: Optional[uuid.UUID] = None,
) -> None:
    carpenter.quotes_sent_this_month += 1
    carpenter.total_quotes_sent += 1
    await db.flush()
    await log_usage(db, carpenter.id, "quote_sent", quote_id=quote_id, enquiry_id=enquiry_id)


async def increment_regenerate(db: AsyncSession, carpenter: Carpenter, cost_inr: float = 0) -> None:
    carpenter.regenerates_used_this_month += 1
    await db.flush()
    await log_usage(db, carpenter.id, "regenerate_used", cost_to_carpenter=cost_inr or None)


async def reset_monthly_quotas(db: AsyncSession, carpenter: Carpenter) -> None:
    limits = PLAN_LIMITS.get(carpenter.subscription_plan, PLAN_LIMITS["free_trial"])
    carpenter.images_used_this_month = 0
    carpenter.images_limit_this_month = limits["images_per_month"]
    carpenter.quotes_sent_this_month = 0
    carpenter.quotes_sent_limit_this_month = limits["quotes_per_month"]
    carpenter.regenerates_used_this_month = 0
    carpenter.regenerates_free_limit = limits["regenerates_free"]
    await db.flush()
    logger.info("Monthly quotas reset for carpenter %s", carpenter.id)


async def upgrade_plan(
    db: AsyncSession,
    carpenter: Carpenter,
    new_plan: str,
    razorpay_payment_id: str,
    amount_charged: float,
    subscription_months: int = 1,
) -> Carpenter:
    old_plan = carpenter.subscription_plan
    now = datetime.now(timezone.utc)

    carpenter.subscription_plan = new_plan
    carpenter.plan = new_plan
    carpenter.subscription_started_at = now
    carpenter.subscription_expires_at = now + timedelta(days=30 * subscription_months)
    carpenter.last_payment_date = now
    carpenter.next_payment_date = now + timedelta(days=30 * subscription_months)
    carpenter.is_trial_active = False

    limits = PLAN_LIMITS.get(new_plan, PLAN_LIMITS["free_trial"])
    carpenter.images_limit_this_month = limits["images_per_month"]
    carpenter.quotes_sent_limit_this_month = limits["quotes_per_month"]
    carpenter.regenerates_free_limit = limits["regenerates_free"]

    history = SubscriptionHistory(
        carpenter_id=carpenter.id,
        event_type="upgraded",
        plan_before=old_plan,
        plan_after=new_plan,
        amount_charged=amount_charged,
        razorpay_payment_id=razorpay_payment_id,
        success=True,
    )
    db.add(history)
    await db.commit()
    await db.refresh(carpenter)

    logger.info("Carpenter %s upgraded %s → %s", carpenter.id, old_plan, new_plan)
    return carpenter


async def mark_trial_expired(db: AsyncSession, carpenter: Carpenter) -> None:
    carpenter.is_trial_active = False

    history = SubscriptionHistory(
        carpenter_id=carpenter.id,
        event_type="expired",
        plan_before="free_trial",
        plan_after="free_trial",
        success=True,
    )
    db.add(history)
    await db.commit()
    logger.info("Trial marked expired for carpenter %s", carpenter.id)
