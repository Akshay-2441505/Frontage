def test_put_mandate_accepts_and_returns_window_and_per_transaction_cap(client, merchant):
    resp = client.put(
        "/mandate",
        json={
            "merchant_id": merchant.id,
            "spend_ceiling": 5000.0,
            "per_transaction_cap": 1000.0,
            "window": "daily",
            "allow_listed_merchants": [merchant.id],
            "created_by": "test",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["per_transaction_cap"] == 1000.0
    assert body["window"] == "daily"


def test_put_mandate_defaults_to_one_time_window_and_no_per_transaction_cap(client, merchant):
    resp = client.put(
        "/mandate",
        json={
            "merchant_id": merchant.id,
            "spend_ceiling": 1500.0,
            "allow_listed_merchants": [merchant.id],
            "created_by": "test",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["per_transaction_cap"] is None
    assert body["window"] == "one_time"


def test_put_mandate_rejects_invalid_window_value(client, merchant):
    resp = client.put(
        "/mandate",
        json={
            "merchant_id": merchant.id,
            "spend_ceiling": 1500.0,
            "window": "yearly",
            "allow_listed_merchants": [merchant.id],
            "created_by": "test",
        },
    )
    assert resp.status_code == 422


def test_get_mandate_includes_window_fields(client, merchant, mandate):
    resp = client.get(f"/mandate?merchant_id={merchant.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert "window" in body
    assert "per_transaction_cap" in body
