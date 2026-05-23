"""Furniture AI router — image generation + 3D model extraction.

Endpoints (JWT required):
  POST /furniture-ai/generate-image  → fal.ai FLUX furniture render
  POST /furniture-ai/extract-3d      → TripoSR (free HF Space) image → GLB

TripoSR takes 15–30 s; the endpoint blocks until done.
Frontend should show a loading state for that duration.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import get_redis
from app.models.carpenter import Carpenter
from app.services.auth_service import auth_service
from app.services.furniture_ai import extract_3d_triposr, generate_furniture_image

logger = logging.getLogger(__name__)
router = APIRouter()

TRIAL_DAILY_IMAGE_LIMIT = 5
ADMIN_EMAILS = {"innovationfsn@gmail.com", "alishaikhh15@gmail.com"}


class GenerateImageRequest(BaseModel):
    item_type:      str
    material_grade: str = "standard"
    custom_prompt:  str = ""
    width:          int = 1024
    height:         int = 768


class Extract3DRequest(BaseModel):
    image_url: str


@router.post("/generate-image")
async def generate_image(
    body: GenerateImageRequest,
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
    redis=Depends(get_redis),
) -> dict:
    """Generate a photorealistic furniture image via fal.ai FLUX.1-dev.

    Trial accounts are limited to 5 images per day.
    """
    is_admin = carpenter.email in ADMIN_EMAILS
    if carpenter.plan == "trial" and not is_admin:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        redis_key = f"img_count:{carpenter.id}:{today}"
        try:
            count = await redis.get(redis_key)
            count = int(count) if count else 0
        except Exception:
            count = 0

        if count >= TRIAL_DAILY_IMAGE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Trial limit reached. You can generate up to {TRIAL_DAILY_IMAGE_LIMIT} images per day during your free trial.",
            )

    result = await generate_furniture_image(
        item_type=body.item_type,
        material_grade=body.material_grade,
        custom_prompt=body.custom_prompt,
        width=body.width,
        height=body.height,
    )

    if carpenter.plan == "trial" and not is_admin:
        try:
            await redis.incr(redis_key)
            await redis.expire(redis_key, 86400)
        except Exception:
            pass

    return result


@router.post("/extract-3d")
async def extract_3d(
    body: Extract3DRequest,
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Convert a furniture image to a GLB 3D model via TripoSR (free, HF Spaces).

    Blocks for 15–30 s while TripoSR runs on HF GPU.
    Returns {"status": "SUCCEEDED", "glb_url": str} or {"status": "FAILED", "error": str}.
    """
    return await extract_3d_triposr(body.image_url)
