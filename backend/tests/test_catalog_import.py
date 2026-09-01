from unittest.mock import patch

from app.agents.catalog_import import import_store
from app.agents.catalog_sources import SOURCES
from app.agents.fix import publish_manifest
from app.models import (
    AgentAction,
    AgentResult,
    CatalogItem,
    CatalogManifest,
    Mandate,
    Merchant,
    Transaction,
    TransactionStatus,
)


def _product(**overrides):
    base = {
        "name": "Test Shirt",
        "description": "A perfectly adequate description for this shirt.",
        "price": 999.0,
        "availability": "in_stock",
        "variant_info": {"size": ["S", "M"]},
        "has_variants": True,
        "image_url": "https://cdn.example.com/shirt.jpg",
        "image_urls": ["https://cdn.example.com/shirt.jpg"],
    }
    base.update(overrides)
    return base


def _import(db_session, store_url="teststore.com", products=None):
    with patch.object(SOURCES["shopify"], "fetch_products", return_value=products or [_product()]):
        return import_store(db_session, "shopify", store_url, "Test Store", "INR", 25)


def test_new_store_creates_merchant_with_source_url(db_session):
    result = _import(db_session)

    assert result["status"] == "created"
    merchant = db_session.get(Merchant, result["merchant_id"])
    assert merchant.source_url == "https://teststore.com"


def test_reconnecting_identical_store_does_not_duplicate_merchant(db_session):
    first = _import(db_session)
    second = _import(db_session)

    assert second["merchant_id"] == first["merchant_id"]
    assert second["status"] == "unchanged"
    assert db_session.query(Merchant).count() == 1
    assert db_session.query(CatalogItem).count() == 1


def test_reconnecting_with_changed_data_replaces_catalog_items(db_session):
    first = _import(db_session, products=[_product(price=999.0)])
    original_item_id = db_session.query(CatalogItem).one().id

    second = _import(db_session, products=[_product(price=1299.0)])

    assert second["merchant_id"] == first["merchant_id"]
    assert second["status"] == "refreshed"
    assert db_session.query(Merchant).count() == 1
    items = db_session.query(CatalogItem).all()
    assert len(items) == 1
    assert items[0].id != original_item_id
    assert items[0].price == 1299.0


def test_reconnect_preserves_existing_mandate(db_session):
    first = _import(db_session, products=[_product(price=999.0)])
    mandate = db_session.query(Mandate).filter(Mandate.merchant_id == first["merchant_id"]).one()
    mandate.spend_ceiling = 5000.0  # simulate a human raising the ceiling after import
    db_session.flush()

    _import(db_session, products=[_product(price=1299.0)])

    assert db_session.query(Mandate).filter(Mandate.merchant_id == first["merchant_id"]).count() == 1
    refreshed_mandate = db_session.get(Mandate, mandate.id)
    assert refreshed_mandate.spend_ceiling == 5000.0


def test_differently_formatted_url_still_matches_same_merchant(db_session):
    first = _import(db_session, store_url="teststore.com")
    second = _import(db_session, store_url="https://teststore.com/")

    assert second["merchant_id"] == first["merchant_id"]
    assert db_session.query(Merchant).count() == 1


def test_reconnect_does_not_delete_a_transacted_item(db_session):
    """A resync must never destroy the record of a real purchase -- an item that
    already has a Transaction against it is left alone even when the live store's
    catalog has changed, since deleting it would either violate the FK or silently
    corrupt what a real buyer was actually charged for."""
    first = _import(db_session, products=[_product(name="Old Shirt", price=999.0)])
    item = db_session.query(CatalogItem).one()

    action = AgentAction(
        agent_name="Transact",
        merchant_id=first["merchant_id"],
        reasoning="test",
        action_taken="test",
        result=AgentResult.success,
    )
    db_session.add(action)
    db_session.flush()
    db_session.add(
        Transaction(
            merchant_id=first["merchant_id"],
            catalog_item_id=item.id,
            amount=999.0,
            status=TransactionStatus.paid,
            agent_action_id=action.id,
        )
    )
    db_session.flush()

    second = _import(db_session, products=[_product(name="New Shirt", price=1299.0)])

    assert second["status"] == "refreshed"
    items = db_session.query(CatalogItem).filter(CatalogItem.merchant_id == first["merchant_id"]).all()
    names = {i.name for i in items}
    assert "Old Shirt" in names  # the transacted item survives untouched
    assert "New Shirt" in names  # the fresh pull is still added
    assert db_session.query(Transaction).filter(Transaction.catalog_item_id == item.id).count() == 1


def test_resync_republishes_an_already_published_manifest(db_session):
    """A resync replaces catalog item rows with fresh ones (new ids), which silently
    strands any manifest published before the resync -- most of its item_ids no
    longer resolve to anything, so a shopping agent reading it sees almost nothing.
    Since the merchant already chose to publish once, a resync must keep that
    manifest in sync automatically rather than leaving it broken until they notice
    and manually republish."""
    first = _import(db_session, products=[_product(name="Shirt A"), _product(name="Shirt B")])
    merchant = db_session.get(Merchant, first["merchant_id"])
    publish_manifest(db_session, merchant)
    db_session.flush()  # the real router commits here; this test stands in for that

    _import(db_session, products=[_product(name="Shirt A"), _product(name="Shirt C")])

    manifests = (
        db_session.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == first["merchant_id"])
        .order_by(CatalogManifest.version.desc())
        .all()
    )
    assert len(manifests) == 2  # the resync published a new version, not zero

    latest = manifests[0]
    current_item_ids = {
        i.id for i in db_session.query(CatalogItem).filter(CatalogItem.merchant_id == first["merchant_id"])
    }
    assert set(latest.item_ids) == current_item_ids


def test_resync_does_not_publish_a_manifest_that_never_existed(db_session):
    """A first-time import (or a merchant that was never published) must not gain a
    manifest just because it happens to get resynced -- publishing is still the
    merchant's own deliberate action for a catalog that was never live."""
    first = _import(db_session, products=[_product(name="Shirt A")])

    _import(db_session, products=[_product(name="Shirt A"), _product(name="Shirt B")])

    count = db_session.query(CatalogManifest).filter(CatalogManifest.merchant_id == first["merchant_id"]).count()
    assert count == 0
