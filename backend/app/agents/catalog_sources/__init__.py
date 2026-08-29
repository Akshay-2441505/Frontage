"""Catalog source registry: pluggable importers that turn a real store's public
product feed into normalized product dicts. Shopify is the first (and so far
only) implementation, but every source shares the same interface so a second
platform (WooCommerce, a generic schema.org/JSON-LD site, etc.) can be added
later as its own module without touching the import endpoint or this registry
beyond one new entry.

A NormalizedProduct is a plain dict with exactly these keys:
    name: str
    description: str | None
    price: float
    availability: "in_stock" | "out_of_stock" | None
    variant_info: dict | None
    has_variants: bool  -- does this product genuinely have more than one purchasable
        form (sizes/colors/etc)? False for single-SKU products, which have nothing to
        disambiguate -- missing variant_info only counts as a gap when this is True.
"""
from app.agents.catalog_sources.base import CatalogFetchError, CatalogSource
from app.agents.catalog_sources.shopify import ShopifySource

SOURCES: dict[str, CatalogSource] = {
    "shopify": ShopifySource(),
}

__all__ = ["SOURCES", "CatalogFetchError", "CatalogSource"]
