from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.catalog_import import import_store
from app.agents.catalog_sources import CatalogFetchError, SOURCES
from app.db import get_db
from app.schemas import ImportStoreIn

router = APIRouter(prefix="/import", tags=["import"])


@router.get("/sources")
def list_sources():
    return {"sources": list(SOURCES)}


@router.post("")
def do_import(body: ImportStoreIn, db: Session = Depends(get_db)):
    try:
        result = import_store(db, body.source, body.store_url, body.merchant_name, body.currency, body.limit)
    except CatalogFetchError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    return result
