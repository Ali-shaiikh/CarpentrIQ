"""Verify DB schema — prints all table names and row counts.

Run: python scripts/verify_schema.py
Expected: 9 tables (carpenters, enquiries, enquiry_photos, cv_results,
          furniture_items, quotes, payments, material_prices,
          furniture_catalogue, jobs)
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

EXPECTED_TABLES = [
    "carpenters", "enquiries", "enquiry_photos", "cv_results",
    "furniture_items", "quotes", "payments",
    "material_prices", "furniture_catalogue", "jobs",
]


async def verify() -> None:
    async with AsyncSessionLocal() as session:
        # All user tables in public schema
        result = await session.execute(text("""
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """))
        tables = [r[0] for r in result.fetchall()]

        logger.info("\n── Tables in DB ──────────────────────")
        for t in tables:
            # Row count per table
            count_result = await session.execute(text(f"SELECT COUNT(*) FROM {t}"))
            count = count_result.scalar()
            status = "✓" if t in EXPECTED_TABLES else "?"
            logger.info("  %s %-30s %d rows", status, t, count)

        missing = [t for t in EXPECTED_TABLES if t not in tables]
        if missing:
            logger.error("\n✗ Missing tables: %s", missing)
            sys.exit(1)
        else:
            logger.info("\n✓ All %d expected tables present", len(EXPECTED_TABLES))


if __name__ == "__main__":
    asyncio.run(verify())
