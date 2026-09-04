import json
from unittest.mock import MagicMock, patch

import groq
import httpx

import app.agents.buyer as buyer_mod
from app.models import AgentAction, CatalogItem, CatalogManifest, DiagnosticReport, Merchant


def _fake_completion(payload: dict):
    completion = MagicMock()
    completion.choices = [MagicMock(message=MagicMock(content=json.dumps(payload)))]
    return completion


def _fake_groq_status_error(status_code: int):
    response = httpx.Response(
        status_code, request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    )
    return groq.APIStatusError("request rejected", response=response, body=None)


def _published_merchant(db_session, merchant, image_url=None, image_urls=None, variant_info=None):
    item = CatalogItem(
        merchant_id=merchant.id,
        name="Real Product",
        description="A perfectly adequate real description for this product.",
        price=100.0,
        currency="INR",
        availability="in_stock",
        agent_readable=True,
        image_url=image_url,
        image_urls=image_urls,
        variant_info=variant_info,
    )
    db_session.add(item)
    db_session.flush()
    manifest = CatalogManifest(
        merchant_id=merchant.id, version=1, url="/x", item_ids=[item.id]
    )
    db_session.add(manifest)
    db_session.flush()
    return item


def test_ambiguous_response_with_no_real_candidates_does_not_return_empty_ambiguous(db_session, merchant):
    _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    # LLM hallucinates candidate ids that don't exist in the manifest at all
    fake_client.chat.completions.create.return_value = _fake_completion(
        {
            "status": "ambiguous",
            "candidate_ids": ["hallucinated-id-1", "hallucinated-id-2"],
            "reasoning": "Multiple products seem to match.",
        }
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "something vague")

    # Must never come back as "ambiguous" with nothing to actually pick from --
    # that's a dead end in the UI (empty candidate table, no path forward).
    if result["status"] == "ambiguous":
        assert len(result["candidates"]) > 0


def test_ambiguous_response_with_real_candidates_still_returns_them(db_session, merchant):
    item = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {
            "status": "ambiguous",
            "candidate_ids": [item.id],
            "reasoning": "Multiple variants match.",
        }
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "vague but real goal")

    assert result["status"] == "ambiguous"
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["id"] == item.id


def test_ambiguous_candidates_include_variant_info(db_session, merchant):
    """The frontend's comparison table reads variant_info straight off each candidate
    with no backend change of its own -- this locks in that _manifest_products() keeps
    carrying it, so a future refactor there can't silently break that table."""
    item = _published_merchant(db_session, merchant, variant_info={"size": ["S", "M", "L"]})

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {
            "status": "ambiguous",
            "candidate_ids": [item.id],
            "reasoning": "Multiple variants match.",
        }
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "vague but real goal")

    assert result["candidates"][0]["variant_info"] == {"size": ["S", "M", "L"]}


def test_need_more_info_status_returns_clarifying_question(db_session, merchant):
    _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "need_more_info", "reasoning": "What's your budget?"}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "best product")

    assert result["status"] == "need_more_info"
    assert result["reasoning"] == "What's your budget?"


def test_history_is_folded_into_the_llm_prompt(db_session, merchant):
    item = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item.id, "reasoning": "Answers the follow-up."}
    )

    history = [
        {"goal": "best product", "status": "need_more_info", "reasoning": "What's your budget?"},
    ]

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.shop(db_session, merchant, "under 200 rupees", history=history)

    call_args = fake_client.chat.completions.create.call_args
    user_message = call_args.kwargs["messages"][1]["content"]
    assert "best product" in user_message
    assert "What's your budget?" in user_message


def test_history_is_capped_to_the_last_n_turns(db_session, merchant):
    item = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item.id, "reasoning": "Match."}
    )

    history = [
        {"goal": f"goal number {i}", "status": "need_more_info", "reasoning": f"question {i}"}
        for i in range(10)
    ]

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.shop(db_session, merchant, "final goal", history=history)

    call_args = fake_client.chat.completions.create.call_args
    user_message = call_args.kwargs["messages"][1]["content"]
    # Only the most recent turns should survive -- the earliest ones must not appear.
    assert "goal number 0" not in user_message
    assert "goal number 9" in user_message


def test_shop_with_history_still_resolves_match(db_session, merchant):
    item = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item.id, "reasoning": "Exact match."}
    )

    history = [{"goal": "best product", "status": "need_more_info", "reasoning": "What's your budget?"}]

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "under 200 rupees", history=history)

    assert result["status"] == "purchase_attempted"
    assert result["selected_product"]["id"] == item.id


def test_selected_product_includes_image_url(db_session, merchant):
    item = _published_merchant(db_session, merchant, image_url="https://cdn.example.com/shoe.jpg")

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item.id, "reasoning": "Exact match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "the real product")

    assert result["selected_product"]["image_url"] == "https://cdn.example.com/shoe.jpg"


