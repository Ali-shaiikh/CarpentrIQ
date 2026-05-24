"""Material estimator — computes material quantities and costs for furniture items.

Spec: CLAUDE.md § Material Estimator Spec.

Price lookup: material_prices table → city + grade → brand mapping.
Redis cache: prices cached 24 h per (city, grade) to stay within Upstash free tier.
All monetary values: Python Decimal (no float rounding errors on money).
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.utils import format_dimensions, format_dimension

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

SHEET_W_MM = 2440
SHEET_H_MM = 1220
SHEET_AREA_MM2 = SHEET_W_MM * SHEET_H_MM

MM2_PER_SQFT = 92_903  # 1 sqft = 92,903 mm²

DEFAULT_LABOUR_RATE = Decimal("225")   # ₹ per sqft — Mumbai 2026 standard
DEFAULT_MARGIN_PCT = Decimal("27")     # % — Mumbai carpenter avg 25–30%
DEFAULT_DEPTH_WARDROBE = 580
DEFAULT_DEPTH_TV_BASE = 400
DEFAULT_DEPTH_TV_WALL = 300
DEFAULT_DEPTH_KITCHEN_BASE = 560
DEFAULT_DEPTH_KITCHEN_WALL = 300
STANDARD_CEILING_MM = 2700

# Grade → preferred brand, fallback brand
GRADE_BRANDS: dict[str, dict[str, list[str]]] = {
    "budget": {
        "plywood_bwp_8x4":          ["Generic"],
        "plywood_commercial_8x4":   ["Generic"],
        "mdf_18mm_8x4":             ["Generic"],
        "laminate_sqft":            ["Generic"],
        "edge_banding_pvc":         ["Generic"],
        "hinge_softclose":          ["Generic"],
        "drawer_slide_bb":          ["Generic"],
        "handle_stainless":         ["Generic"],
        "hydraulic_lift_mechanism": ["Generic"],
    },
    "standard": {
        "plywood_bwp_8x4":          ["Greenply", "Generic"],
        "plywood_commercial_8x4":   ["Century", "Generic"],
        "mdf_18mm_8x4":             ["Generic"],
        "laminate_sqft":            ["Merino", "Generic"],
        "edge_banding_pvc":         ["Generic"],
        "hinge_softclose":          ["Ebco", "Generic"],
        "drawer_slide_bb":          ["Ebco", "Generic"],
        "handle_stainless":         ["Generic"],
        "hydraulic_lift_mechanism": ["Generic"],
    },
    "premium": {
        "plywood_bwp_8x4":          ["Century", "Greenply"],
        "plywood_commercial_8x4":   ["Century", "Generic"],
        "mdf_18mm_8x4":             ["Generic"],
        "laminate_sqft":            ["Merino", "Greenlam"],
        "edge_banding_pvc":         ["Generic"],
        "hinge_softclose":          ["Hettich", "Ebco"],
        "drawer_slide_bb":          ["Hettich", "Ebco"],
        "handle_stainless":         ["Branded", "Generic"],
        "hydraulic_lift_mechanism": ["Branded", "Generic"],
    },
}

REDIS_PRICE_TTL = 86_400  # 24 hours


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class MaterialLine:
    name: str
    qty: float
    unit: str
    unit_price: Decimal
    total: Decimal


@dataclass
class MaterialEstimate:
    item_type: str
    material_cost: Decimal
    labour_cost: Decimal
    margin: Decimal
    final_price: Decimal
    material_breakdown: list[MaterialLine] = field(default_factory=list)
    total_furniture_sqft: float = 0.0
    notes: str = ""
    dimensions_display: str = ""   # e.g. "W 1800 mm / 70.9 in / 5.9 ft  ×  H …"


@dataclass
class QuoteLineItem:
    item_type: str
    display_name: str
    material_cost: Decimal
    labour_cost: Decimal
    margin: Decimal
    final_price: Decimal
    advance_amount: Decimal        # 30% of final_price
    material_breakdown: list[MaterialLine] = field(default_factory=list)
    notes: str = ""


# ── Estimator ─────────────────────────────────────────────────────────────────

class MaterialEstimator:
    """Routes furniture item estimates; fetches prices from DB with Redis caching."""

    SUPPORTED_TYPES = {
        "wardrobe_sliding_2door",
        "wardrobe_hinged_3door",
        "tv_unit_floor",
        "kitchen_l_shape",
        "kitchen_straight",
        "study_table_standard",
        "bed_queen_hydraulic",
        "bed_double_hydraulic",
        "bed_single_drawers",
        "bed_king_hydraulic",
    }

    # ── Public ────────────────────────────────────────────────────────────────

    async def estimate(
        self,
        item_type: str,
        config: dict,
        city: str = "Mumbai",
        material_grade: str = "standard",
        db_session: Any = None,
        redis_client: Any = None,
    ) -> MaterialEstimate:
        """Route to specific estimator. Raises ValueError for unknown item_type."""
        prices = await self._fetch_prices(city, material_grade, db_session, redis_client)

        if item_type.startswith("wardrobe"):
            est = await self._estimate_wardrobe(config, prices)
        elif item_type.startswith("tv_unit"):
            est = await self._estimate_tv_unit(config, prices)
        elif item_type.startswith("kitchen"):
            est = await self._estimate_kitchen(config, prices)
        elif item_type.startswith("study_table"):
            est = await self._estimate_study_table(config, prices)
        elif item_type.startswith("bed"):
            est = await self._estimate_bed_storage(config, prices)
        else:
            raise ValueError(
                f"Unknown item_type '{item_type}'. "
                f"Supported: {sorted(self.SUPPORTED_TYPES)}"
            )

        est.item_type = item_type
        return est

    def compute_final_price(
        self,
        estimate: MaterialEstimate,
        labour_rate_per_sqft: float | Decimal | None = None,
        margin_pct: float | Decimal | None = None,
    ) -> QuoteLineItem:
        """Apply labour + margin on top of material_cost, return QuoteLineItem.

        labour_rate_per_sqft — pass a custom value to override DEFAULT_LABOUR_RATE
                                (useful when actual labour contract rate is known).
        margin_pct           — pass a custom value to override DEFAULT_MARGIN_PCT.
        """
        if labour_rate_per_sqft is None:
            labour_rate_per_sqft = DEFAULT_LABOUR_RATE
        if margin_pct is None:
            margin_pct = DEFAULT_MARGIN_PCT
        labour = _dec(estimate.total_furniture_sqft) * _dec(labour_rate_per_sqft)
        margin = ((estimate.material_cost + labour) * _dec(margin_pct) / 100).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
        final = estimate.material_cost + labour + margin

        display = estimate.item_type.replace("_", " ").title()

        return QuoteLineItem(
            item_type=estimate.item_type,
            display_name=display,
            material_cost=estimate.material_cost,
            labour_cost=_round(labour),
            margin=_round(margin),
            final_price=_round(final),
            advance_amount=_round(final * Decimal("0.30")),
            material_breakdown=estimate.material_breakdown,
            notes=estimate.notes,
        )

    # ── Price fetching ────────────────────────────────────────────────────────

    async def _fetch_prices(
        self,
        city: str,
        grade: str,
        db_session: Any,
        redis_client: Any = None,
    ) -> dict[str, Decimal]:
        """Return {material_type: price_inr} for city+grade, with 24-h Redis cache."""
        cache_key = f"prices:{city}:{grade}"

        # Try Redis cache first
        if redis_client is not None:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    raw = json.loads(cached)
                    logger.debug("Price cache hit: %s", cache_key)
                    return {k: Decimal(v) for k, v in raw.items()}
            except Exception as exc:
                logger.warning("Redis get failed, falling through to DB: %s", exc)

        # DB lookup — pick best available brand per material_type for this grade
        from sqlalchemy import select
        from app.models.material import MaterialPrice

        grade_map = GRADE_BRANDS.get(grade, GRADE_BRANDS["standard"])
        prices: dict[str, Decimal] = {}

        rows = await db_session.execute(
            select(MaterialPrice).where(MaterialPrice.city == city)
        )
        all_prices: list[MaterialPrice] = list(rows.scalars())

        # Index: material_type → {brand: price}
        indexed: dict[str, dict[str, Decimal]] = {}
        for row in all_prices:
            indexed.setdefault(row.material_type, {})[row.brand] = Decimal(
                str(row.price_inr)
            )

        for mat_type, preferred_brands in grade_map.items():
            brand_prices = indexed.get(mat_type, {})
            for brand in preferred_brands:
                if brand in brand_prices:
                    prices[mat_type] = brand_prices[brand]
                    break
            else:
                # Fallback: any price we have
                if brand_prices:
                    prices[mat_type] = next(iter(brand_prices.values()))
                else:
                    logger.warning("No price found for %s in %s", mat_type, city)

        # Populate Redis cache
        if redis_client is not None and prices:
            try:
                await redis_client.set(
                    cache_key,
                    json.dumps({k: str(v) for k, v in prices.items()}),
                    ex=REDIS_PRICE_TTL,
                )
            except Exception as exc:
                logger.warning("Redis set failed: %s", exc)

        return prices

    # ── Wardrobe ──────────────────────────────────────────────────────────────

    async def _estimate_wardrobe(self, config: dict, prices: dict) -> MaterialEstimate:
        """Wardrobe estimate — sliding or hinged, with optional loft and drawers."""
        w = config.get("width_mm", 2400)
        h = config.get("height_mm", 2100)
        d = config.get("depth_mm", DEFAULT_DEPTH_WARDROBE)
        num_doors = config.get("num_doors", config.get("doors", 2))
        door_type = config.get("door_type", "hinged")
        num_drawers = config.get("num_drawers", config.get("drawers", 0))
        has_loft = config.get("has_loft", False)
        num_shelves = 3

        # ── Panel areas (mm²) ──────────────────────────────────────────────
        sides_area = 2 * (h * d)
        top_bottom_area = 2 * (w * d)
        shelves_area = num_shelves * (w * d)
        loft_area = (w * d) if has_loft else 0

        total_plywood_area = sides_area + top_bottom_area + shelves_area + loft_area

        back_area = h * w  # MDF backing

        # Drawer bottoms (MDF): each drawer = width_mm x depth_mm / num_doors approx
        drawer_bottom_area = num_drawers * (w / max(num_doors, 1)) * (d * 0.5)
        total_mdf_area = back_area + drawer_bottom_area

        # ── Sheet counts ───────────────────────────────────────────────────
        plywood_sheets = math.ceil(
            (total_plywood_area / SHEET_AREA_MM2) * 1.15
        )
        mdf_sheets = math.ceil(
            (total_mdf_area / SHEET_AREA_MM2) * 1.10
        )

        # ── Hardware ───────────────────────────────────────────────────────
        hinges = 0 if door_type == "sliding" else num_doors * 2
        drawer_slides = num_drawers * 2
        handles = num_doors + num_drawers

        # ── Laminate (exterior visible surfaces) ───────────────────────────
        exterior_area_mm2 = (
            2 * (h * d)          # two sides
            + (w * h)            # front face (door area approx)
            + (w * d)            # top
        )
        laminate_sqft = (exterior_area_mm2 / MM2_PER_SQFT) * 1.15

        # ── Edge banding ───────────────────────────────────────────────────
        edge_banding_m = (
            2 * (h + d) / 1000   # two sides perimeter
            + 2 * (w + d) / 1000  # top + bottom
            + num_shelves * 2 * (w + d) / 1000
        )

        # ── Furniture sqft for labour ──────────────────────────────────────
        total_sqft = (w * h) / (1_000 * 1_000) * 10.764

        lines = _build_lines(prices, [
            ("plywood_bwp_8x4",        plywood_sheets,   "sheet"),
            ("mdf_18mm_8x4",           mdf_sheets,       "sheet"),
            ("hinge_softclose",        hinges,           "piece"),
            ("drawer_slide_bb",        drawer_slides,    "pair"),
            ("handle_stainless",       handles,          "piece"),
            ("laminate_sqft",          round(laminate_sqft, 2), "sqft"),
            ("edge_banding_pvc",       round(edge_banding_m, 2), "metre"),
        ])
        material_cost = sum(line.total for line in lines)

        notes = (
            f"{door_type.title()} door, "
            f"{'with' if has_loft else 'no'} loft, "
            f"{num_drawers} drawers"
        )
        dims = format_dimensions(w, h, d)

        return _make_estimate("wardrobe", material_cost, lines, total_sqft, notes, dims)

    # ── TV Unit ───────────────────────────────────────────────────────────────

    async def _estimate_tv_unit(self, config: dict, prices: dict) -> MaterialEstimate:
        """TV unit — floor base cabinet + optional wall unit."""
        w = config.get("width_mm", 1800)
        base_h = config.get("height_mm", 450)
        base_d = config.get("depth_mm", DEFAULT_DEPTH_TV_BASE)
        has_wall = config.get("has_wall_unit", False)
        wall_h = config.get("wall_unit_height_mm", 300)
        wall_d = DEFAULT_DEPTH_TV_WALL
        num_shutters = config.get("num_shutters", 4)

        # Base cabinet panels (plywood)
        base_plywood_area = (
            2 * (base_h * base_d)    # sides
            + 2 * (w * base_d)        # top + bottom
            + w * base_d              # 1 shelf
        )
        base_back_area = base_h * w   # MDF

        # Wall unit panels
        wall_plywood_area = 0
        wall_back_area = 0
        if has_wall:
            wall_plywood_area = (
                2 * (wall_h * wall_d)
                + 2 * (w * wall_d)
            )
            wall_back_area = wall_h * w

        total_plywood_area = base_plywood_area + wall_plywood_area
        total_mdf_area = base_back_area + wall_back_area

        plywood_sheets = math.ceil((total_plywood_area / SHEET_AREA_MM2) * 1.15)
        mdf_sheets = math.ceil((total_mdf_area / SHEET_AREA_MM2) * 1.10)

        hinges = num_shutters * 2
        handles = num_shutters

        exterior_area_mm2 = (
            2 * (base_h * base_d)
            + w * base_h
            + w * base_d
        )
        if has_wall:
            exterior_area_mm2 += 2 * (wall_h * wall_d) + w * wall_h
        laminate_sqft = (exterior_area_mm2 / MM2_PER_SQFT) * 1.15

        edge_banding_m = (
            2 * (base_h + base_d) / 1000
            + 2 * (w + base_d) / 1000
        )
        if has_wall:
            edge_banding_m += 2 * (wall_h + wall_d) / 1000 + 2 * (w + wall_d) / 1000

        total_sqft = (w * (base_h + (wall_h if has_wall else 0))) / (1_000 * 1_000) * 10.764

        lines = _build_lines(prices, [
            ("plywood_bwp_8x4",   plywood_sheets,           "sheet"),
            ("mdf_18mm_8x4",      mdf_sheets,               "sheet"),
            ("hinge_softclose",   hinges,                    "piece"),
            ("handle_stainless",  handles,                   "piece"),
            ("laminate_sqft",     round(laminate_sqft, 2),  "sqft"),
            ("edge_banding_pvc",  round(edge_banding_m, 2), "metre"),
        ])
        material_cost = sum(line.total for line in lines)
        notes = f"{'With' if has_wall else 'No'} wall unit, {num_shutters} shutters"
        dims = format_dimensions(w, base_h, base_d)

        return _make_estimate("tv_unit_floor", material_cost, lines, total_sqft, notes, dims)

    # ── Modular Kitchen ───────────────────────────────────────────────────────

    async def _estimate_kitchen(self, config: dict, prices: dict) -> MaterialEstimate:
        """Modular kitchen — straight or L-shape. Countertop NOT included."""
        layout = config.get("layout", "straight")
        base_len = config.get("base_length_mm", 3000)
        wall_len = config.get("wall_length_mm", base_len)
        num_base_shutters = config.get("num_base_shutters", math.ceil(base_len / 600) * 2)
        num_wall_shutters = config.get("num_wall_shutters", math.ceil(wall_len / 600) * 2)
        num_drawers = config.get("num_drawers", 3)
        base_h = 870
        base_d = DEFAULT_DEPTH_KITCHEN_BASE
        wall_h = 600
        wall_d = DEFAULT_DEPTH_KITCHEN_WALL

        num_base_modules = math.ceil(base_len / 600)
        num_wall_modules = math.ceil(wall_len / 600)

        # Plywood: carcasses — each module needs 2 sides + top + bottom + 1 shelf
        # Each panel counted individually, not just area, for realistic sheet usage
        panels_per_base = (
            2 * (base_h * base_d)      # 2 side panels
            + 2 * (600 * base_d)       # top + bottom
            + 1 * (600 * base_d)       # 1 fixed shelf
        )
        panels_per_wall = (
            2 * (wall_h * wall_d)      # 2 side panels
            + 2 * (600 * wall_d)       # top + bottom
        )
        base_plywood_area = num_base_modules * panels_per_base
        wall_plywood_area = num_wall_modules * panels_per_wall
        total_plywood_area = base_plywood_area + wall_plywood_area

        # MDF backs per module
        base_back_area = num_base_modules * (base_h * 600)
        wall_back_area = num_wall_modules * (wall_h * 600)

        # Shutters — 18mm MDF both sides laminated (avg 300mm wide per shutter)
        shutter_area_mm2 = (
            num_base_shutters * (base_h * 300)
            + num_wall_shutters * (wall_h * 300)
        )
        total_mdf_area = base_back_area + wall_back_area + shutter_area_mm2

        plywood_sheets = math.ceil((total_plywood_area / SHEET_AREA_MM2) * 1.15)
        mdf_sheets = math.ceil((total_mdf_area / SHEET_AREA_MM2) * 1.10)

        total_shutters = num_base_shutters + num_wall_shutters
        hinges = total_shutters * 2
        drawer_slides = num_drawers * 2
        handles = total_shutters + num_drawers

        exterior_area_mm2 = shutter_area_mm2
        laminate_sqft = (exterior_area_mm2 / MM2_PER_SQFT) * 1.15

        edge_banding_m = total_shutters * (
            2 * (base_h + 300) / 1000
        )

        total_sqft = (
            (base_len * base_h) + (wall_len * wall_h)
        ) / (1_000 * 1_000) * 10.764

        lines = _build_lines(prices, [
            ("plywood_bwp_8x4",   plywood_sheets,           "sheet"),
            ("mdf_18mm_8x4",      mdf_sheets,               "sheet"),
            ("hinge_softclose",   hinges,                    "piece"),
            ("drawer_slide_bb",   drawer_slides,             "pair"),
            ("handle_stainless",  handles,                   "piece"),
            ("laminate_sqft",     round(laminate_sqft, 2),  "sqft"),
            ("edge_banding_pvc",  round(edge_banding_m, 2), "metre"),
        ])
        material_cost = sum(line.total for line in lines)
        notes = (
            f"{layout.replace('_', '-').title()} kitchen. "
            f"Countertop not included (separate quote)."
        )
        dims = (
            f"Base {format_dimension(base_len)} (L)  ×  Wall {format_dimension(wall_len)} (L)"
            f"  ×  H {format_dimension(base_h)}"
        )

        return _make_estimate("kitchen", material_cost, lines, total_sqft, notes, dims)

    # ── Study Table ───────────────────────────────────────────────────────────

    async def _estimate_study_table(self, config: dict, prices: dict) -> MaterialEstimate:
        """Study table with optional bookshelf above."""
        w = config.get("width_mm", 1200)
        d = config.get("depth_mm", 600)
        has_bookshelf = config.get("has_bookshelf", True)
        num_drawers = config.get("num_drawers", 2)
        table_h = 750
        shelf_h = 400

        # Table: top + 2 sides + 1 back shelf
        plywood_area = (
            w * d                  # tabletop
            + 2 * (table_h * d)    # sides
            + w * d                # bottom shelf/modesty panel
        )
        if has_bookshelf:
            plywood_area += (
                2 * (shelf_h * d)  # shelf sides
                + w * d            # shelf top
                + w * d            # shelf bottom
            )

        back_area = table_h * w + (shelf_h * w if has_bookshelf else 0)

        plywood_sheets = math.ceil((plywood_area / SHEET_AREA_MM2) * 1.15)
        mdf_sheets = math.ceil((back_area / SHEET_AREA_MM2) * 1.10)
        drawer_slides = num_drawers * 2
        handles = num_drawers

        exterior_area_mm2 = w * d + 2 * (table_h * d)
        if has_bookshelf:
            exterior_area_mm2 += w * shelf_h
        laminate_sqft = (exterior_area_mm2 / MM2_PER_SQFT) * 1.15
        edge_banding_m = (2 * (w + d) + 2 * (table_h + d)) / 1000

        total_sqft = (w * (table_h + (shelf_h if has_bookshelf else 0))) / (1_000 * 1_000) * 10.764

        lines = _build_lines(prices, [
            ("plywood_bwp_8x4",   plywood_sheets,           "sheet"),
            ("mdf_18mm_8x4",      mdf_sheets,               "sheet"),
            ("drawer_slide_bb",   drawer_slides,             "pair"),
            ("handle_stainless",  handles,                   "piece"),
            ("laminate_sqft",     round(laminate_sqft, 2),  "sqft"),
            ("edge_banding_pvc",  round(edge_banding_m, 2), "metre"),
        ])
        material_cost = sum(line.total for line in lines)
        notes = f"{'With' if has_bookshelf else 'No'} bookshelf, {num_drawers} drawers"
        dims = format_dimensions(w, table_h + (shelf_h if has_bookshelf else 0), d)

        return _make_estimate("study_table", material_cost, lines, total_sqft, notes, dims)

    # ── Bed with Storage ─────────────────────────────────────────────────────

    async def _estimate_bed_storage(self, config: dict, prices: dict) -> MaterialEstimate:
        """Box-frame bed — hydraulic lift or drawer storage."""
        BED_DIMS = {
            "single": (900,  1900),
            "double": (1370, 1900),
            "queen":  (1520, 1900),
            "king":   (1820, 1900),
        }
        bed_size = config.get("bed_size", "queen")
        storage_type = config.get("storage_type", "hydraulic")
        w, length = BED_DIMS.get(bed_size, BED_DIMS["queen"])
        box_h = 400  # box frame height (below mattress)

        # Box frame: 2 sides + headboard + footboard
        plywood_area = (
            2 * (length * box_h)    # long sides
            + 2 * (w * box_h)       # head + foot
            + w * length            # base panel (plywood)
        )

        plywood_sheets = math.ceil((plywood_area / SHEET_AREA_MM2) * 1.15)
        mdf_sheets = 1  # headboard facing panel

        exterior_area_mm2 = 2 * (length * box_h) + 2 * (w * box_h)
        laminate_sqft = (exterior_area_mm2 / MM2_PER_SQFT) * 1.15
        edge_banding_m = (2 * (length + box_h) + 2 * (w + box_h)) / 1000

        hydraulic = 0
        drawer_slides = 0
        handles = 0
        num_drawers = 0

        if storage_type == "hydraulic":
            hydraulic = 2
        else:  # drawers
            num_drawers = 2
            drawer_slides = num_drawers * 2
            handles = num_drawers

        total_sqft = (w * length) / (1_000 * 1_000) * 10.764

        items = [
            ("plywood_bwp_8x4",   plywood_sheets,           "sheet"),
            ("mdf_18mm_8x4",      mdf_sheets,               "sheet"),
            ("laminate_sqft",     round(laminate_sqft, 2),  "sqft"),
            ("edge_banding_pvc",  round(edge_banding_m, 2), "metre"),
        ]
        if hydraulic:
            items.append(("hydraulic_lift_mechanism", hydraulic, "piece"))
        if drawer_slides:
            items.append(("drawer_slide_bb", drawer_slides, "pair"))
        if handles:
            items.append(("handle_stainless", handles, "piece"))

        lines = _build_lines(prices, items)
        material_cost = sum(line.total for line in lines)
        notes = f"{bed_size.title()} bed, {storage_type} storage"
        dims = format_dimensions(w, box_h, length)

        return _make_estimate("bed", material_cost, lines, total_sqft, notes, dims)


# ── Private helpers ───────────────────────────────────────────────────────────

def _dec(value: float | int | str) -> Decimal:
    return Decimal(str(value))


def _round(value: Decimal) -> Decimal:
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _build_lines(
    prices: dict[str, Decimal],
    items: list[tuple[str, float, str]],
) -> list[MaterialLine]:
    """Build MaterialLine list, skipping items with zero quantity or missing price."""
    lines: list[MaterialLine] = []
    for mat_type, qty, unit in items:
        if qty <= 0:
            continue
        unit_price = prices.get(mat_type, Decimal("0"))
        total = _round(_dec(qty) * unit_price)
        lines.append(MaterialLine(
            name=mat_type,
            qty=qty,
            unit=unit,
            unit_price=unit_price,
            total=total,
        ))
    return lines


def _make_estimate(
    item_type: str,
    material_cost: Decimal,
    lines: list[MaterialLine],
    total_sqft: float,
    notes: str,
    dimensions_display: str = "",
) -> MaterialEstimate:
    labour = _round(_dec(total_sqft) * DEFAULT_LABOUR_RATE)
    margin = _round((material_cost + labour) * DEFAULT_MARGIN_PCT / 100)
    final = material_cost + labour + margin
    return MaterialEstimate(
        item_type=item_type,
        material_cost=_round(material_cost),
        labour_cost=labour,
        margin=margin,
        final_price=_round(final),
        material_breakdown=lines,
        total_furniture_sqft=round(total_sqft, 2),
        notes=notes,
        dimensions_display=dimensions_display,
    )
