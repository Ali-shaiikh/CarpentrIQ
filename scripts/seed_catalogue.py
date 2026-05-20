"""Seed furniture_catalogue with Indian-specific items and GLB model URLs.

Idempotent — safe to run multiple times.
Uses INSERT ... ON CONFLICT (item_type) DO UPDATE.
GLB model URLs point to /models/ — free files only (v1 cost rule).

Run: python scripts/seed_catalogue.py
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import json
from sqlalchemy import text
from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

CATALOGUE: list[dict] = [
    {
        "item_type":    "wardrobe_sliding_2door",
        "display_name": "Sliding Door Wardrobe (2 Door)",
        "default_config": {
            "width_mm": 1800, "height_mm": 2100, "depth_mm": 580,
            "num_doors": 2, "door_type": "sliding",
            "num_drawers": 2, "has_loft": False,
        },
        "glb_model_url": "/models/wardrobe_sliding.glb",
        "sort_order": 1,
    },
    {
        "item_type":    "wardrobe_hinged_3door",
        "display_name": "3-Door Wardrobe with Loft",
        "default_config": {
            "width_mm": 1800, "height_mm": 2400, "depth_mm": 580,
            "num_doors": 3, "door_type": "hinged",
            "num_drawers": 0, "has_loft": True,
        },
        "glb_model_url": "/models/wardrobe_hinged.glb",
        "sort_order": 2,
    },
    {
        "item_type":    "tv_unit_floor",
        "display_name": "TV Unit with Wall Shelves",
        "default_config": {
            "width_mm": 1800, "height_mm": 450, "depth_mm": 400,
            "has_wall_unit": True, "wall_unit_height_mm": 300,
            "num_shutters": 4,
        },
        "glb_model_url": "/models/tv_unit.glb",
        "sort_order": 3,
    },
    {
        "item_type":    "kitchen_l_shape",
        "display_name": "L-Shape Modular Kitchen",
        "default_config": {
            "layout": "l_shape",
            "base_length_mm": 3000, "wall_length_mm": 2400,
            "num_base_shutters": 10, "num_wall_shutters": 8,
            "num_drawers": 3, "num_baskets": 3,
        },
        "glb_model_url": "/models/kitchen.glb",
        "sort_order": 4,
    },
    {
        "item_type":    "study_table_standard",
        "display_name": "Study Table with Bookshelf",
        "default_config": {
            "width_mm": 1200, "depth_mm": 600,
            "has_bookshelf": True, "num_drawers": 2,
        },
        "glb_model_url": "/models/study_table.glb",
        "sort_order": 5,
    },
    {
        "item_type":    "bed_queen_hydraulic",
        "display_name": "Queen Bed with Hydraulic Storage",
        "default_config": {
            "bed_size": "queen",
            "storage_type": "hydraulic",
        },
        "glb_model_url": "/models/bed_hydraulic.glb",
        "sort_order": 6,
    },
    # Bedroom extras
    {
        "item_type":    "dressing_table",
        "display_name": "Dressing Table & Mirror",
        "default_config": {
            "width_mm": 1050, "height_mm": 1500, "depth_mm": 450,
            "num_drawers": 4, "has_mirror": True,
        },
        "glb_model_url": "/models/dressing_table.glb",
        "sort_order": 7,
    },
    {
        "item_type":    "chest_of_drawers",
        "display_name": "Chest of Drawers",
        "default_config": {
            "width_mm": 900, "height_mm": 1050, "depth_mm": 450,
            "num_drawers": 5,
        },
        "glb_model_url": "/models/chest_of_drawers.glb",
        "sort_order": 8,
    },
    # Living extras
    {
        "item_type":    "bookshelf_unit",
        "display_name": "Bookshelf / Display Unit",
        "default_config": {
            "width_mm": 1200, "height_mm": 2100, "depth_mm": 300,
            "num_shelves": 5, "has_closed_cabinet": True,
        },
        "glb_model_url": "/models/bookshelf.glb",
        "sort_order": 9,
    },
    {
        "item_type":    "crockery_unit",
        "display_name": "Crockery & Bar Unit",
        "default_config": {
            "width_mm": 1200, "height_mm": 2100, "depth_mm": 350,
            "has_glass_shutters": True, "num_shutters": 4,
        },
        "glb_model_url": "/models/crockery_unit.glb",
        "sort_order": 10,
    },
    # Dining
    {
        "item_type":    "dining_table_set",
        "display_name": "Dining Table & Chairs",
        "default_config": {
            "seaters": 6, "material": "solid wood",
            "width_mm": 1800, "depth_mm": 900,
        },
        "glb_model_url": "/models/dining_table.glb",
        "sort_order": 11,
    },
    {
        "item_type":    "buffet_sideboard",
        "display_name": "Buffet / Sideboard",
        "default_config": {
            "width_mm": 1500, "height_mm": 900, "depth_mm": 450,
            "num_doors": 4, "num_drawers": 2,
        },
        "glb_model_url": "/models/buffet_sideboard.glb",
        "sort_order": 12,
    },
    # Kitchen extras
    {
        "item_type":    "pantry_unit",
        "display_name": "Pantry / Tall Unit",
        "default_config": {
            "width_mm": 600, "height_mm": 2100, "depth_mm": 580,
            "num_baskets": 4, "has_door": True,
        },
        "glb_model_url": "/models/pantry_unit.glb",
        "sort_order": 13,
    },
    # Bathroom
    {
        "item_type":    "vanity_unit",
        "display_name": "Vanity Cabinet",
        "default_config": {
            "width_mm": 900, "height_mm": 600, "depth_mm": 500,
            "num_drawers": 2,
        },
        "glb_model_url": "/models/vanity_unit.glb",
        "sort_order": 14,
    },
    {
        "item_type":    "mirror_cabinet",
        "display_name": "Mirror Cabinet with Storage",
        "default_config": {
            "width_mm": 750, "height_mm": 800, "depth_mm": 150,
            "num_shelves": 3,
        },
        "glb_model_url": "/models/mirror_cabinet.glb",
        "sort_order": 15,
    },
    {
        "item_type":    "bathroom_linen_tower",
        "display_name": "Linen Tower",
        "default_config": {
            "width_mm": 400, "height_mm": 1800, "depth_mm": 350,
            "num_shelves": 4,
        },
        "glb_model_url": "/models/linen_tower.glb",
        "sort_order": 16,
    },
    # Balcony
    {
        "item_type":    "balcony_seating",
        "display_name": "Balcony Seating / Bench",
        "default_config": {
            "width_mm": 1200, "depth_mm": 600, "height_mm": 450,
            "has_storage": True, "material": "wpc",
        },
        "glb_model_url": "/models/balcony_bench.glb",
        "sort_order": 17,
    },
    {
        "item_type":    "planter_box",
        "display_name": "Planter Boxes",
        "default_config": {
            "num_planters": 3, "material": "teak",
        },
        "glb_model_url": "/models/planter_box.glb",
        "sort_order": 18,
    },
    # Pooja room
    {
        "item_type":    "pooja_unit",
        "display_name": "Pooja Unit / Mandir",
        "default_config": {
            "width_mm": 900, "height_mm": 1800, "depth_mm": 400,
            "has_arch": True, "has_led": True, "has_storage": True,
        },
        "glb_model_url": "/models/pooja_unit.glb",
        "sort_order": 19,
    },
    {
        "item_type":    "pooja_storage",
        "display_name": "Pooja Storage Shelves",
        "default_config": {
            "width_mm": 900, "height_mm": 1200, "depth_mm": 300,
            "has_glass_shutters": True,
        },
        "glb_model_url": "/models/pooja_storage.glb",
        "sort_order": 20,
    },
    # Foyer / entrance
    {
        "item_type":    "shoe_cabinet",
        "display_name": "Shoe Rack / Cabinet",
        "default_config": {
            "width_mm": 1200, "height_mm": 900, "depth_mm": 380,
            "num_tilt_trays": 4, "has_top_storage": True,
        },
        "glb_model_url": "/models/shoe_cabinet.glb",
        "sort_order": 21,
    },
    {
        "item_type":    "console_unit",
        "display_name": "Console Table & Key Holder",
        "default_config": {
            "width_mm": 1000, "height_mm": 900, "depth_mm": 300,
            "has_drawer": True, "has_key_hooks": True,
        },
        "glb_model_url": "/models/console_unit.glb",
        "sort_order": 22,
    },
]

UPSERT_SQL = text("""
    INSERT INTO furniture_catalogue
        (id, item_type, display_name, default_config, glb_model_url, is_active, sort_order, created_at)
    VALUES
        (gen_random_uuid(), :item_type, :display_name, CAST(:default_config AS jsonb), :glb_model_url, TRUE, :sort_order, NOW())
    ON CONFLICT (item_type)
    DO UPDATE SET
        display_name   = EXCLUDED.display_name,
        default_config = EXCLUDED.default_config,
        glb_model_url  = EXCLUDED.glb_model_url,
        sort_order     = EXCLUDED.sort_order,
        is_active      = TRUE
""")


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        for item in CATALOGUE:
            await session.execute(UPSERT_SQL, {
                **item,
                "default_config": json.dumps(item["default_config"]),
            })
        await session.commit()

    logger.info("✓ Seeded %d furniture catalogue rows", len(CATALOGUE))

    # Verify
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT item_type, display_name FROM furniture_catalogue ORDER BY sort_order")
        )
        rows = result.fetchall()
        for r in rows:
            logger.info("  - %s: %s", r[0], r[1])


if __name__ == "__main__":
    asyncio.run(seed())
