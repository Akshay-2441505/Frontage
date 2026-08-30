from unittest.mock import MagicMock, patch

import app.agents.transact as transact_mod
from app.models import CatalogItem


def _fake_razorpay_client():
    client = MagicMock()
    client.order.create.side_effect = lambda payload: {"id": f"order_{payload['amount']}"}
    client.payment_link.create.side_effect = lambda payload: {
        "id": f"plink_{payload['amount']}",
        "short_url": "https://rzp.io/x",
    }
    return client


def test_second_purchase_blocked_once_cumulative_spend_exceeds_ceiling(db_session, merchant, mandate):
    # mandate.spend_ceiling == 1000.0 (from the shared fixture)
    item_a = CatalogItem(
        merchant_id=merchant.id, name="Item A", description="A perfectly fine description here.",
        price=600.0, currency="INR", availability="in_stock",
    )
    item_b = CatalogItem(
        merchant_id=merchant.id, name="Item B", description="A perfectly fine description here.",
        price=600.0, currency="INR", availability="in_stock",
    )
    db_session.add_all([item_a, item_b])
    db_session.flush()

    with patch.object(transact_mod, "get_client", return_value=_fake_razorpay_client()):
        first = transact_mod.attempt_purchase(db_session, item_a.id, 600.0)
        second = transact_mod.attempt_purchase(db_session, item_b.id, 600.0)

    assert first["status"] == "success"
    # individually 600 <= 1000 ceiling, but 600 + 600 = 1200 > 1000 cumulative
    assert second["status"] == "blocked"
    assert "spent" in second["reason"].lower() or "cumulative" in second["reason"].lower()


def test_purchase_within_cumulative_budget_still_succeeds(db_session, merchant, mandate):
    item_a = CatalogItem(
        merchant_id=merchant.id, name="Item A", description="A perfectly fine description here.",
        price=300.0, currency="INR", availability="in_stock",
    )
    item_b = CatalogItem(
        merchant_id=merchant.id, name="Item B", description="A perfectly fine description here.",
        price=300.0, currency="INR", availability="in_stock",
    )
    db_session.add_all([item_a, item_b])
    db_session.flush()

    with patch.object(transact_mod, "get_client", return_value=_fake_razorpay_client()):
        first = transact_mod.attempt_purchase(db_session, item_a.id, 300.0)
        second = transact_mod.attempt_purchase(db_session, item_b.id, 300.0)

    # 300 + 300 = 600, still under the 1000 ceiling
    assert first["status"] == "success"
    assert second["status"] == "success"
