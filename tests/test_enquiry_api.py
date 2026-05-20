"""Tests for enquiry API endpoints.

All DB and storage calls mocked via dependency_overrides and patch.
No live connections required.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.enquiry import Enquiry, EnquiryPhoto
from app.models.material import FurnitureCatalogue

# ── Helpers ───────────────────────────────────────────────────────────────────

TEST_SLUG = "ramesh-mumbai"
FAKE_STORAGE_URL = "https://supabase.test/storage/v1/object/public/bucket/photo.jpg"


def _make_carpenter(slug: str = TEST_SLUG) -> MagicMock:
    c = MagicMock(spec=Carpenter)
    c.id = uuid.uuid4()
    c.name = "Ramesh Kumar"
    c.city = "Mumbai"
    c.phone = "9876543210"
    c.photo_url = None
    c.speciality = ["wardrobe", "kitchen"]
    c.quote_link_slug = slug
    return c


def _make_catalogue_item(item_type: str, display_name: str) -> MagicMock:
    item = MagicMock(spec=FurnitureCatalogue)
    item.item_type = item_type
    item.display_name = display_name
    item.thumbnail_url = None
    return item


def _make_enquiry(carpenter_id: uuid.UUID, status: str = "new") -> MagicMock:
    e = MagicMock(spec=Enquiry)
    e.id = uuid.uuid4()
    e.carpenter_id = carpenter_id
    e.client_name = "Priya Sharma"
    e.client_phone = "9123456789"
    e.room_type = "bedroom"
    e.furniture_needed = ["wardrobe"]
    e.room_notes = None
    e.status = status
    e.share_token = "tok_abc123def"
    e.created_at = datetime.now(timezone.utc)
    return e


def _override_db(mock_db):
    async def _dep():
        yield mock_db
    return _dep


def _jpeg_bytes(size: int = 100) -> bytes:
    return b"\xff\xd8\xff\xe0" + b"\x00" * size


# ── get_client_form ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_form_valid_slug():
    """Returns carpenter info and catalogue items."""
    carpenter = _make_carpenter()
    catalogue = [
        _make_catalogue_item("wardrobe_hinged_3door", "Wardrobe (3-Door)"),
        _make_catalogue_item("tv_unit_floor", "TV Unit"),
    ]
    db = MagicMock()
    carp_res = MagicMock(); carp_res.scalar_one_or_none = MagicMock(return_value=carpenter)
    cat_res = MagicMock(); cat_res.scalars.return_value.all.return_value = catalogue
    db.execute = AsyncMock(side_effect=[carp_res, cat_res])

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/v1/enquiry/form/{TEST_SLUG}")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["carpenter_name"] == "Ramesh Kumar"
    assert body["carpenter_city"] == "Mumbai"
    assert len(body["furniture_types"]) == 2
    assert body["furniture_types"][0]["item_type"] == "wardrobe_hinged_3door"


@pytest.mark.asyncio
async def test_get_form_invalid_slug():
    """Unknown slug → 404 with structured error."""
    db = MagicMock()
    res = MagicMock(); res.scalar_one_or_none = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=res)

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/enquiry/form/nobody-here")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert detail["error"] == "Link not found"


# ── submit_enquiry ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_creates_enquiry():
    """Valid submission → 201, DB row created, share_token in response."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id)

    db = MagicMock()
    carp_res = MagicMock(); carp_res.scalar_one_or_none = MagicMock(return_value=carpenter)
    db.execute = AsyncMock(return_value=carp_res)
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.id = enquiry.id
        obj.share_token = enquiry.share_token

    db.refresh = fake_refresh

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/enquiry/submit", json={
                "carpenter_slug": TEST_SLUG,
                "client_name": "Priya Sharma",
                "client_phone": "9123456789",
                "room_type": "bedroom",
                "furniture_needed": ["wardrobe"],
            })
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 201
    body = resp.json()
    assert "share_token" in body
    assert "upload_url" in body
    assert "Ramesh Kumar" in body["message"]
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_invalid_phone():
    """Phone not starting with 6-9 → 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/enquiry/submit", json={
            "carpenter_slug": TEST_SLUG,
            "client_name": "Ravi",
            "client_phone": "1234567890",
            "room_type": "bedroom",
            "furniture_needed": ["wardrobe"],
        })
    assert resp.status_code == 422
    assert any("mobile" in str(e).lower() for e in resp.json()["detail"])


@pytest.mark.asyncio
async def test_submit_invalid_room_type():
    """Unknown room_type → 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/enquiry/submit", json={
            "carpenter_slug": TEST_SLUG,
            "client_name": "Ravi",
            "client_phone": "9876543210",
            "room_type": "garage",
            "furniture_needed": ["wardrobe"],
        })
    assert resp.status_code == 422


