import pytest
from sqlalchemy.exc import IntegrityError


def test_sqlite_engine_enforces_foreign_keys(tmp_path):
    from app.db import _create_engine

    db_path = tmp_path / "fk_test.db"
    engine = _create_engine(f"sqlite:///{db_path}")

    with engine.connect() as conn:
        fk_status = conn.exec_driver_sql("PRAGMA foreign_keys").scalar()

    assert fk_status == 1, "SQLite foreign_keys pragma should be ON for every new connection"


def test_mandate_with_nonexistent_merchant_id_is_rejected(db_session):
    from app.models import Mandate

    bad_mandate = Mandate(
        merchant_id="this-merchant-does-not-exist",
        spend_ceiling=1000.0,
        allow_listed_merchants=[],
        created_by="test",
    )
    db_session.add(bad_mandate)
    with pytest.raises(IntegrityError):
        db_session.flush()
