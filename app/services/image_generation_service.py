"""Room image generation and editing.

generate_room_image  — DALL-E 3 text-to-image for fresh room designs (no reference photo).
edit_room_image      — gpt-image-1 image editing: applies furniture changes directly to an
                       existing room photo, the same model that powers ChatGPT image editing.
"""

from __future__ import annotations

import io
import logging
import time

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_EXT_MAP = {
    "image/jpeg": "room.jpg",
    "image/png":  "room.png",
    "image/webp": "room.webp",
}


async def describe_furniture_from_image(image_url: str) -> str:
    """Send a furniture reference photo to Claude Haiku and get a design description.

    The description is injected into the furniture prompt so gpt-image-1 / DALL-E 3
    generates that exact piece rather than a generic one.

    Returns a plain-text description, or empty string on failure (non-fatal).
    """
    if not settings.anthropic_api_key:
        return ""

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=120,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": image_url}},
                    {
                        "type": "text",
                        "text": (
                            "Describe this furniture piece for an interior design brief. "
                            "Include: style, colour, material, shape, and any distinctive features. "
                            "1-2 sentences only. Be specific and visual."
                        ),
                    },
                ],
            }],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("Furniture vision description failed (non-fatal): %s", exc)
        return ""


async def describe_style_from_image(image_url: str) -> str:
    """Send a mood/style reference photo to Claude Haiku and get a complete room design brief.

    Used when the user uploads a reference room or inspiration image to indicate the
    design direction they want. Returns a rich design brief covering all surfaces and
    aesthetics so the AI can replicate the exact style in the generated image.

    Returns a plain-text design brief, or empty string on failure (non-fatal).
    """
    if not settings.anthropic_api_key:
        return ""

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=250,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": image_url}},
                    {
                        "type": "text",
                        "text": (
                            "Describe the interior design style of this room for a design brief that will be used to completely redesign another room to match this aesthetic. "
                            "Be specific and visual. Cover: "
                            "(1) Wall treatment — material, texture, colour, any panelling or accent walls; "
                            "(2) Ceiling — false ceiling design, lighting type, cove/recessed/pendant; "
                            "(3) Flooring — material, colour, pattern; "
                            "(4) Colour palette — dominant and accent colours; "
                            "(5) Furniture style — shapes, materials, upholstery; "
                            "(6) Lighting mood — warm/cool, dramatic/soft. "
                            "3-4 sentences, very specific and visual. No generic phrases."
                        ),
                    },
                ],
            }],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("Style vision description failed (non-fatal): %s", exc)
        return ""


async def edit_room_image(
    image_bytes: bytes,
    content_type: str,
    prompt: str,
    extra_references: list[tuple[bytes, str]] | None = None,
) -> dict:
    """Apply furniture changes to an existing room photo using gpt-image-1.

    gpt-image-1 is the model that powers ChatGPT's image editing. It understands
    the full uploaded photo and makes targeted edits based on the prompt — no mask,
    no transparency, no conversion required.

    extra_references: additional images (sofa ref, style board, etc.) passed
    alongside the room photo so gpt-image-1 can see the actual reference pieces.

    Returns:
        {
            "image_b64": str,           # base64-encoded PNG of the edited image
            "prompt_used": str,
            "generation_time": float
        }
    On error returns {"error": str}.
    """
    if not settings.openai_api_key:
        return {"error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env"}

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Build image list: room photo first, then any reference images
    images: list = [(
        _EXT_MAP.get(content_type, "room.jpg"),
        io.BytesIO(image_bytes),
        content_type,
    )]
    if extra_references:
        for i, (ref_bytes, ref_ct) in enumerate(extra_references):
            images.append((
                f"reference_{i + 1}.{_EXT_MAP.get(ref_ct, 'ref.jpg').split('.')[-1]}",
                io.BytesIO(ref_bytes),
                ref_ct,
            ))

    t0 = time.perf_counter()
    try:
        response = await client.images.edit(
            model="gpt-image-1",
            image=images,
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="medium",   # high=$0.164, medium=$0.042, low=$0.011 per image
        )
    except Exception as exc:
        logger.error("gpt-image-1 edit failed: %s", exc)
        return {"error": str(exc)}

    elapsed = time.perf_counter() - t0
    b64 = response.data[0].b64_json
    if not b64:
        return {"error": "gpt-image-1 returned no image data"}

    logger.info("gpt-image-1 image edit completed in %.1fs", elapsed)

    return {
        "image_b64": b64,
        "prompt_used": prompt,
        "generation_time": round(elapsed, 1),
    }


async def translate_change_request(change_request: str) -> str:
    """Translate a multilingual room change request into an English design instruction.

    Accepts Hindi, Urdu, Marathi, or English. Uses Claude Haiku to produce a
    precise, visual interior design edit instruction ready for FLUX Kontext.

    Falls back to the original text on any failure — always returns something usable.
    """
    if not settings.anthropic_api_key:
        return change_request

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": (
                    "An Indian carpenter or client wrote this room interior design change request. "
                    "It may be in Hindi, Urdu, Marathi, or English.\n\n"
                    f"Change request: {change_request}\n\n"
                    "Translate this into a precise interior design edit instruction in English. "
                    "Be specific and visual — describe exactly what to change in the room image. "
                    "Start directly with the instruction, no preamble. "
                    "Example: 'Change the wardrobe finish to dark walnut wood, keeping the same design.'"
                ),
            }],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("Change request translation failed, using original: %s", exc)
        return change_request


async def generate_room_image(prompt: str) -> dict:
    """Generate a photorealistic full-room image using DALL-E 3.

    Returns:
        {
            "image_url": str,
            "prompt_used": str,
            "revised_prompt": str | None,
            "generation_time": float   # seconds
        }
    On error returns {"error": str}.
    """
    if not settings.openai_api_key:
        return {"error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env"}

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    t0 = time.perf_counter()
    try:
        response = await client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",  # hd=$0.08, standard=$0.04 per image
            n=1,
        )
    except Exception as exc:
        logger.error("DALL-E 3 generation failed: %s", exc)
        return {"error": str(exc)}

    elapsed = time.perf_counter() - t0
    image_data = response.data[0]

    logger.info("DALL-E 3 image generated in %.1fs", elapsed)

    return {
        "image_url": image_data.url,
        "prompt_used": prompt,
        "revised_prompt": image_data.revised_prompt,
        "generation_time": round(elapsed, 1),
    }
