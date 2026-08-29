import re
from html import unescape
from urllib.parse import urlparse

import requests

from app.agents.catalog_sources.base import CatalogFetchError

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


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

        sizes = sorted({v["option1"] for v in variants if v.get("option1")})
        variant_info = {"sizes": sizes} if sizes else None

        return {
            "name": product.get("title") or "Untitled product",
            "description": _strip_html(product.get("body_html")),
            "price": price,
            "availability": "in_stock" if any_in_stock else "out_of_stock",
            "variant_info": variant_info,
        }
