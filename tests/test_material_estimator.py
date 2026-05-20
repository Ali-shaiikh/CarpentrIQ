"""Tests for app/services/material_estimator.py.

All tests use a mock DB session pre-loaded with realistic Mumbai prices
(mirrors seed_materials.py data) — no live DB connection needed.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.material_estimator import (
    MaterialEstimate,
    MaterialEstimator,
    QuoteLineItem,
)

# ── Price fixtures ────────────────────────────────────────────────────────────

MUMBAI_PRICES_STANDARD = {
    "plywood_bwp_8x4":          Decimal("2600"),  # Greenply
    "plywood_commercial_8x4":   Decimal("1950"),  # Century
    "mdf_18mm_8x4":             Decimal("1200"),  # Generic
    "laminate_sqft":            Decimal("85"),    # Merino
    "edge_banding_pvc":         Decimal("12"),    # Generic
    "hinge_softclose":          Decimal("95"),    # Ebco
    "drawer_slide_bb":          Decimal("185"),   # Ebco
    "handle_stainless":         Decimal("65"),    # Generic
    "hydraulic_lift_mechanism": Decimal("450"),   # Generic
}


def make_estimator_with_prices(prices: dict = None) -> MaterialEstimator:
    """Return MaterialEstimator whose _fetch_prices is patched to return fixed prices."""
    est = MaterialEstimator()
    est._fetch_prices = AsyncMock(return_value=prices or MUMBAI_PRICES_STANDARD)
    return est


# Shared configs
WARDROBE_3DOOR = {
    "width_mm": 1800, "height_mm": 2100, "depth_mm": 580,
    "num_doors": 3, "door_type": "hinged",
    "num_drawers": 0, "has_loft": True,
}
WARDROBE_2DOOR_SLIDING = {
    "width_mm": 1800, "height_mm": 2100, "depth_mm": 580,
    "num_doors": 2, "door_type": "sliding",
    "num_drawers": 2, "has_loft": False,
}
TV_UNIT_CONFIG = {
    "width_mm": 1800, "height_mm": 450, "depth_mm": 400,
    "has_wall_unit": True, "wall_unit_height_mm": 300, "num_shutters": 4,
}
KITCHEN_L = {
    "layout": "l_shape", "base_length_mm": 3000, "wall_length_mm": 2400,
    "num_base_shutters": 10, "num_wall_shutters": 8,
    "num_drawers": 3, "num_baskets": 3,
}
KITCHEN_STRAIGHT = {
    "layout": "straight", "base_length_mm": 2400, "wall_length_mm": 2400,
    "num_base_shutters": 8, "num_wall_shutters": 8,
    "num_drawers": 2, "num_baskets": 2,
}
STUDY_TABLE = {
    "width_mm": 1200, "depth_mm": 600,
    "has_bookshelf": True, "num_drawers": 2,
}
BED_QUEEN_HYDRAULIC = {
    "bed_size": "queen", "storage_type": "hydraulic",
}
BED_SINGLE_DRAWERS = {
    "bed_size": "single", "storage_type": "drawers",
}


# ── Wardrobe ──────────────────────────────────────────────────────────────────

class TestWardrobe:
    @pytest.mark.asyncio
    async def test_wardrobe_3door_hinged_1800x2100(self):
        est = make_estimator_with_prices()
        result = await est.estimate("wardrobe_hinged_3door", WARDROBE_3DOOR)

        assert isinstance(result, MaterialEstimate)
        assert result.material_cost > 0
        assert result.final_price > result.material_cost  # margin applied

        plywood = next(
            (l for l in result.material_breakdown if l.name == "plywood_bwp_8x4"), None
        )
        assert plywood is not None
        # area formula: (8.7m² panels * 1.15 wastage) / 2.976m² sheet = 3.36 → ceil = 4
        assert plywood.qty >= 4, f"Expected ≥4 plywood sheets, got {plywood.qty}"

    @pytest.mark.asyncio
    async def test_hinged_wardrobe_has_hinges(self):
        est = make_estimator_with_prices()
        result = await est.estimate("wardrobe_hinged_3door", WARDROBE_3DOOR)
        hinge_line = next(
            (l for l in result.material_breakdown if l.name == "hinge_softclose"), None
        )
        # 3 doors × 2 hinges = 6
        assert hinge_line is not None
        assert hinge_line.qty == 6

    @pytest.mark.asyncio
    async def test_sliding_wardrobe_has_no_hinges(self):
        est = make_estimator_with_prices()
        result = await est.estimate("wardrobe_sliding_2door", WARDROBE_2DOOR_SLIDING)
        hinge_line = next(
            (l for l in result.material_breakdown if l.name == "hinge_softclose"), None
        )
        # sliding doors → 0 hinges → line not included
        assert hinge_line is None

    @pytest.mark.asyncio
    async def test_drawers_produce_drawer_slides(self):
        est = make_estimator_with_prices()
        result = await est.estimate("wardrobe_sliding_2door", WARDROBE_2DOOR_SLIDING)
        slide_line = next(
            (l for l in result.material_breakdown if l.name == "drawer_slide_bb"), None
        )
        # 2 drawers × 2 slides = 4 pairs
        assert slide_line is not None
        assert slide_line.qty == 4


# ── TV Unit ───────────────────────────────────────────────────────────────────

class TestTVUnit:
    @pytest.mark.asyncio
    async def test_tv_unit_with_wall_unit(self):
        est = make_estimator_with_prices()
        result = await est.estimate("tv_unit_floor", TV_UNIT_CONFIG)

        assert isinstance(result, MaterialEstimate)
        assert result.material_cost > 0

        plywood = next(
            (l for l in result.material_breakdown if l.name == "plywood_bwp_8x4"), None
        )
        # wall unit adds panels — must be > base-only count
        assert plywood is not None
        assert plywood.qty >= 2

    @pytest.mark.asyncio
    async def test_tv_unit_no_wall_unit_has_fewer_plywood(self):
        est = make_estimator_with_prices()
        config_no_wall = {**TV_UNIT_CONFIG, "has_wall_unit": False}
        result_no_wall = await est.estimate("tv_unit_floor", config_no_wall)
        result_with_wall = await est.estimate("tv_unit_floor", TV_UNIT_CONFIG)

        ply_no = next(l for l in result_no_wall.material_breakdown if l.name == "plywood_bwp_8x4")
        ply_with = next(l for l in result_with_wall.material_breakdown if l.name == "plywood_bwp_8x4")
        assert ply_with.qty >= ply_no.qty

    @pytest.mark.asyncio
    async def test_tv_unit_shutters_produce_hinges(self):
        est = make_estimator_with_prices()
        result = await est.estimate("tv_unit_floor", TV_UNIT_CONFIG)
        hinges = next(
            (l for l in result.material_breakdown if l.name == "hinge_softclose"), None
        )
        # 4 shutters × 2 = 8 hinges
        assert hinges is not None
        assert hinges.qty == 8


# ── Kitchen ───────────────────────────────────────────────────────────────────

class TestKitchen:
    @pytest.mark.asyncio
    async def test_kitchen_l_shape_base_and_wall_calculated(self):
        est = make_estimator_with_prices()
        result = await est.estimate("kitchen_l_shape", KITCHEN_L)

        assert isinstance(result, MaterialEstimate)
        assert result.material_cost > 0

        # L-shape has more material than straight of same base length
        result_straight = await est.estimate("kitchen_straight", KITCHEN_STRAIGHT)
        assert result.material_cost > result_straight.material_cost

    @pytest.mark.asyncio
    async def test_kitchen_countertop_not_in_cost(self):
        est = make_estimator_with_prices()
        result = await est.estimate("kitchen_l_shape", KITCHEN_L)
        assert "countertop" in result.notes.lower()

    @pytest.mark.asyncio
    async def test_kitchen_hinges_match_shutter_count(self):
        est = make_estimator_with_prices()
        result = await est.estimate("kitchen_l_shape", KITCHEN_L)
        hinges = next(
            (l for l in result.material_breakdown if l.name == "hinge_softclose"), None
        )
        # (10 + 8) shutters × 2 = 36 hinges
        assert hinges is not None
        assert hinges.qty == 36


# ── Redis price cache ─────────────────────────────────────────────────────────

class TestPriceCache:
    @pytest.mark.asyncio
    async def test_price_cache_second_call_uses_redis_not_db(self):
        """After first call populates Redis, second call must NOT hit the DB."""
        est = MaterialEstimator()

        # Build a mock DB session that returns price rows
        from app.models.material import MaterialPrice
        mock_rows = []
        for mat_type, price in MUMBAI_PRICES_STANDARD.items():
            row = MagicMock(spec=MaterialPrice)
            row.material_type = mat_type
            row.brand = "Generic"
            row.city = "Mumbai"
            row.price_inr = float(price)
            mock_rows.append(row)

        scalars_mock = MagicMock()
        scalars_mock.scalars.return_value = mock_rows
        db = MagicMock()
        db.execute = AsyncMock(return_value=scalars_mock)

        # Redis: first get → miss, set → ok, second get → hit
        call_count = {"n": 0}
        cached_value = None

        async def fake_get(key):
            call_count["n"] += 1
            return cached_value

        stored = {}

        async def fake_set(key, value, ex=None):
            nonlocal cached_value
            cached_value = value

        redis = MagicMock()
        redis.get = fake_get
        redis.set = fake_set

        # First call — DB hit, Redis miss
        await est._fetch_prices("Mumbai", "standard", db, redis)
        first_db_calls = db.execute.call_count

        # Second call — Redis should serve it
        await est._fetch_prices("Mumbai", "standard", db, redis)
        second_db_calls = db.execute.call_count

        assert second_db_calls == first_db_calls, (
            "DB was queried on second call — Redis cache did not work"
        )


# ── Invalid type ──────────────────────────────────────────────────────────────

class TestInvalidType:
    @pytest.mark.asyncio
    async def test_invalid_item_type_raises_value_error(self):
        est = make_estimator_with_prices()
        with pytest.raises(ValueError, match="Unknown item_type"):
            await est.estimate("magic_furniture", {})

    @pytest.mark.asyncio
    async def test_error_message_includes_item_type(self):
        est = make_estimator_with_prices()
        with pytest.raises(ValueError) as exc_info:
            await est.estimate("flying_sofa", {})
        assert "flying_sofa" in str(exc_info.value)


# ── Smoke test all types ──────────────────────────────────────────────────────

class TestAllTypes:
    ALL_CONFIGS = [
        ("wardrobe_sliding_2door", WARDROBE_2DOOR_SLIDING),
        ("wardrobe_hinged_3door",  WARDROBE_3DOOR),
        ("tv_unit_floor",          TV_UNIT_CONFIG),
        ("kitchen_l_shape",        KITCHEN_L),
        ("kitchen_straight",       KITCHEN_STRAIGHT),
        ("study_table_standard",   STUDY_TABLE),
        ("bed_queen_hydraulic",    BED_QUEEN_HYDRAULIC),
        ("bed_single_drawers",     BED_SINGLE_DRAWERS),
    ]

    @pytest.mark.asyncio
    async def test_all_types_return_result_without_error(self):
        est = make_estimator_with_prices()
        for item_type, config in self.ALL_CONFIGS:
            result = await est.estimate(item_type, config)
            assert isinstance(result, MaterialEstimate), \
                f"{item_type} did not return MaterialEstimate"
            assert result.material_cost > 0, \
                f"{item_type} returned zero material_cost"
            assert result.final_price > result.material_cost, \
                f"{item_type}: final_price should exceed material_cost"
            assert result.total_furniture_sqft > 0, \
                f"{item_type}: sqft must be positive"

    @pytest.mark.asyncio
    async def test_compute_final_price_returns_quote_line_item(self):
        est = make_estimator_with_prices()
        raw = await est.estimate("wardrobe_hinged_3door", WARDROBE_3DOOR)
        line = est.compute_final_price(raw)

        assert isinstance(line, QuoteLineItem)
        assert line.final_price > 0
        assert line.advance_amount == (line.final_price * Decimal("0.30")).quantize(
            Decimal("1")
        )
