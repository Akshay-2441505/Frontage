from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.agents.transact import _active_mandate
from app.db import get_db
from app.models import Mandate, Merchant
from app.schemas import MandateIn, MandateOut

router = APIRouter(prefix="/mandate", tags=["mandate"])


@router.get("", response_model=MandateOut)
def get_active_mandate(merchant_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    """Returns the mandate that would actually apply to a purchase right now: a
    merchant-specific mandate if one exists, else the global default -- same
    resolution the Transact Agent itself uses. Without merchant_id, falls back to
    whichever mandate was created most recently, for callers that just want *a*
    mandate to display."""
    if merchant_id:
        mandate = _active_mandate(db, merchant_id)
    else:
        mandate = db.query(Mandate).order_by(Mandate.created_at.desc()).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="No mandate configured yet")
    return mandate


@router.put("", response_model=MandateOut)
def set_mandate(body: MandateIn, db: Session = Depends(get_db)):
    """Human-set boundary — inserts a new mandate version rather than mutating in place,
    so the audit trail can always point back at the mandate active when a decision was made."""
    if body.merchant_id and not db.get(Merchant, body.merchant_id):
        raise HTTPException(status_code=422, detail=f"Merchant '{body.merchant_id}' does not exist.")
    for allowed_id in body.allow_listed_merchants:
        if not db.get(Merchant, allowed_id):
            raise HTTPException(status_code=422, detail=f"Merchant '{allowed_id}' does not exist.")

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
