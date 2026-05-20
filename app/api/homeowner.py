"""Homeowner router — profile management and enquiry history.

Endpoints:
  GET  /homeowner/me
  PUT  /homeowner/profile
  GET  /homeowner/enquiries
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.homeowner import Homeowner

logger = logging.getLogger(__name__)
router = APIRouter()

HOMEOWNER_SUB_PREFIX = "h:"


async def get_current_homeowner(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> Homeowner:
    """FastAPI dependency — decode homeowner JWT and return Homeowner row."""
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
    homeowner = result.scalar_one_or_none()
    if not homeowner:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return homeowner


class UpdateHomeownerRequest(BaseModel):
    name: str | None = None
    city: str | None = None


def _homeowner_to_dict(h: Homeowner) -> dict:
    return {
        "id": str(h.id),
        "phone": h.phone,
        "name": h.name,
        "city": h.city,
        "plan": h.plan,
        "trial_ends_at": h.trial_ends_at.isoformat() if h.trial_ends_at else None,
        "created_at": h.created_at.isoformat() if h.created_at else None,
        "role": "homeowner",
    }


@router.get("/me")
async def get_me(homeowner: Homeowner = Depends(get_current_homeowner)) -> dict:
    return _homeowner_to_dict(homeowner)


@router.put("/profile")
async def update_profile(
    body: UpdateHomeownerRequest,
    db: AsyncSession = Depends(get_db),
    homeowner: Homeowner = Depends(get_current_homeowner),
) -> dict:
    if body.name is not None:
        homeowner.name = body.name.strip()
    if body.city is not None:
        homeowner.city = body.city.strip()
    await db.commit()
    await db.refresh(homeowner)
    return _homeowner_to_dict(homeowner)
