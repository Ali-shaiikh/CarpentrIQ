"""Room analyser stub — YOLOv8 implementation removed.

The full YOLOv8 room dimension estimator was replaced by DALL-E 3 room image
generation. This stub keeps the API contract intact so the /cv/analyse endpoint
still works, returning a manual-check-required result when invoked.

To re-implement: restore the YOLOv8 pipeline or integrate a cloud vision API.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

STANDARD_CEILING_HEIGHT_MM = 2700
CONFIDENCE_WITH_REFERENCE  = 0.85
CONFIDENCE_EDGE_ONLY       = 0.55
CONFIDENCE_FALLBACK        = 0.25
MANUAL_CHECK_THRESHOLD     = 0.50


@dataclass
class RoomAnalysisResult:
    width_mm:            int | None = None
    length_mm:           int | None = None
    height_mm:           int | None = None
    confidence_score:    float      = 0.0
    needs_manual_check:  bool       = True
    detected_objects:    list       = field(default_factory=list)
    raw_yolo_output:     list       = field(default_factory=list)
    reference_used:      str | None = None
    message_for_carpenter: str      = "Please verify room dimensions on site before sending quote."


class RoomAnalyser:
    """Stub room analyser — returns manual-check-required result.

    The real YOLOv8 implementation has been removed. This stub preserves the
    API contract so the /cv/analyse endpoint continues to function.
    """

    async def analyse_enquiry_photos(
        self,
        image_paths: list[str],
        photo_ids: list[UUID],
        db_session: AsyncSession,
    ) -> RoomAnalysisResult:
        logger.info(
            "RoomAnalyser stub called with %d photos — returning manual-check result",
            len(image_paths),
        )
        return RoomAnalysisResult(
            width_mm=None,
            length_mm=None,
            height_mm=STANDARD_CEILING_HEIGHT_MM,
            confidence_score=CONFIDENCE_FALLBACK,
            needs_manual_check=True,
            detected_objects=[],
            reference_used=None,
            message_for_carpenter=(
                "Automatic dimension detection is temporarily unavailable. "
                "Please measure the room manually and enter dimensions below."
            ),
        )

    @staticmethod
    def compute_image_hash(image_path: str) -> str:
        with open(image_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
