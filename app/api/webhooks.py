"""Webhook router — Razorpay payment events.

CRITICAL: This endpoint MUST always return HTTP 200 OK.
Returning 4xx/5xx causes Razorpay to retry the event repeatedly (retry storm).
Invalid signatures are rejected by logging a warning and returning 200 immediately.

Handled events:
  payment_link.paid  — advance payment received; creates Payment record
  payment.failed     — payment failed; creates Payment record with status=failed
  (all others)       — logged and ignored

Endpoint:
  POST /webhooks/razorpay  [NO AUTH — verified by HMAC-SHA256 signature only]
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.payment import Payment
from app.models.quote import Quote
from app.services.payment_service import payment_service
from app.services.razorpay_subscription_service import process_renewal_webhook

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Receive Razorpay events. Always returns 200 OK."""
    body = await request.body()  # read raw bytes BEFORE any JSON parsing
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not payment_service.verify_webhook_signature(body, signature):
        logger.warning("Invalid Razorpay webhook signature — possible spoofing attempt")
        return {"status": "ok"}  # 200 always — never 4xx to Razorpay

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Razorpay webhook: malformed JSON body")
        return {"status": "ok"}

    event = payload.get("event", "")
    logger.info("Razorpay webhook event: %s", event)

    if event == "payment_link.paid":
        await _handle_payment_link_paid(payload, db)
    elif event == "payment.failed":
        await _handle_payment_failed(payload, db)
    else:
        logger.info("Unhandled webhook event: %s", event)

    return {"status": "ok"}


# ── Event handlers ────────────────────────────────────────────────────────────

async def _handle_payment_link_paid(payload: dict, db: AsyncSession) -> None:
    """Create a captured Payment record and update carpenter revenue.

    Dispatches on notes.type:
      "advance"    — quote advance payment (primary flow)
      "pdf_credit" — hallmark-removal credit purchase
      (other)      — logged and ignored
    """
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    link_entity = payload.get("payload", {}).get("payment_link", {}).get("entity", {})

    payment_id: str = payment_entity.get("id", "")
    amount_paise: int = payment_entity.get("amount", 0)
    amount_inr: float = amount_paise / 100

    notes: dict = link_entity.get("notes", {})
    payment_type: str = notes.get("type", "advance")

    if payment_type == "pdf_credit":
        await _handle_pdf_credit(notes, db)
        return

    if payment_type == "subscription":
        await _handle_subscription(notes, db)
        return

    # ── Advance payment ───────────────────────────────────────────────────────
    quote_id_str: str = notes.get("quote_id", "")
    if not quote_id_str:
        logger.warning(
            "payment_link.paid: missing quote_id in notes for payment %s", payment_id
        )
        return

    try:
        quote_uuid = UUID(quote_id_str)
    except ValueError:
        logger.warning("payment_link.paid: invalid quote_id '%s'", quote_id_str)
        return

    quote_result = await db.execute(select(Quote).where(Quote.id == quote_uuid))
    quote = quote_result.scalar_one_or_none()
    if quote is None:
        logger.warning("payment_link.paid: quote %s not found — duplicate or stale event", quote_id_str)
        return

    # Idempotency — skip if we already recorded this payment
    existing = await db.execute(
        select(Payment).where(Payment.razorpay_payment_id == payment_id)
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("payment_link.paid: duplicate event for %s — skipping", payment_id)
        return

    payment_row = Payment(
        quote_id=quote.id,
        carpenter_id=quote.carpenter_id,
        razorpay_payment_id=payment_id,
        amount=amount_inr,
        payment_type="advance",
        status="captured",
        paid_at=datetime.now(timezone.utc),
    )
    db.add(payment_row)

    if quote.carpenter_id:
        carp_result = await db.execute(
            select(Carpenter).where(Carpenter.id == quote.carpenter_id)
        )
        carpenter = carp_result.scalar_one_or_none()
        if carpenter:
            carpenter.total_revenue_processed = (
                float(carpenter.total_revenue_processed or 0) + amount_inr
            )

    await db.commit()
    logger.info("Payment captured: ₹%.2f for quote %s", amount_inr, quote_id_str)


async def _handle_pdf_credit(notes: dict, db: AsyncSession) -> None:
    """Top up pdf_credits_remaining when a hallmark-removal credit is purchased."""
    carpenter_id_str: str = notes.get("carpenter_id", "")
    credits: int = int(notes.get("credits", 1))

    if not carpenter_id_str:
        logger.warning("payment_link.paid pdf_credit: missing carpenter_id in notes")
        return

    try:
        carp_uuid = UUID(carpenter_id_str)
    except ValueError:
        logger.warning("payment_link.paid pdf_credit: invalid carpenter_id '%s'", carpenter_id_str)
        return

    result = await db.execute(select(Carpenter).where(Carpenter.id == carp_uuid))
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        logger.warning("payment_link.paid pdf_credit: carpenter %s not found", carpenter_id_str)
        return

    carpenter.pdf_credits_remaining = (carpenter.pdf_credits_remaining or 0) + credits
    await db.commit()
    logger.info(
        "PDF credit +%d added to carpenter %s (balance: %d)",
        credits,
        carpenter_id_str,
        carpenter.pdf_credits_remaining,
    )


async def _handle_subscription(notes: dict, db: AsyncSession) -> None:
    """Activate Basic plan when a subscription payment link is paid."""
    carpenter_id_str: str = notes.get("carpenter_id", "")
    if not carpenter_id_str:
        logger.warning("payment_link.paid subscription: missing carpenter_id in notes")
        return

    try:
        carp_uuid = UUID(carpenter_id_str)
    except ValueError:
        logger.warning("payment_link.paid subscription: invalid carpenter_id '%s'", carpenter_id_str)
        return

    result = await db.execute(select(Carpenter).where(Carpenter.id == carp_uuid))
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        logger.warning("payment_link.paid subscription: carpenter %s not found", carpenter_id_str)
        return

    carpenter.plan = "basic"
    carpenter.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=30)
    await db.commit()
    logger.info("Carpenter %s subscribed to basic plan (expires in 30 days)", carpenter_id_str)


