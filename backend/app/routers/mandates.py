from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Mandate
from app.schemas import MandateIn, MandateOut

router = APIRouter(prefix="/mandate", tags=["mandate"])


@router.get("", response_model=MandateOut)
def get_active_mandate(db: Session = Depends(get_db)):
    mandate = db.query(Mandate).order_by(Mandate.created_at.desc()).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="No mandate configured yet")
    return mandate


@router.put("", response_model=MandateOut)
def set_mandate(body: MandateIn, db: Session = Depends(get_db)):
    """Human-set boundary — inserts a new mandate version rather than mutating in place,
    so the audit trail can always point back at the mandate active when a decision was made."""
    mandate = Mandate(
        merchant_id=body.merchant_id,
        spend_ceiling=body.spend_ceiling,
        allow_listed_merchants=body.allow_listed_merchants,
        created_by=body.created_by,
    )
    db.add(mandate)
    db.commit()
    db.refresh(mandate)
    return mandate
