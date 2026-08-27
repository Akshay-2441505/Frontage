from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CatalogItem, Merchant
from app.schemas import CatalogItemOut, MerchantOut

router = APIRouter(prefix="/merchants", tags=["merchants"])


@router.get("", response_model=list[MerchantOut])
def list_merchants(db: Session = Depends(get_db)):
    return db.query(Merchant).all()


@router.get("/{merchant_id}", response_model=MerchantOut)
def get_merchant(merchant_id: str, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return merchant


@router.get("/{merchant_id}/catalog", response_model=list[CatalogItemOut])
def get_catalog(merchant_id: str, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return db.query(CatalogItem).filter(CatalogItem.merchant_id == merchant_id).all()
