import socket
from unittest.mock import patch

import pytest

from app.agents.catalog_sources.base import CatalogFetchError
from app.agents.catalog_sources.shopify import ShopifySource, normalize_store_url


def _fake_addrinfo(ip: str):
    # Shape socket.getaddrinfo actually returns: a list of
    # (family, type, proto, canonname, sockaddr) tuples -- only sockaddr[0] (the ip)
    # is read by the code under test, so the rest are innocuous placeholders.
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


def test_normalize_store_url_allows_a_public_address():
    with patch("socket.getaddrinfo", return_value=_fake_addrinfo("93.184.216.34")):
        assert normalize_store_url("example.com") == "https://example.com"


def test_normalize_store_url_rejects_loopback():
    with patch("socket.getaddrinfo", return_value=_fake_addrinfo("127.0.0.1")):
        with pytest.raises(CatalogFetchError):
            normalize_store_url("localhost")


def test_normalize_store_url_rejects_private_network_ranges():
    with patch("socket.getaddrinfo", return_value=_fake_addrinfo("10.0.0.5")):
        with pytest.raises(CatalogFetchError):
            normalize_store_url("internal.example.com")


def test_normalize_store_url_rejects_the_cloud_metadata_address():
    # 169.254.169.254 -- the AWS/GCP/Azure instance-metadata endpoint, the classic
    # SSRF target this check exists to close off.
    with patch("socket.getaddrinfo", return_value=_fake_addrinfo("169.254.169.254")):
        with pytest.raises(CatalogFetchError):
            normalize_store_url("169.254.169.254")


def test_normalize_store_url_rejects_unresolvable_hosts():
    with patch("socket.getaddrinfo", side_effect=socket.gaierror("Name or service not known")):
        with pytest.raises(CatalogFetchError):
            normalize_store_url("this-does-not-exist.invalid")


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
