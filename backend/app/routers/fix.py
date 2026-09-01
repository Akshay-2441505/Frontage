from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.fix import approve_item, generate_descriptions, publish_manifest
from app.agents.llm_client import LLMNotConfigured
from app.db import get_db
from app.models import CatalogItem, CatalogManifest, Merchant
from app.schemas import CatalogItemOut, CatalogManifestOut, PriceUpdateIn

router = APIRouter(tags=["fix"])


@router.post("/merchants/{merchant_id}/fix/generate-descriptions")
def fix_generate(merchant_id: str, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    try:
        result = generate_descriptions(db, merchant)
    except LLMNotConfigured as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.commit()
    return result


@router.post("/catalog-items/{item_id}/approve", response_model=CatalogItemOut)
def fix_approve(item_id: str, db: Session = Depends(get_db)):
    item = db.get(CatalogItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    approve_item(db, item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/catalog-items/{item_id}/price", response_model=CatalogItemOut)
def update_price(item_id: str, body: PriceUpdateIn, db: Session = Depends(get_db)):
    """Lets a merchant simulate a real-world price change on their own catalog --
    the only way price/availability drift (spec §9's other named failure case) can
    actually occur between a manifest being published and a purchase being attempted
    against it, since nothing else in the app can edit a catalog item after creation."""
    item = db.get(CatalogItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    item.price = body.price
    db.commit()
    db.refresh(item)
    return item


@router.post("/merchants/{merchant_id}/fix/publish", response_model=CatalogManifestOut)
def fix_publish(merchant_id: str, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    manifest = publish_manifest(db, merchant)
    db.commit()
    db.refresh(manifest)
    return manifest


@router.get("/merchants/{merchant_id}/manifest.json")
def get_manifest(merchant_id: str, db: Session = Depends(get_db)):
    """The actual agent-fetchable manifest: full structured product data, not just metadata."""
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    manifest = (
        db.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == merchant_id)
        .order_by(CatalogManifest.version.desc())
        .first()
    )
    if not manifest:
        raise HTTPException(status_code=404, detail="No manifest published yet for this merchant")

    items = db.query(CatalogItem).filter(CatalogItem.id.in_(manifest.item_ids)).all()
    return {
        "merchant_id": merchant.id,
        "merchant_name": merchant.name,
        "manifest_version": manifest.version,
        "generated_at": manifest.generated_at.isoformat(),
        "products": [
            {
                "id": i.id,
                "name": i.name,
                "description": i.description,
                "price": i.price,
                "currency": i.currency,
                "availability": i.availability,
                "variant_info": i.variant_info,
                "image_url": i.image_url,
                "image_urls": i.image_urls,
            }
            for i in items
        ],
    }
