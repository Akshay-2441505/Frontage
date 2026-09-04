"""Shared LLM client for the Fix and Buyer agents.

Uses Groq (free tier, OpenAI-compatible API) rather than Claude — the buildathon
build has no funded Anthropic account. The spec itself names Groq as an accepted
fallback for exactly this kind of lower-stakes generation call, so this is a
budget-driven substitution, not scope creep. Same fail-loudly principle as the
Razorpay client: no silent no-op if unconfigured.

Otto's cross-merchant discover() call combines every published merchant's catalog
into one prompt, which can exceed Groq's account-level tokens-per-minute cap well
before it exceeds the model's own context window. call_openrouter() is that call's
fallback path — same-shape request, an equivalent free-tier model on OpenRouter.
"""
import httpx
from groq import Groq

from app.config import settings

# Small/fast model for bulk, lower-stakes Fix-phase content generation.
FIX_MODEL = "openai/gpt-oss-20b"
# Larger model for Transact/Buyer Agent decisions, which are the ones judged
# on "explainable, bounded, gated".
REASONING_MODEL = "openai/gpt-oss-120b"
# gpt-oss's hidden reasoning at effort "low" is light enough that this comfortably
# covers reasoning + the final JSON for a single-merchant prompt.
GROQ_MAX_TOKENS = 600
# Groq's own free `on_demand` tier has been observed stalling 15-45s on requests that
# are nowhere near its token-rate cap -- a service-side queueing/contention issue, not
# anything about the prompt. With no timeout, that stall is unbounded. 8s comfortably
# clears Groq's normal response time (sub-2s, observed) while capping the abnormal one.
GROQ_TIMEOUT_SECONDS = 8.0

# Fallback model for discover()'s combined-catalog prompt when Groq's request-size/
# rate-limit cap rejects it outright. Free tier, 256k+ context, verified live to
# return correctly-structured JSON.
OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Even at reasoning effort "low", nemotron spends 600-900+ completion tokens on
# hidden reasoning before it emits the actual JSON when the prompt is a full
# multi-merchant catalog (~25-30k prompt tokens) -- verified live. Groq's 600-token
# budget (tuned for gpt-oss's much lighter reasoning spend) truncates before any
# content comes out, so this fallback path gets its own, larger budget.
OPENROUTER_MAX_TOKENS = 3000
# OpenRouter is the last resort -- nothing else to fall back to -- so this stays looser
# than Groq's timeout (a genuine slow-but-successful generation shouldn't be killed
# prematurely), but still strictly bounded rather than the old unbounded 60s.
OPENROUTER_TIMEOUT_SECONDS = 30


class LLMNotConfigured(RuntimeError):
    pass


def get_client() -> Groq:
    if not settings.groq_api_key:
        raise LLMNotConfigured(
            "GROQ_API_KEY is not set. Copy .env.example to .env at the repo root and fill in "
            "a real Groq API key (free at console.groq.com)."
        )
    return Groq(api_key=settings.groq_api_key, timeout=GROQ_TIMEOUT_SECONDS)


def call_openrouter(messages: list[dict], response_format: dict) -> str:
    if not settings.openrouter_api_key:
        raise LLMNotConfigured(
            "OPENROUTER_API_KEY is not set. Copy .env.example to .env at the repo root and fill "
            "in a real OpenRouter API key (free at openrouter.ai)."
        )
    response = httpx.post(
        OPENROUTER_URL,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
        json={
            "model": OPENROUTER_MODEL,
            "max_tokens": OPENROUTER_MAX_TOKENS,
            "reasoning": {"effort": "low"},
            "response_format": response_format,
            "messages": messages,
        },
        timeout=OPENROUTER_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    if "choices" not in data:
        # OpenRouter can return a 200 with an error body (e.g. a transient upstream
        # routing failure on a free-tier model) instead of raising an HTTP error --
        # surface that instead of a bare KeyError on the missing key.
        raise RuntimeError(f"OpenRouter returned no completion: {data.get('error', data)}")
    choice = data["choices"][0]
    content = choice["message"]["content"]
    if not content:
        # A reasoning model that hits max_tokens mid-reasoning finishes with
        # finish_reason "length" and empty/null content -- the same failure shape
        # as the missing-'choices' case above, just one level deeper.
        raise RuntimeError(f"OpenRouter returned no content (finish_reason={choice.get('finish_reason')})")
    return content
