"""Real-catalog import: turns a real store's public product feed into a new
Merchant + CatalogItems, using the pluggable sources in catalog_sources/.

Not one of the four core agents (Diagnose/Fix/Transact/BuyerAgent) — this is a
one-time data-ingestion step a human triggers deliberately, so it isn't
written to the AgentAction audit log. Items that already have a real, usable
description are marked agent_readable immediately (same rule the seed data
uses); thin/missing ones are left for the Fix Agent to pick up, same as any
other merchant.
"""
from sqlalchemy.orm import Session

from app.agents.catalog_sources import SOURCES, CatalogFetchError
from app.agents.diagnose import _description_ok
from app.models import CatalogItem, ItemSource, Mandate, Merchant


def import_store(db: Session, source_name: str, store_url: str, merchant_name: str, currency: str, limit: int) -> dict:
    source = SOURCES.get(source_name)
    if not source:
        raise CatalogFetchError(f"Unknown catalog source '{source_name}'. Available: {', '.join(SOURCES)}")

    products = source.fetch_products(store_url, limit)

    merchant = Merchant(
        name=merchant_name,
        razorpay_account_ref=None,
        catalog_source=source_name,
    )
    db.add(merchant)
    db.flush()

    items = []
    for p in products:
        item = CatalogItem(
            merchant_id=merchant.id,
            name=p["name"],
            description=p["description"],
            price=p["price"],
            currency=currency,
            availability=p["availability"],
            variant_info=p["variant_info"],
            has_variants=p.get("has_variants", True),
            image_url=p.get("image_url"),
            source=ItemSource.manual,  # real merchant-authored data, not LLM-generated
        )
        item.agent_readable = _description_ok(item) and item.availability is not None
        items.append(item)
    db.add_all(items)

    # A single global spend ceiling can't fit every brand's price range -- Comet's
    # cheapest shoe alone is well above the seed demo's INR 1500 ceiling, which would
    # block the entire catalog outright. Give each imported merchant its own mandate,
    # ceiling set at the catalog's median price: roughly half the items land under
    # budget and half over, so both a successful purchase and a spend-ceiling breach
    # are demonstrable out of the box, whatever the store's actual price range is.
    # This is a starting point, not a fixed rule -- a human can still adjust it via
    # PUT /mandate afterward.
    prices = sorted(i.price for i in items)
    median_price = prices[len(prices) // 2] if prices else 0.0

    mandate = Mandate(
        merchant_id=merchant.id,
        spend_ceiling=median_price,
        allow_listed_merchants=[merchant.id],
        created_by="auto-import (catalog median price)",
    )
    db.add(mandate)

    return {
        "merchant_id": merchant.id,
        "merchant_name": merchant.name,
        "item_count": len(items),
        "mandate_spend_ceiling": median_price,
    }
