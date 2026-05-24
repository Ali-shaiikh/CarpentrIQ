"""Furniture image scraper — searches across global furniture sites via DuckDuckGo Images.

Searches cover sites like Christopher Guy, Restoration Hardware, Baker, Ethan Allen,
Urban Ladder, Pepperfry, IKEA, and anything else indexed by DuckDuckGo.

Results are cached in Redis for 24 hours so the same item type is not re-searched
on every generation request.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

# Cache TTL: 24 hours
_CACHE_TTL = 86400

# How many image URLs to cache per item type
_POOL_SIZE = 20

# Search query per item type — specific enough to get product photos, broad enough
# to pull from many different furniture brands worldwide.
_SEARCH_QUERIES: dict[str, str] = {
    "wardrobe":                "luxury wardrobe closet furniture product",
    "wardrobe_sliding_2door":  "sliding door wardrobe furniture product",
    "wardrobe_hinged_3door":   "hinged wardrobe 3 door furniture product",
    "bed":                     "luxury bed frame headboard furniture product",
    "storage_bed":             "storage bed hydraulic furniture product",
    "bed_queen_hydraulic":     "queen hydraulic storage bed furniture",
    "sofa":                    "luxury sofa 3 seater living room furniture product",
    "tv_unit":                 "TV unit media console wood furniture product",
    "tv_unit_floor":           "floor TV cabinet entertainment unit furniture",
    "kitchen":                 "modular kitchen cabinet design product photo",
    "kitchen_l_shape":         "L shape modular kitchen cabinetry product",
    "pantry_unit":             "pantry tall unit kitchen storage furniture product",
    "dining_table_set":        "luxury dining table chairs set furniture product",
    "buffet_sideboard":        "buffet sideboard dining room furniture product",
    "study":                   "study table desk home office furniture product",
    "study_table":             "study table desk home office furniture product",
    "dressing_table":          "dressing table vanity mirror bedroom furniture product",
    "chest_of_drawers":        "chest of drawers dresser bedroom furniture product",
    "bookshelf_unit":          "bookshelf display unit living room furniture product",
    "crockery_unit":           "crockery unit display cabinet dining furniture product",
    "shoe_cabinet":            "shoe cabinet rack hallway furniture product",
    "console_unit":            "console table entryway hall furniture product",
    "pooja_unit":              "pooja mandir unit wood furniture product",
    "vanity_unit":             "bathroom vanity cabinet furniture product",
    "mirror_cabinet":          "bathroom mirror cabinet wall furniture product",
    "bathroom_linen_tower":    "linen tower bathroom storage furniture product",
    "balcony_seating":         "outdoor balcony bench seating furniture product",
    "planter_box":             "outdoor planter box wooden furniture product",
    "wall_shelf":              "floating wall shelf bookshelf furniture product",
}

_DEFAULT_QUERY = "luxury furniture product photo"

# Keywords that indicate a piece should be REMOVED — skip scraping button-selected items
# that match these patterns in the notes.
_REMOVE_PATTERNS: list[tuple[str, list[str]]] = [
    ("wardrobe",          ["remove wardrobe", "no wardrobe", "without wardrobe", "replace wardrobe", "take out wardrobe"]),
    ("bed",               ["remove bed", "no bed", "without bed", "replace bed"]),
    ("sofa",              ["remove sofa", "no sofa", "without sofa", "replace sofa"]),
    ("tv_unit",           ["remove tv unit", "remove tv", "no tv unit", "without tv"]),
    ("kitchen",           ["remove kitchen", "no kitchen"]),
    ("dining_table_set",  ["remove dining", "no dining table"]),
    ("study",             ["remove study", "remove desk", "no desk", "no study"]),
    ("study_table",       ["remove study", "remove desk", "no desk"]),
    ("dressing_table",    ["remove dressing table", "no dressing table"]),
    ("bookshelf_unit",    ["remove bookshelf", "no bookshelf", "remove shelf"]),
]

# Furniture keywords found in notes → search query + display label.
# Checked in order; first match wins per phrase.
_NOTES_FURNITURE_KEYWORDS: list[tuple[str, str, str]] = [
    # keyword            label                  search query
    ("gaming setup",    "gaming setup",         "gaming desk PC setup RGB furniture product"),
    ("gaming desk",     "gaming desk",          "gaming desk setup furniture product"),
    ("gaming chair",    "gaming chair",         "gaming chair furniture product"),
    ("gaming room",     "gaming setup",         "gaming desk PC setup furniture product"),
    ("office desk",     "office desk",          "home office desk executive furniture product"),
    ("office chair",    "office chair",         "ergonomic office chair furniture product"),
    ("recliner",        "recliner",             "recliner sofa chair furniture product"),
    ("bean bag",        "bean bag",             "bean bag chair lounge furniture product"),
    ("bunk bed",        "bunk bed",             "bunk bed kids furniture product"),
    ("murphy bed",      "murphy bed",           "murphy wall bed furniture product"),
    ("murphy",          "murphy bed",           "murphy wall bed furniture product"),
    ("bar cabinet",     "bar cabinet",          "bar cabinet drinks cabinet furniture product"),
    ("bar unit",        "bar unit",             "bar unit cabinet furniture product"),
    ("window seat",     "window seat",          "window seat bench furniture product"),
    ("reading nook",    "reading nook",         "reading nook chair bookshelf furniture"),
    ("floor lamp",      "floor lamp",           "floor lamp lighting product"),
    ("accent chair",    "accent chair",         "accent chair living room furniture product"),
    ("lounge chair",    "lounge chair",         "lounge chair furniture product"),
    ("sectional sofa",  "sectional sofa",       "sectional sofa L shape furniture product"),
    ("daybed",          "daybed",               "daybed sofa furniture product"),
    ("ottoman",         "ottoman",              "ottoman pouf furniture product"),
    ("coffee table",    "coffee table",         "coffee table living room furniture product"),
    ("side table",      "side table",           "side table end table furniture product"),
    ("console table",   "console table",        "console table entryway furniture product"),
    ("shoe rack",       "shoe rack",            "shoe rack cabinet furniture product"),
    ("study table",     "study table",          "study table desk furniture product"),
    ("computer desk",   "computer desk",        "computer desk home office furniture product"),
    ("swing",           "swing",                "indoor swing chair furniture product"),
    ("hammock",         "hammock",              "indoor hammock chair product"),
    ("treadmill",       "treadmill",            "treadmill home gym equipment product"),
    ("gym equipment",   "gym equipment",        "home gym equipment product photo"),
    ("pool table",      "pool table",           "pool table billiards furniture product"),
    ("foosball",        "foosball table",       "foosball table game room furniture product"),
    ("drum kit",        "drum kit",             "drum kit musical instrument product"),
    ("piano",           "piano",                "upright piano musical instrument product"),
    ("guitar stand",    "guitar stand",         "guitar stand display furniture product"),
    ("pet bed",         "pet bed",              "dog cat pet bed furniture product"),
    ("crib",            "baby crib",            "baby crib nursery furniture product"),
    ("changing table",  "changing table",       "baby changing table nursery furniture product"),
    ("nursery",         "nursery furniture",    "nursery baby room furniture product set"),
    ("home theatre",    "home theatre seating", "home theatre recliner sofa seating product"),
    ("projector screen","projector screen",     "projector screen home theatre product"),
    ("meditation",      "meditation cushion",   "meditation cushion floor seating product"),
    ("prayer room",     "pooja unit",           "pooja mandir unit wood furniture product"),
    ("pooja",           "pooja unit",           "pooja mandir unit wood furniture product"),
]


def _extract_removes(notes: str) -> set[str]:
    """Return item_type strings that the notes explicitly want removed."""
    import re
    # Strip articles so "remove the wardrobe" == "remove wardrobe"
    lower = re.sub(r"\b(the|a|an|my|our|this|that|these|those)\b", " ", notes.lower())
    lower = re.sub(r"\s+", " ", lower)
    remove_types: set[str] = set()
    for item_type, phrases in _REMOVE_PATTERNS:
        if any(p in lower for p in phrases):
            remove_types.add(item_type)
    return remove_types


def extract_furniture_from_notes(notes: str) -> list[tuple[str, str]]:
    """Return (label, search_query) pairs for furniture mentioned in the notes.

    Used to scrape reference images for furniture the user described in text
    but didn't select via buttons.
    """
    if not notes:
        return []
    lower = notes.lower()
    seen_labels: set[str] = set()
    found: list[tuple[str, str]] = []
    for keyword, label, query in _NOTES_FURNITURE_KEYWORDS:
        if keyword in lower and label not in seen_labels:
            found.append((label, query))
            seen_labels.add(label)
    return found


def _run_ddg_search(query: str, max_results: int) -> list[str]:
    """Run DuckDuckGo image search synchronously (called via asyncio.to_thread)."""
    try:
        from ddgs import DDGS
        results = list(DDGS().images(query, max_results=max_results))
        urls = [r["image"] for r in results if r.get("image")]
        return urls
    except Exception as exc:
        logger.warning("DDG image search failed for '%s': %s", query, exc)
        return []


async def _search_by_query(query: str) -> list[str]:
    urls = await asyncio.to_thread(_run_ddg_search, query, _POOL_SIZE)
    logger.info("DDG search '%s' → %d image URLs", query, len(urls))
    return urls


async def get_furniture_image_url(
    item_type: str,
    redis: Any | None = None,
) -> str | None:
    """Return a random furniture product image URL for the given item type.

    Fetches from Redis cache if available, otherwise searches DuckDuckGo and caches the pool.
    Returns None on failure so callers can proceed without a reference image.
    """
    cache_key = f"furn_img_pool:{item_type}"

    # Try Redis cache first
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                pool: list[str] = json.loads(cached)
                if pool:
                    return random.choice(pool)
        except Exception as exc:
            logger.warning("Redis read failed for furniture image cache: %s", exc)

    # Cache miss — search DuckDuckGo
    query = _SEARCH_QUERIES.get(item_type, _DEFAULT_QUERY)
    urls = await _search_by_query(query)
    if not urls:
        return None

    # Cache the pool in Redis
    if redis is not None:
        try:
            await redis.setex(cache_key, _CACHE_TTL, json.dumps(urls))
        except Exception as exc:
            logger.warning("Redis write failed for furniture image cache: %s", exc)

    return random.choice(urls)


async def get_furniture_images_for_items(
    furniture_items: list[dict],
    notes: str = "",
    redis: Any | None = None,
) -> tuple[dict[int, str], list[tuple[str, str]], set[str]]:
    """Scrape furniture product images based on button selections and notes text.

    Button items that the notes say to remove are skipped.
    Furniture mentioned in the notes text is scraped as extra references.

    Returns:
        button_images  — {item_index: image_url} for button items not being removed
        notes_images   — [(label, image_url)] for furniture mentioned in the notes
        remove_types   — set of item_type strings the notes explicitly want removed
    """
    remove_types = _extract_removes(notes)
    notes_items = extract_furniture_from_notes(notes)  # [(label, query)]

    async def _fetch_by_type(index: int, item_type: str) -> tuple[int, str | None]:
        url = await get_furniture_image_url(item_type, redis=redis)
        return index, url

    async def _fetch_by_query(label: str, query: str) -> tuple[str, str | None]:
        cache_key = f"furn_img_pool:notes:{query[:40]}"
        if redis is not None:
            try:
                cached = await redis.get(cache_key)
                if cached:
                    pool = json.loads(cached)
                    if pool:
                        return label, random.choice(pool)
            except Exception:
                pass
        urls = await _search_by_query(query)
        if urls and redis is not None:
            try:
                await redis.setex(cache_key, _CACHE_TTL, json.dumps(urls))
            except Exception:
                pass
        return label, (random.choice(urls) if urls else None)

    # Button items — skip ones the notes say to remove
    button_tasks = [
        _fetch_by_type(i, item.get("item_type", ""))
        for i, item in enumerate(furniture_items)
        if item.get("item_type") and item.get("item_type") not in remove_types
    ]
    # Notes items — furniture mentioned in the description
    notes_tasks = [_fetch_by_query(label, query) for label, query in notes_items]

    button_images: dict[int, str] = {}
    for coro in asyncio.as_completed(button_tasks):
        try:
            idx, url = await coro
            if url:
                button_images[idx] = url
        except Exception as exc:
            logger.warning("Button furniture image fetch failed: %s", exc)

    notes_images: list[tuple[str, str]] = []
    for coro in asyncio.as_completed(notes_tasks):
        try:
            label, url = await coro
            if url:
                notes_images.append((label, url))
        except Exception as exc:
            logger.warning("Notes furniture image fetch failed: %s", exc)

    logger.info(
        "Scraper: %d button images (skipped %d removed), %d notes images",
        len(button_images), len(remove_types), len(notes_images),
    )
    return button_images, notes_images, remove_types
