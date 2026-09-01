from app.agents.diagnose import CHECK_WEIGHTS, run_diagnose
from app.models import CatalogItem, Mandate


def _item(db_session, merchant, **overrides):
    base = dict(
        merchant_id=merchant.id,
        name="Product",
        description="A perfectly adequate description for this product.",
        price=100.0,
        currency="INR",
        availability="in_stock",
        has_variants=False,
        image_url="https://cdn.example.com/product.jpg",
    )
    base.update(overrides)
    item = CatalogItem(**base)
    db_session.add(item)
    return item


def test_check_weights_sum_to_100():
    assert sum(CHECK_WEIGHTS.values()) == 100


def test_name_disambiguation_catches_exact_duplicates(db_session, merchant):
    _item(db_session, merchant, name="Mystery Box")
    _item(db_session, merchant, name="Mystery Box")
    _item(db_session, merchant, name="Unique Product")
    db_session.flush()

    result = run_diagnose(db_session, merchant)
    gap = next(g for g in result["gaps"] if g["check_name"] == "name_disambiguation")

    assert gap["status"] == "fail"
    assert gap["detail"].startswith("2 of 3 products")


def test_name_disambiguation_passes_when_all_names_unique(db_session, merchant):
    _item(db_session, merchant, name="Alpha")
    _item(db_session, merchant, name="Beta")
    db_session.flush()

    result = run_diagnose(db_session, merchant)
    gap = next(g for g in result["gaps"] if g["check_name"] == "name_disambiguation")

    assert gap["status"] == "pass"
    assert gap["detail"].startswith("All 2 products")


def test_product_imagery_counts_missing_images(db_session, merchant):
    _item(db_session, merchant, name="Has Image", image_url="https://cdn.example.com/x.jpg")
    _item(db_session, merchant, name="No Image 1", image_url=None)
    _item(db_session, merchant, name="No Image 2", image_url=None)
    db_session.flush()

    result = run_diagnose(db_session, merchant)
    gap = next(g for g in result["gaps"] if g["check_name"] == "product_imagery")

    assert gap["status"] == "fail"
    assert gap["detail"].startswith("2 of 3 products")


def test_product_imagery_passes_when_all_have_images(db_session, merchant):
    _item(db_session, merchant, name="A", image_url="https://cdn.example.com/a.jpg")
    _item(db_session, merchant, name="B", image_url="https://cdn.example.com/b.jpg")
    db_session.flush()

    result = run_diagnose(db_session, merchant)
    gap = next(g for g in result["gaps"] if g["check_name"] == "product_imagery")

    assert gap["status"] == "pass"


def test_full_score_when_every_check_passes(db_session, merchant):
    _item(db_session, merchant, name="Only Product")
    db_session.add(
        Mandate(
            merchant_id=None,
            spend_ceiling=1000.0,
            allow_listed_merchants=[merchant.id],
            created_by="test-setup",
        )
    )
    db_session.flush()

    manifest_url = "https://example.com/manifest.json"
    from app.models import CatalogManifest

    item = merchant.catalog_items[0]
    db_session.add(
        CatalogManifest(merchant_id=merchant.id, version=1, url=manifest_url, item_ids=[item.id])
    )
    db_session.flush()

    result = run_diagnose(db_session, merchant)

    assert result["score"] == 100.0
    assert all(g["status"] == "pass" for g in result["gaps"])
