def test_put_mandate_with_nonexistent_merchant_returns_clean_error(client):
    resp = client.put(
        "/mandate",
        json={
            "merchant_id": "does-not-exist",
            "spend_ceiling": 1000.0,
            "allow_listed_merchants": [],
            "created_by": "test",
        },
    )
    assert resp.status_code == 422
    assert "does-not-exist" in resp.json()["detail"]


def test_put_mandate_rejects_non_positive_spend_ceiling(client, merchant):
    resp = client.put(
        "/mandate",
        json={
            "merchant_id": merchant.id,
            "spend_ceiling": 0,
            "allow_listed_merchants": [merchant.id],
            "created_by": "test",
        },
    )
    assert resp.status_code == 422
