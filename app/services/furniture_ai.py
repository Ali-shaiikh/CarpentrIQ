"""Furniture AI service — image generation (FLUX.1-schnell, free) + 3D extraction (TripoSR).

Two capabilities:
  1. generate_furniture_image()  → FLUX.1-schnell via public HF Space (free, no key)
                                   Falls back to fal.ai if FAL_API_KEY is set.
  2. extract_3d_triposr()        → TripoSR via HF Spaces (free, no key needed)
                                   Returns a GLB file URL stored in Supabase.

Both use gradio_client to call public HF Spaces — zero cost, no account needed.
Budget tiers map to specific material/style descriptors injected into prompts.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import uuid

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# HF Spaces (free, no key)
HF_FLUX_SPACE    = "black-forest-labs/FLUX.1-schnell"
HF_TRIPOSR_SPACE = "stabilityai/TripoSR"

# ── prompt templates ──────────────────────────────────────────────────────────

GRADE_DESCRIPTORS = {
    "budget": (
        "basic laminate finish, plain white or beige colour, simple flat-panel doors, "
        "low-cost particle board construction, standard hardware, clean lines"
    ),
    "standard": (
        "woodgrain laminate finish, Century BWP plywood carcass, Merino laminate shutters, "
        "soft-close hinges, aluminium handles, warm wood tones, modern Indian style"
    ),
    "premium": (
        "Italian lacquer finish, solid wood veneer shutters, concealed European hinges, "
        "brushed gold handles, high-gloss premium finish, luxury interior design, "
        "warm ambient lighting, architectural photography"
    ),
}

FURNITURE_KEYWORDS = {
    "wardrobe":                "sliding/hinged wardrobe, full-height, bedroom furniture",
    "wardrobe_sliding_2door":  "2-door sliding wardrobe, bedroom",
    "wardrobe_hinged_3door":   "3-door hinged wardrobe, bedroom",
    "tv_unit":                 "TV unit, entertainment center, living room",
    "tv_unit_floor":           "floor TV unit with wall unit, living room",
    "kitchen":                 "modular kitchen, Indian style",
    "kitchen_l_shape":         "L-shape modular kitchen, Indian home",
    "bed":                     "platform bed with headboard, bedroom",
    "bed_queen_hydraulic":     "queen hydraulic storage bed, bedroom",
    "study_table_standard":    "study table with bookshelf, home office",
}

BASE_PROMPT = (
    "product photograph of {furniture}, {grade_desc}, {custom}, "
    "white studio background, professional lighting, photorealistic, 4k, "
    "no people, front view, Indian furniture style"
)

NEGATIVE_PROMPT = (
    "blurry, cartoon, sketch, low quality, watermark, text, people, "
    "distorted, extra furniture, cluttered background"
)


# ── image generation — FLUX.1-schnell via HF Space (free) ────────────────────

async def generate_furniture_image(
    item_type: str,
    material_grade: str = "standard",
    custom_prompt: str = "",
    width: int = 1024,
    height: int = 768,
) -> dict:
    """Generate a photorealistic furniture image.

    Primary:  FLUX.1-schnell HF Space (free, no key required, ~10s).
    Fallback: fal.ai FLUX.1-dev (paid, FAL_API_KEY needed).

    Returns {"image_url", "prompt"} or {"error"}.
    """
    grade        = material_grade if material_grade in GRADE_DESCRIPTORS else "standard"
    furniture_kw = FURNITURE_KEYWORDS.get(item_type, item_type.replace("_", " "))
    prompt       = BASE_PROMPT.format(
        furniture=furniture_kw,
        grade_desc=GRADE_DESCRIPTORS[grade],
        custom=custom_prompt or "elegant proportions",
    )

    # Try free HF Space first
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _flux_hf_sync, prompt, width, height)
    if "image_url" in result:
        result["prompt"] = prompt
        return result

    logger.warning("HF Space failed (%s), trying fal.ai", result.get("error"))

    # Fallback: fal.ai (only if key is set and has balance)
    if settings.fal_api_key:
        return await _flux_fal(prompt, width, height)

    return {"error": result.get("error", "Image generation failed")}


def _flux_hf_sync(prompt: str, width: int, height: int) -> dict:
    """Call FLUX.1-schnell public HF Space synchronously (runs in thread pool)."""
    try:
        from gradio_client import Client
        client  = Client(HF_FLUX_SPACE)
        result  = client.predict(
            prompt=prompt,
            seed=0,
            randomize_seed=True,
            width=min(width, 1024),
            height=min(height, 1024),
            num_inference_steps=4,
            api_name="/infer",
        )
        # result is (image_dict, seed)
        img = result[0] if isinstance(result, (list, tuple)) else result
        url = img.get("url") if isinstance(img, dict) else None
        if not url:
            return {"error": "No URL in HF Space response"}
        return {"image_url": url}
    except Exception as exc:
        logger.error("HF FLUX Space failed: %s", exc)
        return {"error": str(exc)}


async def _flux_fal(prompt: str, width: int, height: int) -> dict:
    """fal.ai FLUX.1-dev fallback (requires balance)."""
    FAL_URL = "https://fal.run/fal-ai/flux/dev"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                FAL_URL,
                headers={"Authorization": f"Key {settings.fal_api_key}", "Content-Type": "application/json"},
                json={
                    "prompt": prompt,
                    "negative_prompt": NEGATIVE_PROMPT,
                    "image_size": {"width": width, "height": height},
                    "num_inference_steps": 28,
                    "guidance_scale": 3.5,
                    "num_images": 1,
                    "enable_safety_checker": False,
                },
            )
            resp.raise_for_status()
            images = resp.json().get("images", [])
            if not images:
                return {"error": "No image from fal.ai"}
            return {"image_url": images[0]["url"]}
    except httpx.HTTPStatusError as exc:
        logger.error("fal.ai %s: %s", exc.response.status_code, exc.response.text[:200])
        return {"error": f"fal.ai error {exc.response.status_code}"}
    except Exception as exc:
        return {"error": str(exc)}


# ── TripoSR via Hugging Face Spaces (free, no key) ────────────────────────────
#
# Pipeline:
#   1. Download source image to temp file
#   2. Call TripoSR HF Space → get back .obj file path
#   3. Convert .obj → .glb via trimesh
#   4. Upload .glb to Supabase Storage → return public URL


async def extract_3d_triposr(image_url: str) -> dict:
    """Convert a furniture image to a GLB 3D model using TripoSR (free, HF Spaces).

    Returns {"status": "SUCCEEDED", "glb_url": str} on success,
            {"status": "FAILED",    "error": str}   on failure.

    Runs in a thread pool because gradio_client is synchronous.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_triposr_sync, image_url)


