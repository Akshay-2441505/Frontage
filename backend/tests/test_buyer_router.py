import json
from unittest.mock import MagicMock, patch

import app.agents.buyer as buyer_mod
from app.models import CatalogManifest


def test_history_round_trips_through_the_shop_endpoint(client, db_session, merchant, catalog_item):
    catalog_item.agent_readable = True
    manifest = CatalogManifest(merchant_id=merchant.id, version=1, url="/x", item_ids=[catalog_item.id])
    db_session.add(manifest)
    db_session.commit()

    fake_client = MagicMock()
    completion = MagicMock()
    completion.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps(
                    {"status": "match", "selected_item_id": catalog_item.id, "reasoning": "Match."}
                )
            )
        )
    ]
    fake_client.chat.completions.create.return_value = completion

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        resp = client.post(
            "/buyer-agent/shop",
            json={
                "merchant_id": merchant.id,
                "goal": "under 600 rupees",
                "history": [
                    {"goal": "best product", "status": "need_more_info", "reasoning": "What's your budget?"}
                ],
            },
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "purchase_attempted"

    user_message = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "What's your budget?" in user_message
