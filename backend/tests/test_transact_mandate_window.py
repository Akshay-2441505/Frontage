import datetime
from unittest.mock import MagicMock, patch

import app.agents.transact as transact_mod
from app.models import AgentAction, AgentResult, CatalogItem, Mandate, MandateWindow, Transaction, TransactionStatus


def _fake_razorpay_client():
    client = MagicMock()
    client.order.create.side_effect = lambda payload: {"id": f"order_{payload['amount']}"}
    client.payment_link.create.side_effect = lambda payload: {
        "id": f"plink_{payload['amount']}",
        "short_url": "https://rzp.io/x",
    }
    return client


def _make_item(db_session, merchant, price):
    item = CatalogItem(
        merchant_id=merchant.id, name=f"Item {price}", description="A perfectly fine description here.",
        price=price, currency="INR", availability="in_stock",
    )
    db_session.add(item)
    db_session.flush()
    return item


def test_per_transaction_cap_blocks_a_single_large_purchase_even_under_windowed_ceiling(db_session, merchant):
    mandate = Mandate(
        merchant_id=None, spend_ceiling=5000.0, per_transaction_cap=500.0,
        window=MandateWindow.daily, allow_listed_merchants=[merchant.id], created_by="test",
    )
    db_session.add(mandate)
    db_session.flush()
    item = _make_item(db_session, merchant, 800.0)

    result = transact_mod.attempt_purchase(db_session, item.id, 800.0)

    assert result["status"] == "blocked"
    assert "per-transaction" in result["reason"].lower() or "per transaction" in result["reason"].lower()


def test_purchase_within_per_transaction_cap_and_windowed_ceiling_succeeds(db_session, merchant):
    mandate = Mandate(
        merchant_id=None, spend_ceiling=5000.0, per_transaction_cap=1000.0,
        window=MandateWindow.daily, allow_listed_merchants=[merchant.id], created_by="test",
    )
    db_session.add(mandate)
    db_session.flush()
    item = _make_item(db_session, merchant, 800.0)

    with patch.object(transact_mod, "get_client", return_value=_fake_razorpay_client()):
        result = transact_mod.attempt_purchase(db_session, item.id, 800.0)

    assert result["status"] == "success"


def test_daily_window_resets_after_24_hours(db_session, merchant):
    """This is the exact repro from the bug report: a purchase made 'yesterday' must not
    permanently consume today's budget once the mandate has a daily window."""
    mandate = Mandate(
        merchant_id=None, spend_ceiling=1500.0, per_transaction_cap=None,
        window=MandateWindow.daily, allow_listed_merchants=[merchant.id], created_by="test",
    )
    db_session.add(mandate)
    db_session.flush()

    old_item = _make_item(db_session, merchant, 1100.0)
    old_action = AgentAction(
        agent_name="Transact", merchant_id=merchant.id, reasoning="old purchase",
        action_taken="Created order", input={}, output={}, result=AgentResult.success,
        mandate_id=mandate.id,
    )
    db_session.add(old_action)
    db_session.flush()
    yesterday = datetime.datetime.utcnow() - datetime.timedelta(days=2)
    old_txn = Transaction(
        merchant_id=merchant.id, catalog_item_id=old_item.id, amount=1100.0,
        razorpay_order_id="order_old", status=TransactionStatus.created, agent_action_id=old_action.id,
        created_at=yesterday,
    )
    db_session.add(old_txn)
    db_session.flush()

    # Today's purchase: 1100 (2 days ago) would already exceed 1500 under an all-time
    # counter, but the old purchase is outside the daily window, so this must succeed.
    new_item = _make_item(db_session, merchant, 299.0)
    with patch.object(transact_mod, "get_client", return_value=_fake_razorpay_client()):
        result = transact_mod.attempt_purchase(db_session, new_item.id, 299.0)

    assert result["status"] == "success"


def test_one_time_window_never_resets_matching_legacy_behavior(db_session, merchant):
    mandate = Mandate(
        merchant_id=None, spend_ceiling=1500.0, per_transaction_cap=None,
        window=MandateWindow.one_time, allow_listed_merchants=[merchant.id], created_by="test",
    )
    db_session.add(mandate)
    db_session.flush()

    item_a = _make_item(db_session, merchant, 1100.0)
    item_b = _make_item(db_session, merchant, 500.0)

    with patch.object(transact_mod, "get_client", return_value=_fake_razorpay_client()):
        first = transact_mod.attempt_purchase(db_session, item_a.id, 1100.0)
        second = transact_mod.attempt_purchase(db_session, item_b.id, 500.0)

    assert first["status"] == "success"
    # 1100 + 500 = 1600 > 1500 ceiling, and one_time never resets -- same as before this change
    assert second["status"] == "blocked"
