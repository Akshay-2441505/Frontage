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
            source=ItemSource.manual,  # real merchant-authored data, not LLM-generated
        )
        item.agent_readable = _description_ok(item) and item.availability is not None
        items.append(item)
    db.add_all(items)

    added_to_mandate = False
    mandate = db.query(Mandate).filter(Mandate.merchant_id.is_(None)).order_by(Mandate.created_at.desc()).first()
    if mandate and merchant.id not in (mandate.allow_listed_merchants or []):
        mandate.allow_listed_merchants = [*mandate.allow_listed_merchants, merchant.id]
        added_to_mandate = True

    return {
        "merchant_id": merchant.id,
        "merchant_name": merchant.name,
        "item_count": len(items),
        "added_to_mandate_allow_list": added_to_mandate,
    }