def _run_triposr_sync(image_url: str) -> dict:
    """Synchronous worker — called from thread pool."""
    try:
        from gradio_client import Client, handle_file
    except ImportError:
        return {"status": "FAILED", "error": "gradio_client not installed. Run: pip install gradio_client"}

    try:
        import trimesh  # type: ignore
    except ImportError:
        trimesh = None

    tmp_dir = tempfile.mkdtemp(prefix="triposr_")

    try:
        # ── Step 1: download source image ────────────────────────────────────
        import urllib.request
        img_path = os.path.join(tmp_dir, "input.png")
        urllib.request.urlretrieve(image_url, img_path)
        logger.info("TripoSR: downloaded image to %s", img_path)

        # ── Step 2: call HF Space ─────────────────────────────────────────────
        client = Client(HF_TRIPOSR_SPACE)

        # Step 2a: preprocess (background removal)
        preprocessed = client.predict(
            image=handle_file(img_path),
            do_remove_background=True,
            foreground_ratio=0.85,
            api_name="/preprocess",
        )
        logger.info("TripoSR: preprocessed image")

        # Step 2b: generate 3D
        result = client.predict(
            image=handle_file(preprocessed if isinstance(preprocessed, str) else img_path),
            mc_resolution=256,
            api_name="/generate_3d",
        )
        # result is a tuple: (model_file_path, used_video_path)
        obj_path = result[0] if isinstance(result, (list, tuple)) else result
        logger.info("TripoSR: got model at %s", obj_path)

        # ── Step 3: convert OBJ → GLB ─────────────────────────────────────────
        glb_path = os.path.join(tmp_dir, "model.glb")
        if trimesh is not None:
            mesh = trimesh.load(obj_path, force="mesh")
            mesh.export(glb_path)
            logger.info("TripoSR: converted to GLB at %s", glb_path)
        else:
            # no trimesh — try to use obj directly (Three.js can load OBJ too)
            glb_path = obj_path

        # ── Step 4: upload to Supabase Storage ───────────────────────────────
        glb_public_url = _upload_to_supabase(glb_path)
        return {"status": "SUCCEEDED", "glb_url": glb_public_url}

    except Exception as exc:
        logger.error("TripoSR failed: %s", exc, exc_info=True)
        return {"status": "FAILED", "error": str(exc)}
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _upload_to_supabase(file_path: str) -> str:
    """Upload a file to Supabase Storage and return its public URL."""
    import httpx as _httpx

    if not settings.supabase_url or not settings.supabase_service_key:
        # Dev fallback: serve file via a /static route or return local path
        logger.warning("Supabase not configured — returning local path for GLB")
        return f"file://{file_path}"

    file_name = f"3d-models/{uuid.uuid4().hex}.glb"
    bucket    = settings.storage_bucket

    with open(file_path, "rb") as f:
        content = f.read()

    upload_url = f"{settings.supabase_url}/storage/v1/object/{bucket}/{file_name}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "model/gltf-binary",
    }
    resp = _httpx.put(upload_url, content=content, headers=headers, timeout=60)
    resp.raise_for_status()

    public_url = f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{file_name}"
    logger.info("GLB uploaded to Supabase: %s", public_url)
    return public_url
