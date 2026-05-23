"""Auth router — phone OTP flow for carpenters (no email login in v1).

Endpoints:
  POST /auth/send-otp    — validate Indian mobile, generate OTP, send SMS
  POST /auth/verify-otp  — verify OTP, return JWT
  POST /auth/refresh     — issue fresh JWT from existing valid token
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.carpenter import Carpenter
from app.services.auth_service import auth_service
from app.dependencies import get_redis

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pydantic schemas ──────────────────────────────────────────────────────────

_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


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


class SendOTPResponse(BaseModel):
    message: str
    expires_in_seconds: int


class VerifyOTPResponse(BaseModel):
    access_token: str
    carpenter_id: str
    name: str | None
    is_new_carpenter: bool


class RefreshResponse(BaseModel):
    access_token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(
    body: SendOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> SendOTPResponse:
    phone = body.phone

    # Upsert carpenter — create row on first contact
    result = await db.execute(select(Carpenter).where(Carpenter.phone == phone))
    carpenter = result.scalar_one_or_none()

    if carpenter is None:
        carpenter = Carpenter(
            phone=phone,
            email=body.email,
            name="",
            plan="trial",
            trial_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
        )
        db.add(carpenter)
    else:
        carpenter.email = body.email

    await db.commit()
    await db.refresh(carpenter)

    otp = await auth_service.generate_otp(phone, redis)
    await auth_service.send_otp_email(body.email, otp)

    return SendOTPResponse(
        message=f"OTP sent to {body.email}",
        expires_in_seconds=600,
    )


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> VerifyOTPResponse:
    valid = await auth_service.verify_otp(body.phone, body.otp, redis)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )

    result = await db.execute(select(Carpenter).where(Carpenter.phone == body.phone))
    carpenter = result.scalar_one_or_none()
    if carpenter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Carpenter not found",
        )

    token = auth_service.create_access_token(carpenter.id)
    is_new = not carpenter.name

    return VerifyOTPResponse(
        access_token=token,
        carpenter_id=str(carpenter.id),
        name=carpenter.name or None,
        is_new_carpenter=is_new,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    authorization: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    old_token = authorization.removeprefix("Bearer ").strip()

    try:
        carpenter_id = auth_service.decode_token(old_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    from uuid import UUID as _UUID
    result = await db.execute(
        select(Carpenter).where(Carpenter.id == _UUID(carpenter_id))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    new_token = auth_service.create_access_token(_UUID(carpenter_id))
    return RefreshResponse(access_token=new_token)
