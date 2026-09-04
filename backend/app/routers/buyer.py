from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.buyer import _all_discoverable_products, discover, shop
from app.db import get_db
from app.models import Merchant
from app.schemas import DiscoverGoalIn, ShoppingGoalIn

router = APIRouter(prefix="/buyer-agent", tags=["buyer"])


@router.post("/shop")
def buyer_shop(body: ShoppingGoalIn, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, body.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    history = [turn.model_dump() for turn in body.history]
    result = shop(db, merchant, body.goal, history=history, dry_run=body.dry_run)
    db.commit()
    return result


@router.post("/discover")
def buyer_discover(body: DiscoverGoalIn, db: Session = Depends(get_db)):
    history = [turn.model_dump() for turn in body.history]
    result = discover(db, body.goal, history=history)
    db.commit()
    return result


@router.get("/reach")
def buyer_reach(db: Session = Depends(get_db)):
    """How much of the market Otto can actually read, right now.

    Counted from `_all_discoverable_products` -- the identical set `discover()`
    searches -- rather than from the merchant table, so the hero's claim and the
    funnel's first number can never disagree. A store that has connected but not
    published a manifest is not reachable and is not counted.
    """
    products = _all_discoverable_products(db)
    return {
        "products": len(products),
        "stores": len({p["merchant_id"] for p in products if p.get("merchant_id")}),
    }
