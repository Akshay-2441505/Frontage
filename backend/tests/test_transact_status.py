from unittest.mock import MagicMock, patch

import pytest

import app.agents.transact as transact_mod
from app.models import Transaction, TransactionStatus


def _transaction(db_session, merchant, catalog_item, **overrides):
    base = dict(
        merchant_id=merchant.id,
        catalog_item_id=catalog_item.id,
        amount=catalog_item.price,
        razorpay_order_id="order_x",
        razorpay_payment_link_id="plink_x",
        status=TransactionStatus.created,
    )
    base.update(overrides)
    txn = Transaction(**base)
    db_session.add(txn)
    db_session.flush()
    return txn


def test_paid_payment_link_updates_transaction_to_paid(db_session, merchant, catalog_item):
    txn = _transaction(db_session, merchant, catalog_item)

    fake_client = MagicMock()
    fake_client.payment_link.fetch.return_value = {"id": "plink_x", "status": "paid"}

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        result = transact_mod.check_transaction_status(db_session, txn.id)

    assert result["status"] == "paid"
    assert txn.status == TransactionStatus.paid


def test_still_created_payment_link_leaves_transaction_unchanged(db_session, merchant, catalog_item):
    txn = _transaction(db_session, merchant, catalog_item)

    fake_client = MagicMock()
    fake_client.payment_link.fetch.return_value = {"id": "plink_x", "status": "created"}

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        result = transact_mod.check_transaction_status(db_session, txn.id)

    assert result["status"] == "created"
    assert txn.status == TransactionStatus.created


@pytest.mark.parametrize("razorpay_status", ["cancelled", "expired"])
def test_cancelled_or_expired_payment_link_marks_transaction_failed(db_session, merchant, catalog_item, razorpay_status):
    txn = _transaction(db_session, merchant, catalog_item)

    fake_client = MagicMock()
    fake_client.payment_link.fetch.return_value = {"id": "plink_x", "status": razorpay_status}

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        result = transact_mod.check_transaction_status(db_session, txn.id)

    assert result["status"] == "failed"
    assert txn.status == TransactionStatus.failed


def test_unknown_transaction_id_raises_value_error(db_session):
    with pytest.raises(ValueError):
        transact_mod.check_transaction_status(db_session, "not-a-real-id")


def test_transaction_without_payment_link_returns_stored_status_without_calling_razorpay(db_session, merchant, catalog_item):
    txn = _transaction(db_session, merchant, catalog_item, razorpay_payment_link_id=None)

    fake_client = MagicMock()

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        result = transact_mod.check_transaction_status(db_session, txn.id)

    assert result["status"] == "created"
    fake_client.payment_link.fetch.assert_not_called()


def test_razorpay_fetch_failure_returns_stored_status_without_raising(db_session, merchant, catalog_item):
    txn = _transaction(db_session, merchant, catalog_item)

    fake_client = MagicMock()
    fake_client.payment_link.fetch.side_effect = RuntimeError("network blip")

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        result = transact_mod.check_transaction_status(db_session, txn.id)

    assert result["status"] == "created"
