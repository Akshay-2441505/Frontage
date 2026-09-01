import json
from unittest.mock import MagicMock, patch

import app.agents.buyer as buyer_mod
from app.models import CatalogItem, CatalogManifest


def _fake_completion(payload: dict):
    completion = MagicMock()
    completion.choices = [MagicMock(message=MagicMock(content=json.dumps(payload)))]
    return completion


def _published_merchant(db_session, merchant, image_url=None, image_urls=None):
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