@router.post("/razorpay/subscription")
async def razorpay_subscription_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Receive Razorpay subscription events. Always returns 200 OK.

    Handled events:
      subscription.charged — auto-renewal payment succeeded; reset quotas + extend expiry
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    # Use the subscription-specific webhook secret if set, otherwise fall back to the main one
    from app.config import settings as _settings
    secret = _settings.razorpay_subscription_webhook_secret or _settings.razorpay_webhook_secret

    if secret and not payment_service.verify_webhook_signature(body, signature, secret):
        logger.warning("Invalid Razorpay subscription webhook signature")
        return {"status": "ok"}

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Razorpay subscription webhook: malformed JSON body")
        return {"status": "ok"}

    event = payload.get("event", "")
    logger.info("Razorpay subscription webhook event: %s", event)

    if event == "subscription.charged":
        try:
            await process_renewal_webhook(payload, db)
        except Exception as exc:
            logger.error("subscription.charged handler failed: %s", exc, exc_info=True)

    return {"status": "ok"}


async def _handle_payment_failed(payload: dict, db: AsyncSession) -> None:
    """Record a failed payment. Idempotent — skips if already recorded."""
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id: str = payment_entity.get("id", "")
    order_id: str = payment_entity.get("order_id", "")

    if not payment_id:
        logger.warning("payment.failed: missing payment_id in payload")
        return

    existing = await db.execute(
        select(Payment).where(Payment.razorpay_payment_id == payment_id)
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("payment.failed: duplicate event for %s — skipping", payment_id)
        return

    payment_row = Payment(
        razorpay_payment_id=payment_id,
        payment_type="advance",
        status="failed",
    )
    db.add(payment_row)
    await db.commit()
    logger.warning("Payment failed for %s (order: %s)", payment_id, order_id)
