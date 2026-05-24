"""Tests for auth endpoints and AuthService.

All tests mock the DB session and Redis via FastAPI dependency_overrides —
no live DB or Redis connections needed.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import get_db
from app.dependencies import get_redis
from app.services.auth_service import auth_service

# ── Helpers ───────────────────────────────────────────────────────────────────

VALID_PHONE = "9876543210"
VALID_EMAIL = "test@example.com"
INVALID_PHONE = "1234567890"   # starts with 1 — not an Indian mobile


def _make_mock_redis(stored_otp: str | None = "123456") -> MagicMock:
    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    raw = stored_otp.encode() if stored_otp is not None else None
    redis.get = AsyncMock(return_value=raw)
    return redis


def _make_mock_carpenter(phone: str = VALID_PHONE, name: str = "") -> MagicMock:
    from app.models.carpenter import Carpenter
    c = MagicMock(spec=Carpenter)
    c.id = uuid.uuid4()
    c.phone = phone
    c.name = name
    return c


def _make_mock_db(carpenter: MagicMock | None = None) -> MagicMock:
    db = MagicMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none = MagicMock(return_value=carpenter)
    db.execute = AsyncMock(return_value=scalar_result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _override_db(mock_db):
    async def _dep():
        yield mock_db
    return _dep


def _override_redis(mock_redis):
    async def _dep():
        yield mock_redis
    return _dep


# ── send-otp ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_otp_valid_phone_creates_new_carpenter():
    """New phone → carpenter row created, OTP stored in Redis, 200 returned."""
    mock_redis = _make_mock_redis()
    mock_db = _make_mock_db(carpenter=None)

    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(mock_redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/send-otp", json={"phone": VALID_PHONE, "email": VALID_EMAIL}
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200
    body = resp.json()
    assert VALID_EMAIL in body["message"]
    assert body["expires_in_seconds"] == 600
    mock_redis.set.assert_called_once()
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_send_otp_invalid_phone_returns_422():
    """Phone starting with 1 must be rejected with 422."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/auth/send-otp", json={"phone": INVALID_PHONE}
        )

    assert resp.status_code == 422
    errors = resp.json().get("detail", [])
    assert any("Invalid Indian mobile number" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_send_otp_existing_carpenter_not_duplicated():
    """Existing carpenter → no new DB row, but OTP is generated and stored."""
    existing = _make_mock_carpenter()
    mock_redis = _make_mock_redis()
    mock_db = _make_mock_db(carpenter=existing)

    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(mock_redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/send-otp", json={"phone": VALID_PHONE, "email": VALID_EMAIL}
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200
    mock_db.add.assert_not_called()
    mock_redis.set.assert_called_once()


# ── verify-otp ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_otp_correct_returns_jwt_and_carpenter_id():
    """Correct OTP → 200, JWT in response, carpenter_id matches."""
    correct_otp = "654321"
    existing = _make_mock_carpenter(name="")
    mock_redis = _make_mock_redis(stored_otp=correct_otp)
    mock_db = _make_mock_db(carpenter=existing)

    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(mock_redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/verify-otp",
                json={"phone": VALID_PHONE, "otp": correct_otp},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["carpenter_id"] == str(existing.id)
    assert body["is_new_carpenter"] is True   # empty name → new carpenter


@pytest.mark.asyncio
async def test_verify_otp_wrong_returns_400():
    """Wrong OTP → 400 with error detail."""
    mock_redis = _make_mock_redis(stored_otp="111111")
    mock_db = _make_mock_db(carpenter=_make_mock_carpenter())

    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(mock_redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/verify-otp",
                json={"phone": VALID_PHONE, "otp": "999999"},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 400
    assert "Invalid" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_verify_otp_used_twice_second_attempt_fails():
    """After successful verify the Redis key is deleted — second attempt must fail."""
    correct_otp = "777777"
    existing = _make_mock_carpenter()
    deleted = {"done": False}

    async def fake_get(key):
        return None if deleted["done"] else correct_otp.encode()

    async def fake_delete(key):
        deleted["done"] = True
        return 1

    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)
    redis.get = fake_get
    redis.delete = fake_delete

    mock_db = _make_mock_db(carpenter=existing)
    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            r1 = await client.post(
                "/api/v1/auth/verify-otp",
                json={"phone": VALID_PHONE, "otp": correct_otp},
            )
            r2 = await client.post(
                "/api/v1/auth/verify-otp",
                json={"phone": VALID_PHONE, "otp": correct_otp},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert r1.status_code == 200
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_verify_otp_expired_redis_returns_none():
    """Redis returns None (TTL expired) → 400."""
    mock_redis = _make_mock_redis(stored_otp=None)
    mock_db = _make_mock_db(carpenter=_make_mock_carpenter())

    app.dependency_overrides[get_db] = _override_db(mock_db)
    app.dependency_overrides[get_redis] = _override_redis(mock_redis)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/verify-otp",
                json={"phone": VALID_PHONE, "otp": "123456"},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 400


# ── Unit tests for AuthService directly ──────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_service_generate_otp_stores_in_redis():
    redis = _make_mock_redis()
    otp = await auth_service.generate_otp(VALID_PHONE, redis)
    assert len(otp) == 6
    assert otp.isdigit()
    redis.set.assert_called_once()
    key_used = redis.set.call_args[0][0]
    assert f"otp:{VALID_PHONE}" in key_used
    assert redis.set.call_args[1]["ex"] == 600


@pytest.mark.asyncio
async def test_auth_service_verify_otp_correct():
    redis = _make_mock_redis(stored_otp="424242")
    result = await auth_service.verify_otp(VALID_PHONE, "424242", redis)
    assert result is True
    redis.delete.assert_called_once()


@pytest.mark.asyncio
async def test_auth_service_verify_otp_wrong():
    redis = _make_mock_redis(stored_otp="424242")
    result = await auth_service.verify_otp(VALID_PHONE, "000000", redis)
    assert result is False
    redis.delete.assert_not_called()


def test_auth_service_create_and_decode_token():
    cid = uuid.uuid4()
    token = auth_service.create_access_token(cid)
    decoded = auth_service.decode_token(token)
    assert decoded == str(cid)
