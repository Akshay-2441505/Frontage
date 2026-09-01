from app.agents.catalog_sources.shopify import ShopifySource


def _product(**overrides):
    base = {
        "title": "Test Product",
        "body_html": "<p>A product.</p>",
        "options": [],
        "variants": [{"price": "100.00", "available": True}],
        "images": [],
    }
    base.update(overrides)
    return base


def test_normalize_extracts_first_image_url():
    product = _product(images=[{"src": "https://cdn.shopify.com/example.jpg"}, {"src": "https://cdn.shopify.com/other.jpg"}])
    normalized = ShopifySource()._normalize(product)
    assert normalized["image_url"] == "https://cdn.shopify.com/example.jpg"


def test_normalize_returns_none_when_no_images():
    product = _product(images=[])
    normalized = ShopifySource()._normalize(product)
    assert normalized["image_url"] is None


def test_normalize_extracts_all_image_urls():
    product = _product(images=[{"src": "https://cdn.shopify.com/example.jpg"}, {"src": "https://cdn.shopify.com/other.jpg"}])
    normalized = ShopifySource()._normalize(product)
    assert normalized["image_urls"] == [
        "https://cdn.shopify.com/example.jpg",
        "https://cdn.shopify.com/other.jpg",
    ]


def test_normalize_image_urls_is_none_when_no_images():
    product = _product(images=[])
    normalized = ShopifySource()._normalize(product)
    assert normalized["image_urls"] is None


def test_normalize_skips_images_missing_src():
    product = _product(images=[{"src": "https://cdn.shopify.com/a.jpg"}, {}, {"src": None}])
    normalized = ShopifySource()._normalize(product)
    assert normalized["image_urls"] == ["https://cdn.shopify.com/a.jpg"]
