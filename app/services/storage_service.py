"""Storage service — upload files to Supabase Storage via REST API.

Uses httpx (already in requirements) against the Supabase Storage REST API.
No supabase-py SDK needed — keeps dependencies minimal.

Path convention: enquiry_photos/{enquiry_id}/{filename}
Public URL:      {supabase_url}/storage/v1/object/public/{bucket}/{path}
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_STORAGE_BASE = "{supabase_url}/storage/v1/object/{bucket}/{path}"


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "apikey": settings.supabase_service_key,
    }


class StorageService:

    async def upload(self, file_bytes: bytes, path: str, content_type: str) -> str:
        """Upload file_bytes to Supabase Storage at path, return public URL.

        path example: "enquiry_photos/abc123/photo_0.jpg"
        """
        url = _STORAGE_BASE.format(
            supabase_url=settings.supabase_url,
            bucket=settings.storage_bucket,
            path=path,
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                content=file_bytes,
                headers={
                    **_auth_headers(),
                    "Content-Type": content_type,
                    "x-upsert": "true",   # overwrite if same path re-uploaded
                },
            )
            resp.raise_for_status()

        public_url = (
            f"{settings.supabase_url}/storage/v1/object/public"
            f"/{settings.storage_bucket}/{path}"
        )
        logger.info("Uploaded %d bytes to %s", len(file_bytes), public_url)
        return public_url

    async def delete(self, path: str) -> None:
        """Delete file at path from Supabase Storage."""
        url = _STORAGE_BASE.format(
            supabase_url=settings.supabase_url,
            bucket=settings.storage_bucket,
            path=path,
        )
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.delete(url, headers=_auth_headers())
            resp.raise_for_status()
        logger.info("Deleted storage path: %s", path)

    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        """Return a time-limited signed URL for private files."""
        url = (
            f"{settings.supabase_url}/storage/v1/object/sign"
            f"/{settings.storage_bucket}/{path}"
        )
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers=_auth_headers(),
            )
            resp.raise_for_status()
            signed_path = resp.json()["signedURL"]

        return f"{settings.supabase_url}/storage/v1{signed_path}"


storage_service = StorageService()
