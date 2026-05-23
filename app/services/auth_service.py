"""Auth service — OTP generation/verification and JWT management.

OTP flow:
  generate_otp  → store in Redis (key=otp:{phone}, TTL=600s)
  send_otp_sms  → dev: log to console; prod: MSG91 REST API
  verify_otp    → compare + delete from Redis on match (one-time use)

JWT:
  HS256, 7-day expiry, signed with JWT_SECRET_KEY from config.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.carpenter import Carpenter

logger = logging.getLogger(__name__)

_bearer = HTTPBearer()

OTP_TTL_SECONDS = 600
OTP_REDIS_PREFIX = "otp:"

# In-memory OTP store — used only when Redis is unreachable (dev / Redis outage).
# Maps phone → (otp, expires_at). Single-process safe; fine for development.
_otp_fallback: dict[str, tuple[str, datetime]] = {}


class AuthService:
    # ── OTP ───────────────────────────────────────────────────────────────────

    async def generate_otp(self, phone: str, redis_client: Any) -> str:
        """Generate a 6-digit OTP, store in Redis with 600 s TTL, return it.

        Falls back to an in-memory store if Redis is unreachable (dev / outage).
        """
        otp = "".join(secrets.choice("0123456789") for _ in range(6))
        try:
            await redis_client.set(f"{OTP_REDIS_PREFIX}{phone}", otp, ex=OTP_TTL_SECONDS)
        except Exception as exc:
            logger.warning("Redis unavailable, using in-memory OTP fallback: %s", exc)
            expires = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)
            _otp_fallback[phone] = (otp, expires)
        return otp

    async def send_otp_email(self, email: str, otp: str) -> bool:
        """Send OTP via Resend email. Never raises — logs and returns False on failure."""
        if settings.app_env == "development":
            logger.info("OTP for %s: %s", email, otp)
            return True

        if not settings.resend_api_key:
            logger.error("Resend API key not configured — cannot send OTP email")
            return False

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    json={
                        "from": settings.resend_from_email,
                        "to": [email],
                        "subject": "Your CarpentrIQ login code",
                        "html": (
                            f"<p>Your CarpentrIQ login OTP is:</p>"
                            f"<h2 style='letter-spacing:4px'>{otp}</h2>"
                            f"<p>Valid for 10 minutes. Do not share this code.</p>"
                        ),
                    },
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                )
                if resp.status_code not in (200, 201):
                    logger.error("Resend rejected OTP email to %s: %s", email, resp.text)
                    return False
                return True
        except Exception as exc:
            logger.error("OTP email send failed for %s: %s", email, exc)
            return False

    async def verify_otp(self, phone: str, submitted_otp: str, redis_client: Any) -> bool:
        """Return True and delete Redis key on match; False if missing or wrong.

        Checks in-memory fallback store if Redis is unreachable.
        """
        try:
            stored = await redis_client.get(f"{OTP_REDIS_PREFIX}{phone}")
        except Exception as exc:
            logger.warning("Redis unavailable during OTP verify, using fallback: %s", exc)
            stored = None

        if stored is not None:
            stored_str = stored.decode() if isinstance(stored, bytes) else stored
            if stored_str != submitted_otp:
                return False
            try:
                await redis_client.delete(f"{OTP_REDIS_PREFIX}{phone}")
            except Exception:
                pass
            return True

        # Check in-memory fallback
        entry = _otp_fallback.get(phone)
        if entry is None:
            return False
        fallback_otp, expires = entry
        if datetime.now(timezone.utc) > expires:
            _otp_fallback.pop(phone, None)
            return False
        if fallback_otp != submitted_otp:
            return False
        _otp_fallback.pop(phone, None)
        return True

    # ── JWT ───────────────────────────────────────────────────────────────────

    def create_access_token(self, carpenter_id: UUID) -> str:
        """Return a signed HS256 JWT valid for 7 days."""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(carpenter_id),
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def decode_token(self, token: str) -> str:
        """Decode JWT, return carpenter_id string. Raises JWTError on failure."""
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        sub = payload.get("sub")
        if not sub:
            raise JWTError("Missing sub claim")
        return sub

    # ── FastAPI dependency ────────────────────────────────────────────────────

    async def get_current_carpenter(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
        db: AsyncSession = Depends(get_db),
    ) -> Carpenter:
        """FastAPI dependency — decode JWT and return the authenticated Carpenter."""
        try:
            carpenter_id = self.decode_token(credentials.credentials)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        result = await db.execute(
            select(Carpenter).where(Carpenter.id == UUID(carpenter_id))
        )
        carpenter = result.scalar_one_or_none()
        if carpenter is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        return carpenter


auth_service = AuthService()
