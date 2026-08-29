"""Shared LLM client for the Fix and Buyer agents.

Uses Groq (free tier, OpenAI-compatible API) rather than Claude — the buildathon
build has no funded Anthropic account. The spec itself names Groq as an accepted
fallback for exactly this kind of lower-stakes generation call, so this is a
budget-driven substitution, not scope creep. Same fail-loudly principle as the
Razorpay client: no silent no-op if unconfigured.
"""
from groq import Groq

from app.config import settings

# Small/fast model for bulk, lower-stakes Fix-phase content generation.
FIX_MODEL = "llama-3.1-8b-instant"
# Larger model for Transact/Buyer Agent decisions, which are the ones judged
# on "explainable, bounded, gated".
REASONING_MODEL = "llama-3.3-70b-versatile"


class LLMNotConfigured(RuntimeError):
    pass


def get_client() -> Groq:
    if not settings.groq_api_key:
        raise LLMNotConfigured(
            "GROQ_API_KEY is not set. Copy .env.example to .env at the repo root and fill in "
            "a real Groq API key (free at console.groq.com)."
        )
    return Groq(api_key=settings.groq_api_key)
