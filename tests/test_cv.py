"""Tests for app/ml/room_analyser.py — RoomAnalyser stub.

The full YOLOv8 implementation was removed; these tests verify the stub
API contract: correct return types, constants, and graceful handling.
"""

from __future__ import annotations

import hashlib
import tempfile
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from PIL import Image

from app.ml.room_analyser import (
    CONFIDENCE_EDGE_ONLY,
    CONFIDENCE_FALLBACK,
    CONFIDENCE_WITH_REFERENCE,
    MANUAL_CHECK_THRESHOLD,
    STANDARD_CEILING_HEIGHT_MM,
    RoomAnalyser,
    RoomAnalysisResult,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_synthetic_image(width: int = 800, height: int = 600, colour: tuple = (180, 160, 140)) -> str:
    img = Image.new("RGB", (width, height), colour)
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    img.save(tmp.name)
    tmp.close()
    return tmp.name


# ── Constants ─────────────────────────────────────────────────────────────────

class TestConstants:
    def test_ceiling_height_is_reasonable(self):
        assert 2400 <= STANDARD_CEILING_HEIGHT_MM <= 3600

    def test_confidence_with_reference_is_highest(self):
        assert CONFIDENCE_WITH_REFERENCE > CONFIDENCE_EDGE_ONLY > CONFIDENCE_FALLBACK

    def test_manual_check_threshold_is_fraction(self):
        assert 0 < MANUAL_CHECK_THRESHOLD < 1

    def test_fallback_confidence_below_threshold(self):
        assert CONFIDENCE_FALLBACK < MANUAL_CHECK_THRESHOLD


# ── RoomAnalysisResult dataclass ─────────────────────────────────────────────

class TestRoomAnalysisResult:
    def test_default_values(self):
        r = RoomAnalysisResult()
        assert r.width_mm is None
        assert r.length_mm is None
        assert r.needs_manual_check is True
        assert isinstance(r.detected_objects, list)

    def test_custom_values(self):
        r = RoomAnalysisResult(width_mm=3000, length_mm=4000, confidence_score=0.8, needs_manual_check=False)
        assert r.width_mm == 3000
        assert r.length_mm == 4000
        assert r.confidence_score == 0.8
        assert r.needs_manual_check is False


# ── RoomAnalyser stub ─────────────────────────────────────────────────────────

class TestCacheHit:
    """Stub always returns needs_manual_check=True — no YOLO invoked."""

    @pytest.mark.asyncio
    async def test_cache_hit_skips_yolo(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image()
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert isinstance(result, RoomAnalysisResult)
        assert result.needs_manual_check is True


class TestCacheMiss:
    """Stub returns a result with height set to standard ceiling height."""

    @pytest.mark.asyncio
    async def test_cache_miss_saves_result(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image()
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert result.height_mm == STANDARD_CEILING_HEIGHT_MM
        assert result.confidence_score == CONFIDENCE_FALLBACK


class TestNoReferenceObject:
    """No reference furniture found — stub still returns graceful result."""

    @pytest.mark.asyncio
    async def test_no_reference_object_returns_gracefully(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image(colour=(200, 200, 200))
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert result is not None
        assert isinstance(result.message_for_carpenter, str)
        assert len(result.message_for_carpenter) > 10


class TestOutlierDiscarding:
    """Stub handles multiple photos without crashing."""

    @pytest.mark.asyncio
    async def test_consolidation_discards_outlier(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        paths = [make_synthetic_image() for _ in range(3)]
        ids   = [uuid.uuid4() for _ in range(3)]
        result = await analyser.analyse_enquiry_photos(paths, ids, db)
        assert isinstance(result, RoomAnalysisResult)


class TestAllImagesUnreadable:
    """Stub returns a result even when called with no paths."""

    @pytest.mark.asyncio
    async def test_all_images_unreadable_returns_gracefully(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        result = await analyser.analyse_enquiry_photos([], [], db)
        assert result is not None
        assert result.needs_manual_check is True


class TestDimensionEstimation:
    """Stub always sets width/length to None and height to standard ceiling."""

    @pytest.mark.asyncio
    async def test_bed_reference_gives_high_confidence(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image()
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert result.width_mm is None
        assert result.height_mm == STANDARD_CEILING_HEIGHT_MM

    @pytest.mark.asyncio
    async def test_sofa_reference_gives_high_confidence(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image()
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert isinstance(result, RoomAnalysisResult)

    @pytest.mark.asyncio
    async def test_no_furniture_falls_back_to_none(self):
        analyser = RoomAnalyser()
        db = AsyncMock()
        path = make_synthetic_image()
        result = await analyser.analyse_enquiry_photos([path], [uuid.uuid4()], db)
        assert result.width_mm is None
        assert result.length_mm is None


class TestImageHash:
    def test_same_file_same_hash(self):
        path = make_synthetic_image()
        h1 = RoomAnalyser.compute_image_hash(path)
        h2 = RoomAnalyser.compute_image_hash(path)
        assert h1 == h2

    def test_different_content_different_hash(self):
        p1 = make_synthetic_image(colour=(100, 100, 100))
        p2 = make_synthetic_image(colour=(200, 200, 200))
        assert RoomAnalyser.compute_image_hash(p1) != RoomAnalyser.compute_image_hash(p2)

    def test_hash_is_64_char_hex(self):
        path = make_synthetic_image()
        h = RoomAnalyser.compute_image_hash(path)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)
