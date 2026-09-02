import re
from unittest.mock import MagicMock, patch

import app.agents.transact as transact_mod

DELIVERY_PATTERN = re.compile(r"^\d+-\d+ business days \(estimated\)$")


def _fake_client():
    client = MagicMock()
    client.order.create.return_value = {"id": "order_x"}
    client.payment_link.create.return_value = {"id": "plink_x", "short_url": "https://rzp.io/x"}
    return client


def test_successful_purchase_includes_estimated_delivery(db_session, merchant, catalog_item, mandate):
    with patch.object(transact_mod, "get_client", return_value=_fake_client()):
        result = transact_mod.attempt_purchase(db_session, catalog_item.id, catalog_item.price)

    assert result["status"] == "success"
    assert DELIVERY_PATTERN.match(result["estimated_delivery"])


def test_estimated_delivery_is_deterministic_per_item(db_session, merchant, catalog_item, mandate):
    with patch.object(transact_mod, "get_client", return_value=_fake_client()):
        first = transact_mod.attempt_purchase(db_session, catalog_item.id, catalog_item.price)
    with patch.object(transact_mod, "get_client", return_value=_fake_client()):
        second = transact_mod.attempt_purchase(db_session, catalog_item.id, catalog_item.price)

    assert first["estimated_delivery"] == second["estimated_delivery"]
