def test_update_price_changes_the_stored_price(client, merchant, catalog_item):
    resp = client.put(f"/catalog-items/{catalog_item.id}/price", json={"price": 750.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 750.0

    catalog = client.get(f"/merchants/{merchant.id}/catalog").json()
    assert catalog[0]["price"] == 750.0


def test_update_price_rejects_non_positive_values(client, catalog_item):
    resp = client.put(f"/catalog-items/{catalog_item.id}/price", json={"price": 0})
    assert resp.status_code == 422


def test_update_price_404s_for_unknown_item(client):
    resp = client.put("/catalog-items/does-not-exist/price", json={"price": 100.0})
    assert resp.status_code == 404


def test_price_drift_after_manifest_publish_blocks_the_stale_price(client, db_session, merchant, catalog_item, mandate):
    # catalog_item.price == 500.0 from the fixture; a buyer agent would have snapshotted
    # this price at manifest-fetch time.
    catalog_item.agent_readable = True
    db_session.commit()

    publish = client.post(f"/merchants/{merchant.id}/fix/publish")
    assert publish.status_code == 200

    # Merchant edits the price after the manifest was published -- the manifest a buyer
    # agent already fetched is now stale.
    client.put(f"/catalog-items/{catalog_item.id}/price", json={"price": 650.0})

    stale_price_purchase = client.post(
        "/transact/purchase",
        json={"catalog_item_id": catalog_item.id, "requested_amount": 500.0},
    )
    result = stale_price_purchase.json()
    assert result["status"] == "blocked"
    assert "price" in result["reason"].lower()
