"""Pytest fixtures — async test client, test DB session, fake Redis."""

from __future__ import annotations

import pytest
import pytest_asyncio
import fakeredis.aioredis as fake_aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.database import AsyncSessionLocal, get_db
from app.dependencies import get_redis
from app.main import app


TEST_PHONE = "9876543210"


# ── Fake Redis ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def fake_redis():
    """In-memory async Redis that never hits Upstash."""
    r = fake_aioredis.FakeRedis()
    yield r
    await r.aclose()


# ── Async DB session ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session():
    """Real async session against the configured PostgreSQL DB.

    Cleans up all test data after each test by deleting in FK-safe order.
    quotes.carpenter_id has no CASCADE in the actual DB, so we delete children first.
    """
    async with AsyncSessionLocal() as session:
        yield session
        # Delete in FK-safe order — children before parents
        cleanup_sql = [
            # jobs → quotes (quote_id FK)
            """DELETE FROM jobs WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone)""",
            # payments → quotes + carpenters
            """DELETE FROM payments WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone)""",
            # quotes → carpenters + enquiries
            """DELETE FROM quotes WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone)""",
            # furniture_items → enquiries
            """DELETE FROM furniture_items WHERE enquiry_id IN
               (SELECT id FROM enquiries WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone))""",
            # cv_results → enquiry_photos
            """DELETE FROM cv_results WHERE enquiry_photo_id IN
               (SELECT ep.id FROM enquiry_photos ep
                JOIN enquiries e ON ep.enquiry_id = e.id
                JOIN carpenters c ON e.carpenter_id = c.id
                WHERE c.phone = :phone)""",
            # enquiry_photos → enquiries
            """DELETE FROM enquiry_photos WHERE enquiry_id IN
               (SELECT id FROM enquiries WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone))""",
            # enquiries → carpenters
            """DELETE FROM enquiries WHERE carpenter_id IN
               (SELECT id FROM carpenters WHERE phone = :phone)""",
            # carpenters (root)
            "DELETE FROM carpenters WHERE phone = :phone",
        ]
        for sql in cleanup_sql:
            try:
                await session.execute(text(sql), {"phone": TEST_PHONE})
            except Exception:
                await session.rollback()
                raise
        await session.commit()


# ── Async HTTP client ─────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def async_client(fake_redis):
    """HTTPX client wired to the FastAPI app; Redis dependency replaced with fakeredis."""

    async def _override_redis():
        yield fake_redis

    app.dependency_overrides[get_redis] = _override_redis

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.pop(get_redis, None)


# ── Legacy client fixture (kept for other tests) ──────────────────────────────

@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """Async HTTPX client wired to the FastAPI app via ASGITransport."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
