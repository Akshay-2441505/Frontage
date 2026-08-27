"""Shared Claude client. Fails loudly and clearly if no API key is configured,
rather than silently returning empty/mocked output — agent actions must stay
explainable, and a silent no-op would hide that generation never happened.
"""
from anthropic import Anthropic

from app.config import settings

# Cheaper/faster model for bulk, lower-stakes Fix-phase content generation.
FIX_MODEL = "claude-haiku-4-5-20251001"
# Higher-reasoning model for Transact/Buyer Agent decisions, which are the
# ones judged on "explainable, bounded, gated".
REASONING_MODEL = "claude-sonnet-5"


class ClaudeNotConfigured(RuntimeError):
    pass


def get_client() -> Anthropic:
    if not settings.anthropic_api_key:
        raise ClaudeNotConfigured(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env at the repo root "
            "and fill in a real Anthropic API key."
        )
    return Anthropic(api_key=settings.anthropic_api_key)
