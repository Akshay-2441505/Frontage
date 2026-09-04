from unittest.mock import MagicMock, patch

import pytest

from app.agents import llm_client


def test_call_openrouter_raises_not_configured_without_a_key(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "")

    with pytest.raises(llm_client.LLMNotConfigured):
        llm_client.call_openrouter([], response_format={"type": "json_object"})


def test_call_openrouter_returns_the_message_content(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-or-test")

    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"message": {"content": '{"status": "match"}'}}]
    }

    with patch.object(llm_client.httpx, "post", return_value=fake_response) as fake_post:
        result = llm_client.call_openrouter(
            [{"role": "user", "content": "hi"}], response_format={"type": "json_object"}
        )

    assert result == '{"status": "match"}'
    fake_response.raise_for_status.assert_called_once()
    fake_post.assert_called_once()


def test_call_openrouter_raises_clearly_when_the_response_has_no_choices(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-or-test")

    fake_response = MagicMock()
    fake_response.json.return_value = {"error": {"message": "upstream provider unavailable"}}

    with patch.object(llm_client.httpx, "post", return_value=fake_response):
        with pytest.raises(RuntimeError, match="upstream provider unavailable"):
            llm_client.call_openrouter([], response_format={"type": "json_object"})


def test_call_openrouter_raises_clearly_when_content_is_empty(monkeypatch):
    """A reasoning model that spends its whole max_tokens budget on hidden reasoning
    finishes with finish_reason "length" and empty/null content -- the same failure
    shape as the missing-'choices' case, just one level deeper."""
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-or-test")

    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"finish_reason": "length", "message": {"content": None}}]
    }

    with patch.object(llm_client.httpx, "post", return_value=fake_response):
        with pytest.raises(RuntimeError, match="finish_reason=length"):
            llm_client.call_openrouter([], response_format={"type": "json_object"})


def test_call_openrouter_uses_a_bounded_timeout(monkeypatch):
    """Groq's own service has been observed stalling for 30-45s on small requests --
    OpenRouter is the last resort with nothing further to fall back to, so it still
    needs a real ceiling, just not as tight as Groq's (a genuine slow-but-successful
    generation shouldn't be killed prematurely when there's no next fallback to try)."""
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-or-test")

    fake_response = MagicMock()
    fake_response.json.return_value = {"choices": [{"message": {"content": "{}"}}]}

    with patch.object(llm_client.httpx, "post", return_value=fake_response) as fake_post:
        llm_client.call_openrouter([], response_format={"type": "json_object"})

    assert fake_post.call_args.kwargs["timeout"] == llm_client.OPENROUTER_TIMEOUT_SECONDS
    assert llm_client.OPENROUTER_TIMEOUT_SECONDS < 60  # strictly tighter than the old unbounded 60s


def test_get_client_sets_a_bounded_timeout(monkeypatch):
    """Groq's own service has been observed stalling for 30-45s on small, well-under-cap
    requests -- with no cap at all, that stall is unbounded. Every caller (shop(),
    discover()'s shortlist phase, discover()'s resolve phase) shares this one client
    constructor, so setting it here bounds all three at once."""
    monkeypatch.setattr(llm_client.settings, "groq_api_key", "gsk-test")

    with patch.object(llm_client, "Groq") as fake_groq_cls:
        llm_client.get_client()

    assert fake_groq_cls.call_args.kwargs["timeout"] == llm_client.GROQ_TIMEOUT_SECONDS


def test_get_client_disables_the_sdks_own_retries(monkeypatch):
    """The SDK's default max_retries=2 silently retries a stalling request up to 3 times
    before ever raising -- discovered live, it multiplies GROQ_TIMEOUT_SECONDS by 3
    (measured ~25s against an 8s timeout), defeating the point of bounding it at all.
    _resolve_goal()'s fallback to OpenRouter is the intended response to a Groq failure,
    not the SDK silently retrying the same struggling endpoint."""
    monkeypatch.setattr(llm_client.settings, "groq_api_key", "gsk-test")

    with patch.object(llm_client, "Groq") as fake_groq_cls:
        llm_client.get_client()

    assert fake_groq_cls.call_args.kwargs["max_retries"] == 0
