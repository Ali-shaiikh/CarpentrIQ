"""Seed material_prices table with Mumbai market rates (April 2026).

Idempotent — safe to run multiple times.
Uses INSERT ... ON CONFLICT DO UPDATE so prices stay current on re-runs.

Run: python scripts/seed_materials.py
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

MUMBAI_PRICES: list[dict] = [
    # Plywood BWP (Boiling Water Proof) — Mumbai April 2026 market rates
    {"material_type": "plywood_bwp_8x4",        "brand": "Century",  "price_inr": 3200, "unit": "sheet"},
    {"material_type": "plywood_bwp_8x4",        "brand": "Greenply", "price_inr": 2950, "unit": "sheet"},
    {"material_type": "plywood_bwp_8x4",        "brand": "Generic",  "price_inr": 2350, "unit": "sheet"},
    # Plywood Commercial — secondary / non-moisture areas
    {"material_type": "plywood_commercial_8x4", "brand": "Century",  "price_inr": 2200, "unit": "sheet"},
    {"material_type": "plywood_commercial_8x4", "brand": "Generic",  "price_inr": 1600, "unit": "sheet"},
    # MDF 18mm — backing panels, shutters
    {"material_type": "mdf_18mm_8x4",           "brand": "Generic",  "price_inr": 1450, "unit": "sheet"},
    # Laminate — visible surfaces (sqft rate)
    {"material_type": "laminate_sqft",           "brand": "Merino",   "price_inr": 95,   "unit": "sqft"},
    {"material_type": "laminate_sqft",           "brand": "Greenlam", "price_inr": 80,   "unit": "sqft"},
    {"material_type": "laminate_sqft",           "brand": "Generic",  "price_inr": 52,   "unit": "sqft"},
    # Edge banding PVC — visible panel edges
    {"material_type": "edge_banding_pvc",        "brand": "Generic",  "price_inr": 15,   "unit": "metre"},
    # Hinges — soft-close (per piece)
    {"material_type": "hinge_softclose",         "brand": "Ebco",     "price_inr": 110,  "unit": "piece"},
    {"material_type": "hinge_softclose",         "brand": "Hettich",  "price_inr": 165,  "unit": "piece"},
    {"material_type": "hinge_softclose",         "brand": "Generic",  "price_inr": 65,   "unit": "piece"},
    # Drawer slides ball-bearing telescopic (per pair)
    {"material_type": "drawer_slide_bb",         "brand": "Ebco",     "price_inr": 210,  "unit": "pair"},
    {"material_type": "drawer_slide_bb",         "brand": "Hettich",  "price_inr": 285,  "unit": "pair"},
    {"material_type": "drawer_slide_bb",         "brand": "Generic",  "price_inr": 110,  "unit": "pair"},
    # Handles stainless steel (per piece)
    {"material_type": "handle_stainless",        "brand": "Generic",  "price_inr": 75,   "unit": "piece"},
    {"material_type": "handle_stainless",        "brand": "Branded",  "price_inr": 175,  "unit": "piece"},
    # Hydraulic lift mechanism — for beds / overhead units
    {"material_type": "hydraulic_lift_mechanism","brand": "Generic",  "price_inr": 520,  "unit": "piece"},
    {"material_type": "hydraulic_lift_mechanism","brand": "Branded",  "price_inr": 850,  "unit": "piece"},
]

CITY = "Mumbai"

UPSERT_SQL = text("""
    INSERT INTO material_prices (id, material_type, brand, city, price_inr, unit, updated_at)
    VALUES (gen_random_uuid(), :material_type, :brand, :city, :price_inr, :unit, NOW())
    ON CONFLICT (material_type, brand, city)
    DO UPDATE SET
        price_inr  = EXCLUDED.price_inr,
        unit       = EXCLUDED.unit,
        updated_at = NOW()
""")


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        for row in MUMBAI_PRICES:
            await session.execute(UPSERT_SQL, {**row, "city": CITY})
        await session.commit()

    logger.info("✓ Seeded %d material price rows for %s", len(MUMBAI_PRICES), CITY)

    # Verify
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM material_prices"))
        count = result.scalar()
        logger.info("✓ material_prices table now has %d rows total", count)


if __name__ == "__main__":
    asyncio.run(seed())
