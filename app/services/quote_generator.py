"""Quote generator — orchestrates CV results + material estimator into a Quote."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class QuoteGenerator:
    async def generate(
        self,
        enquiry_id: str,
        cv_result: dict,
        furniture_items: list[dict],
        carpenter_id: str,
        city: str,
    ) -> dict[str, Any]:
        """Build a full Quote from CV dimensions and furniture selections.

        Steps:
        1. For each furniture_item, call MaterialEstimator to get costs
        2. Aggregate line_items, subtotal, tax, total
        3. Set advance_requested = 30% of total
        4. Persist FurnitureItem rows + Quote row
        5. Return quote dict
        """
        # TODO: implement generation pipeline
        raise NotImplementedError

    def _build_quote_number(self, carpenter_id: str) -> str:
        """Generate sequential quote number: CIQ-{YYYYMM}-{seq}."""
        # TODO: atomic counter from DB or Redis
        raise NotImplementedError
