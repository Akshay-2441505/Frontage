from unittest.mock import MagicMock, patch

import app.agents.transact as transact_mod


def test_bookkeeping_failure_after_successful_order_does_not_raise(db_session, merchant, catalog_item, mandate):
    fake_client = MagicMock()
    fake_client.order.create.return_value = {"id": "order_REAL_ORDER_ALREADY_CREATED"}
    fake_client.payment_link.create.return_value = {"id": "plink_x", "short_url": "https://rzp.io/x"}

    original_flush = db_session.flush
    call_count = {"n": 0}

    def flaky_flush():
        call_count["n"] += 1
        # Let the read-side calls earlier in attempt_purchase through (there are none
        # before this point in the success path); fail the very first flush, which is
        # the one that would persist the Transaction/AgentAction rows.
        raise RuntimeError("simulated DB failure writing the transaction record")

    with patch.object(transact_mod, "get_client", return_value=fake_client):
        with patch.object(db_session, "flush", side_effect=flaky_flush):
            # Must not raise -- a real Razorpay order already exists; crashing here
            # would return a raw 500 with zero record of that order anywhere.
            result = transact_mod.attempt_purchase(db_session, catalog_item.id, catalog_item.price)

    assert result["status"] in ("success", "failed")
    # The real order id must still be surfaced to the caller even though our own
    # bookkeeping failed -- losing it entirely would hide that money-adjacent
    # state exists on Razorpay's side with nothing pointing back to it.
    assert result.get("razorpay_order_id") == "order_REAL_ORDER_ALREADY_CREATED"
    assert result.get("estimated_delivery")
