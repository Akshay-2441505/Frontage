def test_fixtures_work(db_session, merchant, catalog_item, mandate):
    assert merchant.id
    assert catalog_item.merchant_id == merchant.id
    assert mandate.allow_listed_merchants == [merchant.id]
