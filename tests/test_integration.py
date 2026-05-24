"""Full happy-path integration test — carpenter signup through client approval.

11 steps:
  1.  POST /auth/send-otp          — create carpenter + store OTP in fakeredis
  2.  POST /auth/verify-otp        — verify OTP, receive JWT
  3.  PUT  /carpenter/profile      — set name + quote_link_slug
  4.  GET  /enquiry/form/:slug     — public: client loads form (verifies slug works)
  5.  POST /enquiry/submit         — client submits enquiry
  6.  POST /enquiry/:id/photos     — client uploads room photo (storage mocked)
  7.  POST /cv/analyse/:id         — carpenter triggers CV (httpx + YOLO mocked)
  8.  POST /quote/generate         — carpenter generates draft quote
  9.  POST /quote/:id/send         — carpenter sends quote (PDF + Razorpay mocked)
  10. GET  /quote/:token/view      — public: client views quote
  11. POST /quote/:token/approve   — public: client approves; verify Job row created

External calls mocked:
  - storage_service.upload      → fake Supabase URL
  - httpx.AsyncClient.get       → fake image bytes (used by cv.py photo downloader)
  - RoomAnalyser.analyse_enquiry_photos → fake RoomAnalysisResult
  - PDFGenerator.generate_quote_pdf    → fake PDF bytes
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from sqlalchemy import select

from app.ml.room_analyser import RoomAnalysisResult
from app.models.material import Job

TEST_PHONE = "9876543210"
TEST_EMAIL = "integration-test@example.com"
TEST_SLUG = "test-carpenter-integration"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _fake_httpx_client(image_bytes: bytes = b"FAKEJPEG") -> MagicMock:
    """Build a mock async httpx.AsyncClient that returns fake image bytes."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.content = image_bytes
    mock_resp.headers = {"content-type": "image/jpeg"}

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


def _fake_cv_result() -> RoomAnalysisResult:
    return RoomAnalysisResult(
        width_mm=3600,
        length_mm=4200,
        height_mm=2700,
        confidence_score=0.88,
        needs_manual_check=False,
        detected_objects=["bed", "wardrobe"],
        reference_used="bed_width",
        message_for_carpenter="Room dimensions estimated from bed reference.",
    )


