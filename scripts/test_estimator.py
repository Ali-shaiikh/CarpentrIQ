"""Quick manual test for MaterialEstimator — no DB or Redis needed.

Run: /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 scripts/test_estimator.py
"""

import asyncio
import sys
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.material_estimator import MaterialEstimator

PRICES = {
    "plywood_bwp_8x4":          Decimal("2950"),  # Greenply, Mumbai Apr 2026
    "mdf_18mm_8x4":             Decimal("1450"),
    "laminate_sqft":            Decimal("95"),     # Merino
    "edge_banding_pvc":         Decimal("15"),
    "hinge_softclose":          Decimal("110"),    # Ebco
    "drawer_slide_bb":          Decimal("210"),    # Ebco
    "handle_stainless":         Decimal("75"),
    "hydraulic_lift_mechanism": Decimal("520"),
}

ITEMS = [
    ("wardrobe_hinged_3door", {
        "width_mm": 1800, "height_mm": 2100, "depth_mm": 580,
        "num_doors": 3, "door_type": "hinged",
        "num_drawers": 2, "has_loft": True,
    }),
    ("wardrobe_sliding_2door", {
        "width_mm": 1800, "height_mm": 2100, "depth_mm": 580,
        "num_doors": 2, "door_type": "sliding",
        "num_drawers": 2, "has_loft": False,
    }),
    ("tv_unit_floor", {
        "width_mm": 1800, "height_mm": 450, "depth_mm": 400,
        "has_wall_unit": True, "wall_unit_height_mm": 300, "num_shutters": 4,
    }),
    ("kitchen_l_shape", {
        "layout": "l_shape", "base_length_mm": 3000, "wall_length_mm": 2400,
        "num_base_shutters": 10, "num_wall_shutters": 8,
        "num_drawers": 3, "num_baskets": 3,
    }),
    ("study_table_standard", {
        "width_mm": 1200, "depth_mm": 600,
        "has_bookshelf": True, "num_drawers": 2,
    }),
    ("bed_queen_hydraulic", {
        "bed_size": "queen", "storage_type": "hydraulic",
    }),
]


async def main():
    est = MaterialEstimator()
    est._fetch_prices = AsyncMock(return_value=PRICES)

    print("=" * 65)
    print("  CarpentrIQ — Material Estimator Test")
    print("  Prices: Mumbai Standard grade")
    print("=" * 65)

    for item_type, config in ITEMS:
        result = await est.estimate(item_type, config)
        line_item = est.compute_final_price(result)

        print(f"\n▸ {item_type}")
        print(f"  Notes       : {result.notes}")
        if result.dimensions_display:
            print(f"  Dimensions  : {result.dimensions_display}")
        print(f"  Sqft        : {result.total_furniture_sqft:.1f}")
        print(f"  Material    : ₹{result.material_cost:>8}")
        print(f"  Labour      : ₹{line_item.labour_cost:>8}")
        print(f"  Margin (20%): ₹{line_item.margin:>8}")
        print(f"  Final price : ₹{line_item.final_price:>8}")
        print(f"  Advance 30% : ₹{line_item.advance_amount:>8}")
        print("  Breakdown:")
        for l in result.material_breakdown:
            print(f"    {l.name:30s}  {l.qty:5}  {l.unit:6}  ₹{l.total}")

    print("\n" + "=" * 65)
    print("  All items estimated successfully.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
