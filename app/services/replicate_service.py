"""Replicate API — image generation and editing.

openai/gpt-image-2      — PRIMARY for all image tasks.
                           With input_images: full interior transformation of a room photo.
                           Without input_images: fresh photorealistic room generation.
                           Pass openai_api_key to pay OpenAI directly (bypasses Replicate markup).
                           aspect_ratio "3:2" for landscape room shots.

adirik/interior-design  — legacy ControlNet model (kept as fallback only).
xlabs-ai/flux-ip-adapter — IP-Adapter style conditioning (kept for furniture-ref path).
"""

from __future__ import annotations

import asyncio
import logging
import os

from app.config import settings

logger = logging.getLogger(__name__)

_GPT_IMAGE_2_MODEL     = "openai/gpt-image-2"
_INTERIOR_DESIGN_MODEL = "adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38"


async def gpt_image_2(
    prompt: str,
    image_url: str | None = None,
    extra_image_urls: list[str] | None = None,
    quality: str = "medium",
) -> dict:
    """Generate or transform a room image using openai/gpt-image-2 via fal.ai.

    image_url provided  → room photo; passed first in image_urls.
    extra_image_urls    → furniture/style reference photos appended after room photo.
    image_url=None      → fresh photorealistic room generation from prompt alone.

    Returns {"image_url": str, "prompt_used": str, "revised_prompt": None, "generation_time": float}
    or {"error": str}.
    """
    if not settings.fal_api_key:
        return {"error": "FAL_API_KEY not set in .env"}

    import time
    os.environ["FAL_KEY"] = settings.fal_api_key

    try:
        import fal_client
    except ImportError:
        return {"error": "fal-client not installed. Run: pip install fal-client"}

    t0 = time.perf_counter()

    arguments: dict = {
        "prompt":        prompt,
        "image_size":    "landscape_4_3",
        "quality":       quality,
        "num_images":    1,
        "output_format": "jpeg",
    }
    all_urls: list[str] = []
    if image_url:
        all_urls.append(image_url)
    if extra_image_urls:
        all_urls.extend(extra_image_urls)
    if all_urls:
        arguments["image_urls"] = all_urls

    try:
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "openai/gpt-image-2",
            arguments=arguments,
        )
    except Exception as exc:
        logger.error("gpt-image-2 (fal.ai) failed: %s", exc)
        return {"error": str(exc)}

    elapsed = time.perf_counter() - t0

    images = result.get("images") or []
    if not images:
        return {"error": "gpt-image-2 returned no images"}

    out_url = images[0].get("url") or str(images[0])
    logger.info("gpt-image-2 (fal.ai) completed in %.1fs: %s", elapsed, out_url[:80])
    return {
        "image_url":       out_url,
        "prompt_used":     prompt,
        "revised_prompt":  None,
        "generation_time": round(elapsed, 1),
    }

# xlabs-ai/flux-ip-adapter: Flux base model + IP-Adapter conditioning.
_MODEL = "xlabs-ai/flux-ip-adapter"
_IP_ADAPTER_SCALE = 0.8


async def edit_room_interior_design(
    image_url: str,
    prompt: str,
    notes: str = "",
) -> dict:
    """Apply interior design changes to a room photo using adirik/interior-design.

    ControlNet-based model — preserves the room's spatial geometry automatically
    (walls, doors, windows, passages) while applying new furniture and style.

    Returns {"image_url": str, "prompt_used": str, "generation_time": float}
    or {"error": str}.
    """
    if not settings.replicate_api_token:
        return {"error": "REPLICATE_API_TOKEN not set in .env"}

    os.environ["REPLICATE_API_TOKEN"] = settings.replicate_api_token

    try:
        import replicate as _replicate
    except ImportError:
        return {"error": "replicate package not installed. Run: pip install replicate"}

    import time
    t0 = time.perf_counter()

    negative_prompt = (
        "lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, "
        "blurry, blur, out of focus, out of frame, surreal, ugly, beginner, amateur, "
        "distorted, extra furniture, blocked doorway, blocked passage, blocked window, "
        "closed archway, furniture in doorway"
    )

    full_prompt = prompt
    if notes:
        full_prompt = f"{prompt}, {notes}"

    try:
        output = await asyncio.to_thread(
            _replicate.run,
            _INTERIOR_DESIGN_MODEL,
            input={
                "image":              image_url,
                "prompt":             full_prompt,
                "a_prompt":           "best quality, extremely detailed, photorealistic, interior design",
                "n_prompt":           negative_prompt,
                "num_samples":        1,
                "ddim_steps":         40,
                "scale":              10,
                "seed":               -1,
                "image_resolution":   768,
                "detect_resolution":  512,
            },
        )

        urls = list(output) if hasattr(output, "__iter__") else [output]
        image_out = str(urls[0]) if urls else None
        if not image_out:
            return {"error": "adirik/interior-design returned no image"}

        elapsed = time.perf_counter() - t0
        logger.info("interior-design completed in %.1fs: %s", elapsed, image_out[:80])
        return {
            "image_url":        image_out,
            "prompt_used":      full_prompt,
            "revised_prompt":   None,
            "generation_time":  round(elapsed, 1),
        }

    except Exception as exc:
        logger.error("adirik/interior-design failed: %s", exc)
        return {"error": str(exc)}


async def generate_with_furniture_reference(
    prompt: str,
    furniture_reference_url: str,
    room_reference_url: str | None = None,
) -> dict:
    """Generate a room image strongly conditioned on a furniture reference photo.

    When room_reference_url is provided it is used as the init image (img2img),
    anchoring the output to the real room's layout while the furniture reference
    conditions what the furniture looks like.

    Returns:
        {"image_url": str}   — a Replicate-hosted URL (valid for 1 hour)
    On error returns {"error": str}.
    """
    if not settings.replicate_api_token:
        return {"error": "REPLICATE_API_TOKEN not set in .env"}

    os.environ["REPLICATE_API_TOKEN"] = settings.replicate_api_token

    try:
        import replicate as _replicate
    except ImportError:
        return {"error": "replicate package not installed. Run: pip install replicate"}

    input_payload: dict = {
        "prompt": prompt,
        "image_prompt": furniture_reference_url,  # xlabs-ai/flux-ip-adapter param name
        "ip_adapter_scale": _IP_ADAPTER_SCALE,
        "negative_prompt": (
            "ugly, blurry, distorted, low quality, watermark, text, "
            "deformed furniture, wrong proportions, extra limbs, "
            "extra sofa, additional sofa, unwanted chairs, extra furniture, "
            "furniture not requested, duplicate furniture, crowded room"
        ),
        "num_inference_steps": 30,
        "guidance_scale": 7.5,
        "width": 1024,
        "height": 1024,
    }

    if room_reference_url:
        input_payload["image"] = room_reference_url
        input_payload["prompt_strength"] = 0.85  # how much to transform vs. keep original

    try:
        output = await asyncio.to_thread(
            _replicate.run,
            _MODEL,
            input=input_payload,
        )
        # Replicate returns a list of URLs or an iterator
        if hasattr(output, "__iter__"):
            urls = list(output)
            image_url = str(urls[0]) if urls else None
        else:
            image_url = str(output)

        if not image_url:
            return {"error": "Replicate returned no image"}

        logger.info("Replicate generation completed: %s", image_url[:80])
        return {"image_url": image_url}

    except Exception as exc:
        logger.error("Replicate generation failed: %s", exc)
        return {"error": str(exc)}
