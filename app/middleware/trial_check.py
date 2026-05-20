"""Access-gate middleware — blocks expired trial and lapsed subscription carpenters.

Runs on all /api/v1/* requests that carry a JWT.
Returns 402 on:
  - plan='trial'  and trial_ends_at   < now()  → trial_expired
  - paid plan and subscription_expires_at < now()  → subscription_expired

Skipped paths (always allowed):
  /api/v1/auth/*
  /api/v1/billing/*          ← carpenter must reach billing to re-subscribe
  /api/v1/enquiry/form/*
  /api/v1/quote/*/view | /approve | /reject
  /api/v1/webhooks/*
  /health, /docs, /openapi.json, /redoc
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.carpenter import Carpenter

logger = logging.getLogger(__name__)

_SKIP_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/billing/",       # let expired users reach billing to resubscribe
    "/api/v1/enquiry/form/",
    "/api/v1/webhooks/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)

_SKIP_SUFFIXES = ("/view", "/approve", "/reject")

_PAID_PLANS = ("basic", "pro", "premium")


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class TrialCheckMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if any(path.startswith(p) for p in _SKIP_PREFIXES):
            return await call_next(request)
        if any(path.endswith(s) for s in _SKIP_SUFFIXES):
            return await call_next(request)
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return await call_next(request)

        token = auth[len("Bearer "):].strip()
        try:
            payload = jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
            carpenter_id = payload.get("sub")
        except JWTError:
            return await call_next(request)

        if not carpenter_id:
            return await call_next(request)

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(
                        Carpenter.plan,
                        Carpenter.trial_ends_at,
                        Carpenter.subscription_expires_at,
                        Carpenter.is_trial_active,
                    ).where(Carpenter.id == carpenter_id)
                )
                row = result.first()
        except Exception as exc:
            logger.error("TrialCheckMiddleware DB error: %s", exc)
            return await call_next(request)

        if row is None:
            return await call_next(request)

        plan, trial_ends_at, subscription_expires_at, is_trial_active = row
        now = datetime.now(timezone.utc)

        # ── Trial ──────────────────────────────────────────────────────────────
        if plan == "trial" or (plan not in _PAID_PLANS):
            if trial_ends_at is not None and _utc(trial_ends_at) < now:
                return JSONResponse(
                    status_code=402,
                    content={
                        "error": "trial_expired",
                        "message": "Your free trial has ended. Upgrade to continue.",
                        "upgrade_url": "/upgrade",
                    },
                )
            return await call_next(request)

        # ── Paid plan ─────────────────────────────────────────────────────────
        if plan in _PAID_PLANS:
            if subscription_expires_at is not None and _utc(subscription_expires_at) < now:
                return JSONResponse(
                    status_code=402,
                    content={
                        "error": "subscription_expired",
                        "message": "Your subscription has lapsed. Please renew to continue.",
                        "upgrade_url": "/upgrade",
                    },
                )

        return await call_next(request)
