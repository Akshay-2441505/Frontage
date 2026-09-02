from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.buyer import shop
from app.db import get_db
from app.models import Merchant
from app.schemas import ShoppingGoalIn

router = APIRouter(prefix="/buyer-agent", tags=["buyer"])


@router.post("/shop")
def buyer_shop(body: ShoppingGoalIn, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, body.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    history = [turn.model_dump() for turn in body.history]
    result = shop(db, merchant, body.goal, history=history)
    db.commit()
    return result
