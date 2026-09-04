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
