"""fal.ai — two models for different generation tasks.

FLUX.1 Kontext Pro  — room photo editing (image_url + text prompt).
                      Purpose-built for in-context editing: preserves walls,
                      arches, ceiling, camera angle while applying changes.
                      Model: fal-ai/flux-pro/kontext   Cost: ~$0.04/image

Ideogram v3         — fresh room generation when no photo is provided.
                      Best photorealism + style adherence for text-to-image.
                      Model: fal-ai/ideogram/v3         Cost: ~$0.08/image
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

from app.config import settings

logger = logging.getLogger(__name__)

_KONTEXT_MODEL  = "fal-ai/flux-pro/kontext"
_IDEOGRAM_MODEL = "fal-ai/ideogram/v3"


def _init_fal() -> tuple[bool, object | None]:
    """Set FAL_KEY env var and import fal_client. Returns (ok, client)."""
    if not settings.fal_api_key:
        return False, None
    os.environ["FAL_KEY"] = settings.fal_api_key
    try:
        import fal_client
        return True, fal_client
    except ImportError:
        return False, None


async def edit_room_image_kontext(image_url: str, prompt: str) -> dict:
    """Edit a room photo using FLUX.1 Kontext Pro on fal.ai.

    Kontext is trained specifically for photo editing — it keeps the original
    room structure (walls, arches, ceiling, camera angle) while applying the
    text instructions. Far better than gpt-image-1 for room transformations
    that need to follow specific placement notes.

    Returns:
        {"image_url": str, "prompt_used": str, "revised_prompt": None, "generation_time": float}
    On error returns {"error": str}.
    """
    ok, fal_client = _init_fal()
    if not ok:
        return {"error": "FAL_API_KEY not set or fal-client not installed"}

    # Download source image then re-upload to fal.ai storage.
    # Kontext cannot reliably fetch arbitrary external URLs (Supabase, S3, etc.)
    import httpx
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    except Exception as exc:
        logger.error("Failed to download source image for Kontext: %s", exc)
        return {"error": f"Could not download source image: {exc}"}

    try:
        fal_image_url = await asyncio.to_thread(fal_client.upload, image_bytes, content_type)
    except Exception as exc:
        logger.error("Failed to upload image to fal.ai storage: %s", exc)
        return {"error": f"fal.ai upload failed: {exc}"}

    t0 = time.perf_counter()
    try:
        result = await asyncio.to_thread(
            fal_client.subscribe,
            _KONTEXT_MODEL,
            arguments={
                "prompt": prompt,
                "image_url": fal_image_url,
                "guidance_scale": 6.5,   # High enough to transform surfaces; low enough to keep room geometry
                "num_inference_steps": 35,
                "num_images": 1,
                "output_format": "jpeg",
            },
        )
    except Exception as exc:
        logger.error("FLUX Kontext edit failed: %s", exc)
        return {"error": str(exc)}

    elapsed = time.perf_counter() - t0

    images = result.get("images") or []
    if not images:
        return {"error": "FLUX Kontext returned no images"}

    out_url = images[0].get("url") or str(images[0])
    logger.info("FLUX Kontext edit completed in %.1fs: %s", elapsed, out_url[:80])

    return {
        "image_url": out_url,
        "prompt_used": prompt,
        "revised_prompt": None,
        "generation_time": round(elapsed, 1),
    }


async def generate_room_image_ideogram(prompt: str) -> dict:
    """Generate a photorealistic room image using Ideogram v3 on fal.ai.

    Returns:
        {"image_url": str, "prompt_used": str, "revised_prompt": None, "generation_time": float}
    On error returns {"error": str}.
    """
    ok, fal_client = _init_fal()
    if not ok:
        return {"error": "FAL_API_KEY not set or fal-client not installed"}

    t0 = time.perf_counter()
    try:
        result = await asyncio.to_thread(
            fal_client.subscribe,
            _IDEOGRAM_MODEL,
            arguments={
                "prompt": prompt,
                "negative_prompt": (
                    "ugly, blurry, distorted, low quality, watermark, text overlay, "
                    "cartoon, anime, sketch, illustration, 3D render, CGI, "
                    "deformed furniture, unrealistic proportions, empty room, bare walls, "
                    "people, humans, faces"
                ),
                "aspect_ratio": "4:3",
                "style": "REALISTIC",
                "magic_prompt_option": "off",
                "num_images": 1,
            },
        )
    except Exception as exc:
        logger.error("Ideogram v3 generation failed: %s", exc)
        return {"error": str(exc)}

    elapsed = time.perf_counter() - t0

    images = result.get("images") or []
    if not images:
        return {"error": "Ideogram v3 returned no images"}

    image_url = images[0].get("url") or str(images[0])
    logger.info("Ideogram v3 generation completed in %.1fs: %s", elapsed, image_url[:80])

    return {
        "image_url": image_url,
        "prompt_used": prompt,
        "revised_prompt": None,
        "generation_time": round(elapsed, 1),
    }
