from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.transact import attempt_purchase, check_transaction_status
from app.db import get_db
from app.schemas import PurchaseRequestIn

router = APIRouter(prefix="/transact", tags=["transact"])


@router.post("/purchase")
def purchase(body: PurchaseRequestIn, db: Session = Depends(get_db)):
    try:
        result = attempt_purchase(db, body.catalog_item_id, body.requested_amount)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.commit()
    return result


@router.get("/{transaction_id}/status")
def get_transaction_status(transaction_id: str, db: Session = Depends(get_db)):
    try:
        result = check_transaction_status(db, transaction_id)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.commit()
    return result
