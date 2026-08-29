import re
from html import unescape
from urllib.parse import urlparse

import requests

from app.agents.catalog_sources.base import CatalogFetchError

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
# Shopify's placeholder for "this product has no real variant choice" (a single-SKU
# item) -- not a genuine variant value, so it's filtered out rather than reported as one.
_SINGLE_SKU_PLACEHOLDER = "Default Title"


def _strip_html(raw: str | None) -> str | None:
    if not raw:
        return None
    text = unescape(_TAG_RE.sub(" ", raw))
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text or None


def _normalize_store_url(store_url: str) -> str:
    store_url = store_url.strip()
    if not store_url.startswith("http"):
        store_url = f"https://{store_url}"
    parsed = urlparse(store_url)
    if not parsed.netloc:
        raise CatalogFetchError(f"'{store_url}' doesn't look like a valid store URL.")
    return f"{parsed.scheme}://{parsed.netloc}"


class ShopifySource:
    """Every Shopify storefront exposes a public /products.json feed by default
    (unless the merchant explicitly disables it) — this is a documented Shopify
    storefront feature, not scraping in the fragile-HTML-parsing sense."""

    def fetch_products(self, store_url: str, limit: int = 25) -> list[dict]:
        base = _normalize_store_url(store_url)
        url = f"{base}/products.json?limit={min(limit, 250)}"

        try:
            resp = requests.get(url, timeout=10, headers={"User-Agent": "Frontage-CatalogImport/1.0"})
        except requests.RequestException as exc:
            raise CatalogFetchError(f"Could not reach {base}: {exc}") from exc

        if resp.status_code != 200:
            raise CatalogFetchError(
                f"{base} returned HTTP {resp.status_code} for /products.json — it may not be a "
                "Shopify store, or this store has disabled its public product feed."
            )

        try:
            data = resp.json()
            raw_products = data["products"]
        except (ValueError, KeyError) as exc:
            raise CatalogFetchError(
                f"{base}/products.json didn't return the expected Shopify product feed shape."
            ) from exc

        if not raw_products:
            raise CatalogFetchError(f"{base}/products.json returned zero products.")

        return [self._normalize(p) for p in raw_products]

    def _normalize(self, product: dict) -> dict:
        variants = product.get("variants") or [{}]
        prices = [float(v["price"]) for v in variants if v.get("price") is not None]
        price = min(prices) if prices else 0.0
        any_in_stock = any(v.get("available") for v in variants)
        variant_info = self._extract_variant_info(product, variants)
        # More than one Shopify variant means this product genuinely has more than one
        # purchasable form (a real size/color/etc choice), regardless of whether we
        # managed to label it well. Exactly one variant is Shopify's own signal for a
        # single-SKU product -- nothing to disambiguate, not a data gap.
        has_variants = len(variants) > 1

        return {
            "name": product.get("title") or "Untitled product",
            "description": _strip_html(product.get("body_html")),
            "price": price,
            "availability": "in_stock" if any_in_stock else "out_of_stock",
            "variant_info": variant_info,
            "has_variants": has_variants,
        }

    def _extract_variant_info(self, product: dict, variants: list[dict]) -> dict | None:
        """Uses each product's own declared option names (Size, Color, Scent, Strap
        Material -- whatever the store actually calls it) instead of assuming every
        store's first variant dimension is "sizes"; a watch or perfume brand's
        variants rarely are."""
        options = product.get("options") or []
        variant_info = {}
        for position, option in enumerate(options, start=1):
            key = f"option{position}"
            name = (option.get("name") or key).strip().lower()
            values = sorted({v[key] for v in variants if v.get(key) and v[key] != _SINGLE_SKU_PLACEHOLDER})
            if values:
                variant_info[name] = values
        return variant_info or None
