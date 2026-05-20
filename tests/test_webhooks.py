"""Tests for Razorpay webhook endpoint.

All tests use dependency_overrides to inject a mock DB — no real DB required.
HMAC signatures are generated with the same algorithm as production to exercise
the full verification path.

Coverage:
  - test_valid_signature_payment_captured        correct HMAC → Payment record created
  - test_invalid_signature_returns_200           wrong HMAC → 200, no DB write
  - test_payment_captured_updates_carpenter_revenue  revenue field incremented
  - test_unknown_event_returns_200               arbitrary event type → 200
  - test_idempotent_duplicate_event              same payment_id twice → no duplicate row
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.carpenter import Carpenter
from app.models.payment import Payment
from app.models.quote import Quote

WEBHOOK_URL = "/api/v1/webhooks/razorpay"
TEST_SECRET = "test_webhook_secret_xyz"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sign(body: bytes, secret: str = TEST_SECRET) -> str:
    """Generate the correct HMAC-SHA256 hex digest — mirrors production logic."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _payment_link_paid_body(
    payment_id: str = "pay_test123",
    amount_paise: int = 3500000,
    quote_id: str | None = None,
    carpenter_id: str | None = None,
) -> bytes:
    """Build a realistic payment_link.paid webhook payload."""
    return json.dumps({
        "event": "payment_link.paid",
        "payload": {
            "payment": {
                "entity": {
                    "id": payment_id,
                    "amount": amount_paise,
                }
            },
            "payment_link": {
                "entity": {
                    "notes": {
                        "type": "advance",
                        "quote_id": quote_id or str(uuid.uuid4()),
                        "carpenter_id": carpenter_id or str(uuid.uuid4()),
                    }
                }
            },
        },
    }).encode()


def _override_db(mock_db):
    async def _dep():
        yield mock_db
    return _dep


def _mock_result(value):
    """Return an AsyncMock execute result whose scalar_one_or_none() returns value."""
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _make_quote(quote_id: uuid.UUID, carpenter_id: uuid.UUID) -> MagicMock:
    q = MagicMock(spec=Quote)
    q.id = quote_id
    q.carpenter_id = carpenter_id
    return q


def _make_carpenter(carpenter_id: uuid.UUID, revenue: float = 0.0) -> MagicMock:
    c = MagicMock(spec=Carpenter)
    c.id = carpenter_id
    c.total_revenue_processed = revenue
    return c


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_signature_payment_captured():
    """Correct HMAC + payment_link.paid → Payment record added to DB."""
    quote_id = uuid.uuid4()
    carpenter_id = uuid.uuid4()

    mock_quote = _make_quote(quote_id, carpenter_id)
    mock_carpenter = _make_carpenter(carpenter_id)

    added = []
    mock_db = MagicMock()
    mock_db.add.side_effect = lambda row: added.append(row)
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[
        _mock_result(mock_quote),       # Quote lookup
        _mock_result(None),             # idempotency check — no existing Payment
        _mock_result(mock_carpenter),   # Carpenter lookup for revenue update
    ])

    body = _payment_link_paid_body(
        payment_id="pay_abc111",
        amount_paise=5000000,  # ₹50,000
        quote_id=str(quote_id),
        carpenter_id=str(carpenter_id),
    )
    settings.razorpay_webhook_secret = TEST_SECRET

    app.dependency_overrides[get_db] = _override_db(mock_db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                WEBHOOK_URL,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": _sign(body),
                },
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    payment_rows = [r for r in added if isinstance(r, Payment)]
    assert len(payment_rows) == 1
    p = payment_rows[0]
    assert p.razorpay_payment_id == "pay_abc111"
    assert p.status == "captured"
    assert p.payment_type == "advance"
    assert p.amount == 50000.0          # 5_000_000 paise → ₹50,000
    assert p.paid_at is not None
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalid_signature_returns_200():
    """Wrong HMAC → 200 OK returned immediately; no DB records created."""
    body = _payment_link_paid_body()
    settings.razorpay_webhook_secret = TEST_SECRET

    mock_db = MagicMock()
    mock_db.execute = AsyncMock()
    mock_db.add = MagicMock()

    app.dependency_overrides[get_db] = _override_db(mock_db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                WEBHOOK_URL,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": "completely_wrong_signature",
                },
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    mock_db.execute.assert_not_called()
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_payment_captured_updates_carpenter_revenue():
    """payment_link.paid with valid signature → carpenter.total_revenue_processed incremented."""
    quote_id = uuid.uuid4()
    carpenter_id = uuid.uuid4()

    mock_quote = _make_quote(quote_id, carpenter_id)
    mock_carpenter = _make_carpenter(carpenter_id, revenue=10000.0)

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[
        _mock_result(mock_quote),
        _mock_result(None),              # no existing payment
        _mock_result(mock_carpenter),
    ])

    body = _payment_link_paid_body(
        payment_id="pay_rev999",
        amount_paise=2000000,   # ₹20,000
        quote_id=str(quote_id),
        carpenter_id=str(carpenter_id),
    )
    settings.razorpay_webhook_secret = TEST_SECRET

    app.dependency_overrides[get_db] = _override_db(mock_db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                WEBHOOK_URL,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": _sign(body),
                },
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    # ₹10,000 existing + ₹20,000 new = ₹30,000
    assert mock_carpenter.total_revenue_processed == 30000.0


@pytest.mark.asyncio
async def test_unknown_event_returns_200():
    """Unrecognised event type → 200 OK, no DB writes."""
    body = json.dumps({"event": "subscription.activated", "payload": {}}).encode()
    settings.razorpay_webhook_secret = TEST_SECRET

    mock_db = MagicMock()
    mock_db.execute = AsyncMock()
    mock_db.add = MagicMock()

    app.dependency_overrides[get_db] = _override_db(mock_db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                WEBHOOK_URL,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": _sign(body),
                },
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    mock_db.execute.assert_not_called()
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_idempotent_duplicate_event():
    """Same payment_id arriving twice → second event skipped, no duplicate Payment row."""
    quote_id = uuid.uuid4()
    carpenter_id = uuid.uuid4()

    mock_quote = _make_quote(quote_id, carpenter_id)
    existing_payment = MagicMock(spec=Payment)
    existing_payment.razorpay_payment_id = "pay_dup888"

    added = []
    mock_db = MagicMock()
    mock_db.add.side_effect = lambda row: added.append(row)
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[
        _mock_result(mock_quote),           # Quote lookup
        _mock_result(existing_payment),     # idempotency check — Payment already exists
        # no further calls expected (handler returns early)
    ])

    body = _payment_link_paid_body(
        payment_id="pay_dup888",
        quote_id=str(quote_id),
        carpenter_id=str(carpenter_id),
    )
    settings.razorpay_webhook_secret = TEST_SECRET

    app.dependency_overrides[get_db] = _override_db(mock_db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                WEBHOOK_URL,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": _sign(body),
                },
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    # No new Payment row should have been added
    payment_rows = [r for r in added if isinstance(r, Payment)]
    assert len(payment_rows) == 0
    mock_db.commit.assert_not_awaited()