# ── Main test ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_happy_path(async_client, fake_redis, db_session):
    # ── Step 1: Send OTP ─────────────────────────────────────────────────────
    resp = await async_client.post(
        "/api/v1/auth/send-otp",
        json={"phone": TEST_PHONE, "email": TEST_EMAIL},
    )
    assert resp.status_code == 200, f"send-otp failed: {resp.text}"
    assert "OTP sent" in resp.json()["message"]

    # Read OTP directly from fakeredis (dev mode logs it; tests read it)
    raw_otp = await fake_redis.get(f"otp:{TEST_PHONE}")
    assert raw_otp is not None, "OTP not found in Redis after send-otp"
    otp = raw_otp.decode() if isinstance(raw_otp, bytes) else raw_otp

    # ── Step 2: Verify OTP → JWT ─────────────────────────────────────────────
    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"phone": TEST_PHONE, "otp": otp},
    )
    assert resp.status_code == 200, f"verify-otp failed: {resp.text}"
    data = resp.json()
    token = data["access_token"]
    assert token

    headers = _auth_header(token)

    # ── Step 3: Update profile ────────────────────────────────────────────────
    resp = await async_client.put(
        "/api/v1/carpenter/profile",
        json={
            "name": "Ramesh Carpenter",
            "city": "Mumbai",
            "quote_link_slug": TEST_SLUG,
        },
        headers=headers,
    )
    assert resp.status_code == 200, f"profile update failed: {resp.text}"
    profile = resp.json()
    assert profile["name"] == "Ramesh Carpenter"
    assert profile["quote_link_slug"] == TEST_SLUG

    # ── Step 4: Public — client loads enquiry form ────────────────────────────
    resp = await async_client.get(f"/api/v1/enquiry/form/{TEST_SLUG}")
    assert resp.status_code == 200, f"enquiry form load failed: {resp.text}"
    form_data = resp.json()
    assert form_data["carpenter_name"] == "Ramesh Carpenter"

    # ── Step 5: Client submits enquiry ────────────────────────────────────────
    resp = await async_client.post(
        "/api/v1/enquiry/submit",
        json={
            "carpenter_slug": TEST_SLUG,
            "client_name": "Priya Client",
            "client_phone": "9123456789",
            "room_type": "bedroom",
            "furniture_needed": ["wardrobe_hinged_3door"],
            "room_notes": "West-facing wall, 12ft ceiling",
        },
    )
    assert resp.status_code == 201, f"enquiry submit failed: {resp.text}"
    enq_data = resp.json()
    enquiry_id = enq_data["enquiry_id"]
    client_share_token = enq_data["share_token"]
    assert enquiry_id
    assert client_share_token

    # ── Step 6: Client uploads photos (storage mocked) ───────────────────────
    fake_photo = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)  # minimal JPEG header
    fake_photo.name = "room.jpg"

    with patch(
        "app.services.storage_service.storage_service.upload",
        new=AsyncMock(return_value="https://fake-supabase.co/storage/test/room.jpg"),
    ):
        resp = await async_client.post(
            f"/api/v1/enquiry/{enquiry_id}/photos",
            files=[("photos", ("room.jpg", fake_photo, "image/jpeg"))],
        )
    assert resp.status_code in (200, 201), f"photo upload failed: {resp.text}"
    photo_data = resp.json()
    assert photo_data["photos_uploaded"] == 1

    # ── Step 7: Carpenter triggers CV analysis ────────────────────────────────
    with (
        patch("app.api.cv.httpx.AsyncClient", return_value=_fake_httpx_client()),
        patch(
            "app.ml.room_analyser.RoomAnalyser.analyse_enquiry_photos",
            new=AsyncMock(return_value=_fake_cv_result()),
        ),
    ):
        resp = await async_client.post(
            f"/api/v1/cv/analyse/{enquiry_id}",
            headers=headers,
        )
    assert resp.status_code == 200, f"CV analyse failed: {resp.text}"
    cv_data = resp.json()
    assert cv_data["width_mm"] == 3600
    assert cv_data["confidence_score"] == 0.88
    assert cv_data["needs_manual_check"] is False

    # ── Step 8: Generate draft quote ──────────────────────────────────────────
    resp = await async_client.post(
        "/api/v1/quote/generate",
        json={
            "enquiry_id": enquiry_id,
            "furniture_items": [
                {
                    "item_type": "wardrobe_hinged_3door",
                    "config": {
                        "width_mm": 1800,
                        "height_mm": 2400,
                        "depth_mm": 580,
                        "num_doors": 3,
                        "door_type": "hinged",
                        "num_drawers": 2,
                    },
                    "material_grade": "standard",
                }
            ],
            "labour_rate": 225,
            "margin_pct": 27,
        },
        headers=headers,
    )
    assert resp.status_code == 201, f"quote generate failed: {resp.text}"
    quote_data = resp.json()
    quote_id = quote_data["id"]
    quote_share_token = quote_data["share_token"]
    assert quote_data["status"] == "draft"
    assert float(quote_data["total_amount"]) >= 0

    # ── Step 9: Send quote (PDF + Razorpay mocked) ────────────────────────────
    with (
        patch(
            "app.services.pdf_generator.PDFGenerator.generate_quote_pdf",
            new=AsyncMock(return_value=b"%PDF-1.4 fake"),
        ),
        patch(
            "app.services.storage_service.storage_service.upload",
            new=AsyncMock(return_value="https://fake-supabase.co/storage/quotes/test.pdf"),
        ),
    ):
        resp = await async_client.post(
            f"/api/v1/quote/{quote_id}/send",
            json={"remove_hallmark": False},
            headers=headers,
        )
    assert resp.status_code == 200, f"quote send failed: {resp.text}"
    send_data = resp.json()
    assert send_data["share_token"] == quote_share_token

    # ── Step 10: Public — client views quote ──────────────────────────────────
    resp = await async_client.get(f"/api/v1/quote/{quote_share_token}/view")
    assert resp.status_code == 200, f"quote view failed: {resp.text}"
    view_data = resp.json()
    assert view_data["status"] == "sent"
    assert view_data["carpenter_name"] == "Ramesh Carpenter"
    assert view_data["client_name"] == "Priya Client"
    assert len(view_data["line_items"]) == 1

    # ── Step 11: Client approves — verify Job row created ─────────────────────
    resp = await async_client.post(f"/api/v1/quote/{quote_share_token}/approve")
    assert resp.status_code == 200, f"quote approve failed: {resp.text}"
    approve_data = resp.json()
    assert "approved" in approve_data["message"].lower()

    # Verify Job record exists in DB
    job_result = await db_session.execute(
        select(Job).where(Job.quote_id == UUID(quote_id))
    )
    job = job_result.scalar_one_or_none()
    assert job is not None, "Job row was not created after quote approval"
    assert job.status == "not_started"

    # Verify quote status updated to approved
    resp = await async_client.get(f"/api/v1/quote/{quote_share_token}/view")
    assert resp.json()["status"] == "approved"
