from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.diagnose import run_diagnose
from app.db import get_db
from app.models import DiagnosticReport, Merchant
from app.schemas import DiagnosticReportOut

router = APIRouter(prefix="/merchants", tags=["diagnose"])


@router.post("/{merchant_id}/diagnose", response_model=DiagnosticReportOut)
def diagnose(merchant_id: str, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    result = run_diagnose(db, merchant)
    report = DiagnosticReport(merchant_id=merchant.id, score=result["score"], gaps=result["gaps"])
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/{merchant_id}/diagnose/latest", response_model=DiagnosticReportOut)
def latest_diagnosis(merchant_id: str, db: Session = Depends(get_db)):
    report = (
        db.query(DiagnosticReport)
        .filter(DiagnosticReport.merchant_id == merchant_id)
        .order_by(DiagnosticReport.timestamp.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No diagnostic report yet — run POST /diagnose first")
    return report


@router.get("/{merchant_id}/diagnose/history", response_model=list[DiagnosticReportOut])
def diagnosis_history(merchant_id: str, db: Session = Depends(get_db)):
    return (
        db.query(DiagnosticReport)
        .filter(DiagnosticReport.merchant_id == merchant_id)
        .order_by(DiagnosticReport.timestamp.asc())
        .all()
    )
