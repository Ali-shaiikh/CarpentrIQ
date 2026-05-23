"""Homeowner auth router — same phone OTP flow as carpenters, separate table.

JWT sub is prefixed "h:" to distinguish from carpenter tokens.

Endpoints:
  POST /homeowner-auth/send-otp
  POST /homeowner-auth/verify-otp
  POST /homeowner-auth/refresh
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_redis
from app.models.homeowner import Homeowner
from app.services.auth_service import auth_service
from app.config import settings
from jose import jwt

logger = logging.getLogger(__name__)
router = APIRouter()

_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
HOMEOWNER_SUB_PREFIX = "h:"


def create_homeowner_token(homeowner_id: UUID) -> str:
    """HS256 JWT with 7-day expiry. Sub is 'h:{uuid}' to distinguish from carpenters."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": f"{HOMEOWNER_SUB_PREFIX}{homeowner_id}",
        "role": "homeowner",
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


class SendOTPRequest(BaseModel):
    phone: str
    email: str

    @field_validator("phone")
    @classmethod
    def validate_indian_mobile(cls, v: str) -> str:
        v = v.strip()
        if not _INDIAN_MOBILE_RE.match(v):
            raise ValueError("Invalid Indian mobile number")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


@router.post("/send-otp")
async def send_otp(
    body: SendOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> dict:
    phone = body.phone

    result = await db.execute(select(Homeowner).where(Homeowner.phone == phone))
    homeowner = result.scalar_one_or_none()

    if homeowner is None:
        homeowner = Homeowner(
            phone=phone,
            email=body.email,
            plan="trial",
            trial_ends_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(homeowner)
    else:
        homeowner.email = body.email

    await db.commit()
    await db.refresh(homeowner)

    otp = await auth_service.generate_otp(f"hw:{phone}", redis)
    await auth_service.send_otp_email(body.email, otp)

    return {"message": f"OTP sent to {body.email}", "expires_in_seconds": 600}


@router.post("/verify-otp")
async def verify_otp(
    body: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> dict:
    valid = await auth_service.verify_otp(f"hw:{body.phone}", body.otp, redis)
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP")

    result = await db.execute(select(Homeowner).where(Homeowner.phone == body.phone))
    homeowner = result.scalar_one_or_none()
    if homeowner is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found")

    token = create_homeowner_token(homeowner.id)
    is_new = not homeowner.name

    return {
        "access_token": token,
        "homeowner_id": str(homeowner.id),
        "name": homeowner.name or None,
        "is_new_homeowner": is_new,
        "role": "homeowner",
    }


@router.post("/refresh")
async def refresh_token(
    authorization: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub", "")
        if not sub.startswith(HOMEOWNER_SUB_PREFIX):
            raise JWTError("Not a homeowner token")
        homeowner_id = UUID(sub.removeprefix(HOMEOWNER_SUB_PREFIX))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(Homeowner).where(Homeowner.id == homeowner_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return {"access_token": create_homeowner_token(homeowner_id)}
