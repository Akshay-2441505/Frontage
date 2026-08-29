from typing import Protocol


class CatalogFetchError(RuntimeError):
    """Raised when a real store's catalog can't be fetched or parsed. Callers
    must surface this as a clear, bounded failure — never fall back to
    guessing at fragile HTML scraping."""


class CatalogSource(Protocol):
    def fetch_products(self, store_url: str, limit: int) -> list[dict]:
        """Return a list of normalized product dicts (see package docstring),
        or raise CatalogFetchError with a clear reason."""
        ...
