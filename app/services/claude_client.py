"""Claude API client — ALWAYS uses claude-haiku-4-5 (see CLAUDE.md cost rules).

Never switch to Sonnet or Opus without explicit founder approval.
"""

import logging

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5"  # cost rule — do not change without approval


class ClaudeClient:
    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def extract_room_notes(self, raw_notes: str) -> dict:
        """Parse freeform client room notes into structured data.

        Returns: {room_type, furniture_needed, special_requirements}
        """
        # TODO: craft prompt, call self._client.messages.create with MODEL,
        #       parse JSON from response
        raise NotImplementedError

    async def suggest_quote_notes(self, quote: dict) -> str:
        """Generate a short professional note for the quote PDF footer."""
        # TODO: craft prompt with quote context, return suggested text string
        raise NotImplementedError
