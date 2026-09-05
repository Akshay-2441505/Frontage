from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import parse_cors_origins, settings
from app.db import Base, engine
from app import models  # noqa: F401 - ensures models are registered before create_all
from app.routers import audit, buyer, diagnose, fix, import_store, mandates, merchants, transact

app = FastAPI(title="Frontage API")
app.include_router(merchants.router)
app.include_router(diagnose.router)
app.include_router(fix.router)
app.include_router(mandates.router)
app.include_router(transact.router)
app.include_router(audit.router)
app.include_router(buyer.router)
app.include_router(import_store.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(settings.cors_allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
