"""Shared FastAPI dependencies."""

from __future__ import annotations

import logging
from typing import AsyncGenerator

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None


def _get_redis_client() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=False,   # keep bytes — auth_service handles both
            ssl_cert_reqs=None,       # Mac Python 3.13 doesn't trust system certs by default
            socket_connect_timeout=0.5, # fail fast if Upstash is unreachable
            socket_timeout=0.5,         # fail fast on read/write stalls
            retry_on_timeout=False,   # don't retry — fall back to in-memory OTP store instead
        )
    return _redis_client


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """FastAPI dependency — yields the shared async Redis client."""
    yield _get_redis_client()
