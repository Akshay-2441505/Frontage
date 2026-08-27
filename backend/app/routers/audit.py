from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AgentAction
from app.schemas import AgentActionOut

router = APIRouter(prefix="/audit-log", tags=["audit"])


@router.get("", response_model=list[AgentActionOut])
def list_actions(merchant_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    q = db.query(AgentAction)
    if merchant_id:
        q = q.filter(AgentAction.merchant_id == merchant_id)
    return q.order_by(AgentAction.timestamp.desc()).limit(200).all()
