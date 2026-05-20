"""Payment service — Razorpay payment link creation and webhook signature verification.

Design notes:
  - create_payment_link uses Decimal arithmetic so no float rounding on paise conversion.
  - verify_webhook_signature uses hmac.compare_digest for timing-safe comparison.
  - PaymentLinkError is the single exception type callers catch; internal errors are
    logged here before re-raising so the caller gets a clean human-readable message.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from decimal import Decimal
from uuid import UUID

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class PaymentLinkError(Exception):
    """Raised when the Razorpay API cannot create a payment link."""


class PaymentService:

    async def create_payment_link(
        self,
        amount_inr: Decimal,
        description: str,
        quote_id: UUID,
        carpenter_id: UUID,
        validity_seconds: int = 604800,  # 7 days
    ) -> str:
        """Call Razorpay POST /payment_links, return short_url.

        amount_inr is converted to paise with int(amount_inr * 100) — no float arithmetic.
        Raises PaymentLinkError with a human-readable message on any API error.
        """
        amount_paise = int(amount_inr * 100)
        expire_by = int(time.time()) + validity_seconds

        payload = {
            "amount": amount_paise,
            "currency": "INR",
            "description": description[:255],
            "expire_by": expire_by,
            "notify": {"sms": True, "email": False},
            "notes": {
                "quote_id": str(quote_id),
                "carpenter_id": str(carpenter_id),
                "type": "advance",
            },
            "options": {
                "checkout": {
                    "prefill": {},
                    "method": {
                        "upi": True,
                        "card": True,
                        "netbanking": True,
                    },
                }
            },
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.razorpay.com/v1/payment_links",
                    json=payload,
                    auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
                )
                resp.raise_for_status()
                return resp.json()["short_url"]
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Razorpay API error creating payment link: status=%d body=%s",
                exc.response.status_code,
                exc.response.text,
            )
            raise PaymentLinkError(
                f"Payment gateway returned an error ({exc.response.status_code}). "
                "Please try again or contact support."
            ) from exc
        except Exception as exc:
            logger.error("Razorpay payment link creation failed: %s", exc)
            raise PaymentLinkError(
                "Could not reach payment gateway. Please try again."
            ) from exc

    def verify_webhook_signature(
        self, payload_bytes: bytes, signature: str, secret: str | None = None
    ) -> bool:
        """Return True only if HMAC-SHA256(payload_bytes, webhook_secret) == signature.

        Uses hmac.compare_digest for timing-safe comparison.
        Pass ``secret`` to override the default webhook secret (e.g. for subscription webhooks).
        """
        if not signature:
            return False
        key = (secret or settings.razorpay_webhook_secret).encode()
        if not key:
            return False
        expected = hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)


payment_service = PaymentService()
