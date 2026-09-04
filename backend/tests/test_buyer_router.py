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


def test_shop_endpoint_dry_run_returns_would_purchase_without_a_real_order(client, db_session, merchant, catalog_item):
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

    with (
        patch.object(buyer_mod, "get_client", return_value=fake_client),
        patch.object(buyer_mod, "attempt_purchase") as fake_purchase,
    ):
        resp = client.post(
            "/buyer-agent/shop",
            json={"merchant_id": merchant.id, "goal": "anything", "history": [], "dry_run": True},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "would_purchase"
    assert "purchase_result" not in body
    fake_purchase.assert_not_called()


def test_discover_endpoint_returns_a_purchase_attempt(client, db_session, merchant, catalog_item):
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
            "/buyer-agent/discover",
            json={"goal": "under 600 rupees", "history": []},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "purchase_attempted"
    assert body["selected_product"]["merchant_name"] == "Test Merchant"


def test_discover_endpoint_returns_no_merchants_when_nothing_published(client):
    resp = client.post("/buyer-agent/discover", json={"goal": "anything", "history": []})

    assert resp.status_code == 200
    assert resp.json()["status"] == "no_merchants"


def _publish(db_session, merchant, items):
    """A store is only discoverable once it has published a manifest."""
    db_session.add(
        CatalogManifest(
            merchant_id=merchant.id, version=1, url=f"/m/{merchant.id}",
            item_ids=[i.id for i in items],
        )
    )
    for item in items:
        item.agent_readable = True


def test_showcase_spreads_across_stores_and_skips_photoless_products(client, db_session):
    """The hero wall's whole claim is that one agent reads many catalogs. It used to
    build itself from the first five merchants, two of which publish no photography at
    all -- so they took slots, contributed nothing, and six stores could never appear."""
    from app.models import CatalogItem, Merchant

    stores = []
    for n in range(4):
        m = Merchant(name=f"Store {n}", catalog_source="seed")
        db_session.add(m)
        db_session.flush()
        items = []
        for k in range(3):
            # Store 0 publishes nothing photographed; it must not take a slot.
            item = CatalogItem(
                merchant_id=m.id, name=f"S{n} item {k}",
                description="A description long enough to be useful to a shopping agent.",
                price=100.0 + k, currency="INR", availability="in_stock",
                image_url=None if n == 0 else f"https://cdn.example.com/{n}-{k}.jpg",
            )
            db_session.add(item)
            items.append(item)
        db_session.flush()
        _publish(db_session, m, items)
        stores.append(m)
    db_session.commit()

    body = client.get("/buyer-agent/showcase?count=3").json()
    products = body["products"]

    assert len(products) == 3
    assert all(p["image_url"] for p in products), "a photo wall cannot use photo-less products"
    assert "Store 0" not in {p["merchant_name"] for p in products}
    # One slot each: no single catalog may dominate the wall.
    assert len({p["merchant_id"] for p in products}) == 3


def test_showcase_exclude_and_feature_are_editorial_controls(client, db_session):
    """Which stores belong on a hero wall, and how much room each gets, is a choice
    about the shopfront rather than a fact about the catalog -- so it is passed in."""
    from app.models import CatalogItem, Merchant

    for name in ("Keep A", "Keep B", "Drop Me", "Star"):
        m = Merchant(name=name, catalog_source="seed")
        db_session.add(m)
        db_session.flush()
        items = [
            CatalogItem(
                merchant_id=m.id, name=f"{name} {k}",
                description="A description long enough to be useful to a shopping agent.",
                price=100.0 + k, currency="INR", availability="in_stock",
                image_url=f"https://cdn.example.com/{name}-{k}.jpg",
            )
            for k in range(3)
        ]
        db_session.add_all(items)
        db_session.flush()
        _publish(db_session, m, items)
    db_session.commit()

    body = client.get("/buyer-agent/showcase?count=3&exclude=Drop Me&feature=Star").json()
    names = [p["merchant_name"] for p in body["products"]]

    assert "Drop Me" not in names
    assert names.count("Star") == 2, "a featured store gets a second slot"
    # The extra displaces the tail of the spread rather than growing the wall.
    assert len(body["products"]) == 3
    assert len({p["id"] for p in body["products"]}) == 3, "and does not repeat one product"


def test_showcase_varies_between_visits_but_holds_its_guarantees(client, db_session):
    """The wall is meant to be different every visit. Randomising it must not cost any
    of the properties that made it worth showing: one product per store, every slot
    photographed, no repeats."""
    from app.models import CatalogItem, Merchant

    for n in range(6):
        m = Merchant(name=f"Shop {n}", catalog_source="seed")
        db_session.add(m)
        db_session.flush()
        items = [
            CatalogItem(
                merchant_id=m.id, name=f"Shop {n} item {k}",
                description="A description long enough to be useful to a shopping agent.",
                price=100.0 + k, currency="INR", availability="in_stock",
                image_url=f"https://cdn.example.com/{n}-{k}.jpg",
            )
            for k in range(5)
        ]
        db_session.add_all(items)
        db_session.flush()
        _publish(db_session, m, items)
    db_session.commit()

    walls = set()
    for _ in range(25):
        body = client.get("/buyer-agent/showcase?count=4").json()
        products = body["products"]
        assert len(products) == 4
        assert all(p["image_url"] for p in products)
        assert len({p["id"] for p in products}) == 4, "no repeated product"
        assert len({p["merchant_id"] for p in products}) == 4, "no store twice"
        walls.add(tuple(p["id"] for p in products))

    # 6 stores of 5 products each: the odds of 25 identical draws are vanishing.
    assert len(walls) > 1, "the wall never changed across 25 visits"


def test_showcase_seed_pins_the_wall(client, db_session):
    """A seed exists so a demo recording or a screenshot can be reproduced."""
    from app.models import CatalogItem, Merchant

    for n in range(4):
        m = Merchant(name=f"Fixed {n}", catalog_source="seed")
        db_session.add(m)
        db_session.flush()
        items = [
            CatalogItem(
                merchant_id=m.id, name=f"Fixed {n} item {k}",
                description="A description long enough to be useful to a shopping agent.",
                price=100.0 + k, currency="INR", availability="in_stock",
                image_url=f"https://cdn.example.com/f{n}-{k}.jpg",
            )
            for k in range(4)
        ]
        db_session.add_all(items)
        db_session.flush()
        _publish(db_session, m, items)
    db_session.commit()

    first = client.get("/buyer-agent/showcase?count=3&seed=42").json()["products"]
    second = client.get("/buyer-agent/showcase?count=3&seed=42").json()["products"]
    assert [p["id"] for p in first] == [p["id"] for p in second]

    other = client.get("/buyer-agent/showcase?count=3&seed=7").json()["products"]
    assert [p["id"] for p in other] != [p["id"] for p in first]


def test_showcase_response_is_not_cacheable(client, db_session, merchant, catalog_item):
    """Variety that a proxy can freeze is not variety."""
    catalog_item.image_url = "https://cdn.example.com/a.jpg"
    db_session.flush()
    _publish(db_session, merchant, [catalog_item])
    db_session.commit()

    assert client.get("/buyer-agent/showcase?count=1").headers["cache-control"] == "no-store"