def test_selected_product_includes_all_image_urls(db_session, merchant):
    item = _published_merchant(
        db_session, merchant,
        image_url="https://cdn.example.com/shoe-1.jpg",
        image_urls=["https://cdn.example.com/shoe-1.jpg", "https://cdn.example.com/shoe-2.jpg"],
    )

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item.id, "reasoning": "Exact match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.shop(db_session, merchant, "the real product")

    assert result["selected_product"]["image_urls"] == [
        "https://cdn.example.com/shoe-1.jpg",
        "https://cdn.example.com/shoe-2.jpg",
    ]


def test_discover_combines_products_across_merchants(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    merchant2 = Merchant(name="Second Store", catalog_source="test")
    db_session.add(merchant2)
    db_session.flush()
    item2 = _published_merchant(db_session, merchant2)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {
            "status": "ambiguous",
            "candidate_ids": [item1.id, item2.id],
            "reasoning": "Both stores sell a matching product.",
        }
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "something vague")

    assert result["status"] == "ambiguous"
    ids = {c["id"] for c in result["candidates"]}
    assert ids == {item1.id, item2.id}
    names = {c["merchant_name"] for c in result["candidates"]}
    assert names == {"Test Merchant", "Second Store"}


def test_discover_skips_merchants_without_a_published_manifest(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    merchant2 = Merchant(name="No Manifest Store", catalog_source="test")
    db_session.add(merchant2)
    db_session.flush()
    unpublished = CatalogItem(
        merchant_id=merchant2.id,
        name="Invisible Product",
        description="Should never surface via discover() -- no manifest published.",
        price=50.0,
        currency="INR",
        availability="in_stock",
        agent_readable=True,
    )
    db_session.add(unpublished)
    db_session.flush()

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Only real match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.discover(db_session, "anything")

    user_message = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "Invisible Product" not in user_message


def test_discover_returns_no_merchants_when_nothing_published(db_session, merchant):
    result = buyer_mod.discover(db_session, "anything")
    assert result["status"] == "no_merchants"


def test_discover_prompt_includes_merchant_name_and_score(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)
    db_session.add(DiagnosticReport(merchant_id=merchant.id, score=87.0, gaps=[]))
    db_session.flush()

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.discover(db_session, "anything")

    user_message = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert '"merchant_name":"Test Merchant"' in user_message
    assert '"merchant_score":87.0' in user_message


def test_discover_merchant_score_is_null_when_never_diagnosed(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "anything")

    assert result["selected_product"]["merchant_score"] is None


def test_discover_logs_match_under_the_selected_merchant(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "anything")

    action = db_session.get(AgentAction, result["buyer_agent_action_id"])
    assert action.merchant_id == merchant.id


def test_discover_falls_back_to_openrouter_when_groq_rejects_the_request_size(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _fake_groq_status_error(413)

    fallback_payload = json.dumps(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match via fallback."}
    )

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "call_openrouter", return_value=fallback_payload) as fake_openrouter,
    ):
        result = buyer_mod.discover(db_session, "anything")

    assert result["status"] == "purchase_attempted"
    assert result["selected_product"]["id"] == item1.id
    fake_openrouter.assert_called_once()

    action = db_session.get(AgentAction, result["buyer_agent_action_id"])
    assert action.output["used_fallback"] is True
    assert "OpenRouter fallback" in action.reasoning


def test_discover_falls_back_to_openrouter_on_a_standard_rate_limit_error(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _fake_groq_status_error(429)

    fallback_payload = json.dumps(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match via fallback."}
    )

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "call_openrouter", return_value=fallback_payload) as fake_openrouter,
    ):
        result = buyer_mod.discover(db_session, "anything")

    assert result["status"] == "purchase_attempted"
    fake_openrouter.assert_called_once()


def test_discover_stays_failed_when_both_groq_and_openrouter_fail(db_session, merchant):
    _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _fake_groq_status_error(413)

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "call_openrouter", side_effect=RuntimeError("openrouter also down")),
    ):
        result = buyer_mod.discover(db_session, "anything")

    assert result["status"] == "failed"
    action = db_session.get(AgentAction, result["agent_action_id"])
    assert "Groq had already rejected the request" in action.reasoning


def test_discover_does_not_fall_back_on_a_non_rate_limit_error(db_session, merchant):
    _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _fake_groq_status_error(500)

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "call_openrouter") as fake_openrouter,
    ):
        result = buyer_mod.discover(db_session, "anything")

    assert result["status"] == "failed"
    fake_openrouter.assert_not_called()


def test_shop_does_not_fall_back_to_openrouter_on_the_same_error_discover_would(db_session, merchant):
    _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _fake_groq_status_error(413)

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "call_openrouter") as fake_openrouter,
    ):
        result = buyer_mod.shop(db_session, merchant, "anything")

    assert result["status"] == "failed"
    fake_openrouter.assert_not_called()
