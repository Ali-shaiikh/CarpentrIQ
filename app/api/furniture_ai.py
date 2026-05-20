"""Furniture AI router — image generation + 3D model extraction.

Endpoints (JWT required):
  POST /furniture-ai/generate-image  → fal.ai FLUX furniture render
  POST /furniture-ai/extract-3d      → TripoSR (free HF Space) image → GLB

TripoSR takes 15–30 s; the endpoint blocks until done.
Frontend should show a loading state for that duration.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models.carpenter import Carpenter
from app.services.auth_service import auth_service
from app.services.furniture_ai import extract_3d_triposr, generate_furniture_image

logger = logging.getLogger(__name__)
router = APIRouter()


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
) -> dict:
    """Generate a photorealistic furniture image via fal.ai FLUX.1-dev."""
    return await generate_furniture_image(
        item_type=body.item_type,
        material_grade=body.material_grade,
        custom_prompt=body.custom_prompt,
        width=body.width,
        height=body.height,
    )


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
