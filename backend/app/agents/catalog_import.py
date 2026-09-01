"""Real-catalog import: turns a real store's public product feed into a new
Merchant + CatalogItems, using the pluggable sources in catalog_sources/.

Not one of the four core agents (Diagnose/Fix/Transact/BuyerAgent) — this is a
one-time data-ingestion step a human triggers deliberately, so it isn't
written to the AgentAction audit log. Items that already have a real, usable
description are marked agent_readable immediately (same rule the seed data
uses); thin/missing ones are left for the Fix Agent to pick up, same as any
other merchant.

Reconnecting a store you've already imported must not create a second
merchant. The store's normalized URL is the identity key: a repeat import
looks up the existing merchant by it, and either leaves things alone (the
live feed hasn't changed) or replaces the catalog with the fresh pull.
Replacing discards any Fix-agent work on the old items (approved
descriptions, manual price edits) -- accepted trade-off for staying in sync
with the merchant's real, live catalog rather than a stale snapshot. The
mandate is never touched by a resync, so a human-adjusted spend ceiling
survives.
"""
import json

from sqlalchemy.orm import Session

from app.agents.catalog_sources import SOURCES, CatalogFetchError
from app.agents.catalog_sources.shopify import normalize_store_url
from app.agents.diagnose import _description_ok
from app.models import CatalogItem, ItemSource, Mandate, Merchant, Transaction


def _signature(name, description, price, availability, variant_info, has_variants, image_url, image_urls) -> tuple:
    """A comparable snapshot of everything about a product that matters to a shopping
    agent or a human catalog viewer -- used to tell "nothing changed" apart from "the
    live store updated this" without caring about incidental differences (dict key
    order, list identity)."""
    return (
        name,
        description,
        round(float(price), 2),
        availability,
        json.dumps(variant_info, sort_keys=True) if variant_info else None,
        bool(has_variants),
        image_url,
        tuple(image_urls) if image_urls else None,
    )


def _product_signature(p: dict) -> tuple:
    return _signature(
        p["name"], p["description"], p["price"], p["availability"],
        p["variant_info"], p.get("has_variants", True), p.get("image_url"), p.get("image_urls"),
    )


def _catalog_item_signature(item: CatalogItem) -> tuple:
    return _signature(
        item.name, item.description, item.price, item.availability,
        item.variant_info, item.has_variants, item.image_url, item.image_urls,
    )


def _build_catalog_item(merchant_id: str, currency: str, p: dict) -> CatalogItem:
    item = CatalogItem(
        merchant_id=merchant_id,
        name=p["name"],
        description=p["description"],
        price=p["price"],
        currency=currency,
        availability=p["availability"],
        variant_info=p["variant_info"],
        has_variants=p.get("has_variants", True),
        image_url=p.get("image_url"),
        image_urls=p.get("image_urls"),
        source=ItemSource.manual,  # real merchant-authored data, not LLM-generated
    )
    item.agent_readable = _description_ok(item) and item.availability is not None
    return item


def import_store(db: Session, source_name: str, store_url: str, merchant_name: str, currency: str, limit: int) -> dict:
    source = SOURCES.get(source_name)
    if not source:
        raise CatalogFetchError(f"Unknown catalog source '{source_name}'. Available: {', '.join(SOURCES)}")

    normalized_url = normalize_store_url(store_url)
    products = source.fetch_products(store_url, limit)

    existing = db.query(Merchant).filter(Merchant.source_url == normalized_url).first()

    if existing:
        old_signatures = sorted(_catalog_item_signature(i) for i in existing.catalog_items)
        new_signatures = sorted(_product_signature(p) for p in products)

        if old_signatures == new_signatures:
            return {
                "merchant_id": existing.id,
                "merchant_name": existing.name,
                "item_count": len(existing.catalog_items),
                "status": "unchanged",
                "mandate_spend_ceiling": None,
            }

        # A resync must never destroy the record of a real purchase: an item with a
        # Transaction against it is left in place (both because deleting it would
        # violate the FK, and because a receipt shouldn't silently change) while
        # everything else is replaced with the fresh pull.
        transacted_ids = {
            row[0] for row in
            db.query(Transaction.catalog_item_id).filter(Transaction.merchant_id == existing.id).distinct()
        }
        (
            db.query(CatalogItem)
            .filter(CatalogItem.merchant_id == existing.id, CatalogItem.id.notin_(transacted_ids))
            .delete(synchronize_session="fetch")
        )
        db.flush()

        items = [_build_catalog_item(existing.id, currency, p) for p in products]
        db.add_all(items)
        db.flush()

        return {
            "merchant_id": existing.id,
            "merchant_name": existing.name,
            "item_count": len(existing.catalog_items),
            "status": "refreshed",
            "mandate_spend_ceiling": None,
        }

    merchant = Merchant(
        name=merchant_name,
        razorpay_account_ref=None,
        catalog_source=source_name,
        source_url=normalized_url,
    )
    db.add(merchant)
    db.flush()

    items = [_build_catalog_item(merchant.id, currency, p) for p in products]
    db.add_all(items)
    # Without this, a same-session read-back (e.g. a later reconnect's resync
    # comparison) sees an empty merchant.catalog_items, since autoflush=False here.
    db.flush()

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
    db.flush()

    return {
        "merchant_id": merchant.id,
        "merchant_name": merchant.name,
        "item_count": len(items),
        "status": "created",
        "mandate_spend_ceiling": median_price,
    }