# ── upload_photos ─────────────────────────────────────────────────────────────

def _make_upload_db(enquiry, existing_count: int = 0) -> MagicMock:
    db = MagicMock()
    enq_res = MagicMock(); enq_res.scalar_one_or_none = MagicMock(return_value=enquiry)
    count_res = MagicMock(); count_res.scalar = MagicMock(return_value=existing_count)
    db.execute = AsyncMock(side_effect=[enq_res, count_res])
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_photo_upload_success():
    """Valid JPEG upload → 201, EnquiryPhoto row added, status updated."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id)
    db = _make_upload_db(enquiry, existing_count=0)

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        with patch("app.api.enquiry.storage_service.upload", new=AsyncMock(return_value=FAKE_STORAGE_URL)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    f"/api/v1/enquiry/{enquiry.id}/photos",
                    files=[("photos", ("room.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 201
    body = resp.json()
    assert body["photos_uploaded"] == 1
    assert body["total_photos"] == 1
    assert enquiry.status == "photos_uploaded"
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_photo_upload_too_many():
    """8 photos already uploaded → 400 on 9th attempt."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id)
    db = _make_upload_db(enquiry, existing_count=8)

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/enquiry/{enquiry.id}/photos",
                files=[("photos", ("room.jpg", _jpeg_bytes(), "image/jpeg"))],
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 400
    assert "8" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_photo_upload_wrong_type():
    """PDF upload → 400."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id)
    db = _make_upload_db(enquiry, existing_count=0)

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/enquiry/{enquiry.id}/photos",
                files=[("photos", ("doc.pdf", b"%PDF-1.4 content", "application/pdf"))],
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 400
    assert "pdf" in resp.json()["detail"].lower() or "unsupported" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_photo_upload_too_large():
    """File over 5 MB → 413."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id)
    db = _make_upload_db(enquiry, existing_count=0)

    big_file = b"\xff\xd8\xff\xe0" + b"\x00" * (5 * 1024 * 1024 + 1)

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/enquiry/{enquiry.id}/photos",
                files=[("photos", ("big.jpg", big_file, "image/jpeg"))],
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 413


# ── status check ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_check_returns_correct_status():
    """GET /{share_token} returns the enquiry status and carpenter name."""
    carpenter = _make_carpenter()
    enquiry = _make_enquiry(carpenter.id, status="photos_uploaded")

    db = MagicMock()
    enq_res = MagicMock(); enq_res.scalar_one_or_none = MagicMock(return_value=enquiry)
    carp_res = MagicMock(); carp_res.scalar_one_or_none = MagicMock(return_value=carpenter)
    # status="photos_uploaded" so no quote lookup needed — but router still calls execute once more
    # for the quote (won't reach it since status is not 'quoted'), so only 2 execute calls
    db.execute = AsyncMock(side_effect=[enq_res, carp_res])

    app.dependency_overrides[get_db] = _override_db(db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/v1/enquiry/{enquiry.share_token}")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "photos_uploaded"
    assert body["carpenter_name"] == "Ramesh Kumar"
    assert body["quote_link"] is None
