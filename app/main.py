"""CarpentrIQ FastAPI application — init, CORS, routers, health check."""

import logging
import os
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
import redis.asyncio as aioredis

from app.api import auth, billing, carpenter, catalogue, cv, enquiry, furniture_ai, homeowner, homeowner_auth, jobs, profile, quote, webhooks
from app.middleware.trial_check import TrialCheckMiddleware
from app.database import AsyncSessionLocal
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CarpentrIQ API",
    description="AI Operating System for Indian Carpenters",
    version="1.0.0",
)

app.add_middleware(TrialCheckMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
app.include_router(carpenter.router, prefix=f"{API_PREFIX}/carpenter", tags=["carpenter"])
app.include_router(enquiry.router, prefix=f"{API_PREFIX}/enquiry", tags=["enquiry"])
app.include_router(cv.router, prefix=f"{API_PREFIX}/cv", tags=["cv"])
app.include_router(quote.router, prefix=f"{API_PREFIX}/quote", tags=["quote"])
app.include_router(catalogue.router, prefix=f"{API_PREFIX}/catalogue", tags=["catalogue"])
app.include_router(billing.router, prefix=f"{API_PREFIX}/billing", tags=["billing"])
app.include_router(jobs.router, prefix=f"{API_PREFIX}/jobs", tags=["jobs"])
app.include_router(webhooks.router, prefix=f"{API_PREFIX}/webhooks", tags=["webhooks"])
app.include_router(furniture_ai.router, prefix=f"{API_PREFIX}/furniture-ai", tags=["furniture-ai"])
app.include_router(profile.router, prefix=f"{API_PREFIX}/profile", tags=["profile"])
app.include_router(homeowner_auth.router, prefix=f"{API_PREFIX}/homeowner-auth", tags=["homeowner-auth"])
app.include_router(homeowner.router, prefix=f"{API_PREFIX}/homeowner", tags=["homeowner"])

# ── APScheduler: expire sent quotes hourly ────────────────────────────────────

scheduler = AsyncIOScheduler()


async def expire_overdue_quotes() -> None:
    """Mark sent quotes as expired when validity window has passed."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    UPDATE quotes
                    SET status = 'expired'
                    WHERE status = 'sent'
                      AND created_at + (validity_days * INTERVAL '1 day') < NOW()
                    """
                )
            )
            await session.commit()
            if result.rowcount:
                logger.info("Expired %d quote(s)", result.rowcount)
    except Exception as exc:
        logger.error("Quote expiry job failed: %s", exc)


@app.on_event("startup")
async def startup() -> None:
    scheduler.add_job(
        expire_overdue_quotes,
        "interval",
        hours=1,
        id="expire_quotes",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info("APScheduler started — quote expiry job running every hour")

    # Log env var names (never values) to confirm .env loaded
    env_keys = [k for k in os.environ if not k.startswith("_")]
    logger.info("Environment variables loaded: %s", sorted(env_keys))

    db_host = urlparse(settings.database_url).hostname or "unknown"
    redis_host = urlparse(settings.redis_url).hostname or "unknown"
    logger.info("CarpentrIQ API starting... DB: %s, Redis: %s", db_host, redis_host)


@app.on_event("shutdown")
async def shutdown() -> None:
    scheduler.shutdown(wait=False)


@app.get("/health")
async def health() -> dict:
    """Liveness probe — always returns 200; reports component health in body."""
    result: dict = {"status": "ok", "version": "1.0.0", "db": "error", "redis": "error"}

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        result["db"] = "connected"
    except Exception as exc:
        logger.warning("Health check — DB error: %s", exc)

    try:
        import ssl as _ssl
        ssl_ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_CLIENT)
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=10, ssl_context=ssl_ctx)
        await r.ping()
        await r.aclose()
        result["redis"] = "connected"
    except Exception as exc:
        logger.warning("Health check — Redis error: %s", exc)

    if result["db"] == "error" or result["redis"] == "error":
        result["status"] = "degraded"

    return result
