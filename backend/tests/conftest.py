import pytest

from app.db import Base, _create_engine, _make_sessionmaker
from app import models  # noqa: F401 - registers all models on Base.metadata


@pytest.fixture
def db_session(tmp_path):
    """A fresh, isolated SQLite DB per test -- never the real dev.db. A temp file
    (not :memory:) so normal connection pooling works unmodified. Uses the same
    engine + session factories as production (including autoflush=False and
    foreign-key enforcement), not hand-rolled ones that could behave differently."""
    engine = _create_engine(f"sqlite:///{tmp_path / 'test.db'}")

    Base.metadata.create_all(bind=engine)
    session = _make_sessionmaker(engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def merchant(db_session):
    from app.models import Merchant

    m = Merchant(name="Test Merchant", catalog_source="test")
    db_session.add(m)
    db_session.flush()
    return m


@pytest.fixture
def catalog_item(db_session, merchant):
    from app.models import CatalogItem

    item = CatalogItem(
        merchant_id=merchant.id,
        name="Test Product",
        description="A perfectly adequate test product description.",
        price=500.0,
        currency="INR",
        availability="in_stock",
        variant_info=None,
        has_variants=False,
    )
    db_session.add(item)
    db_session.flush()
    return item


@pytest.fixture
def client(db_session):
    """A FastAPI TestClient wired to the isolated test DB instead of the real one."""
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mandate(db_session, merchant):
    from app.models import Mandate

    m = Mandate(
        merchant_id=None,
        spend_ceiling=1000.0,
        allow_listed_merchants=[merchant.id],
        created_by="test-setup",
    )
    db_session.add(m)
    db_session.flush()
    return m
