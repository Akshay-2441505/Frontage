from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def _create_engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)

    if url.startswith("sqlite"):
        # SQLite ignores declared ForeignKey constraints unless explicitly told to
        # enforce them per connection -- without this, an invalid merchant_id/
        # catalog_item_id reference is silently accepted instead of raising.
        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def _make_sessionmaker(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


engine = _create_engine(settings.database_url)
SessionLocal = _make_sessionmaker(engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
