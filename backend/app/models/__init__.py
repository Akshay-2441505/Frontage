import datetime
import enum
import uuid

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime.datetime:
    return datetime.datetime.utcnow()


class ItemSource(str, enum.Enum):
    manual = "manual"
    generated = "generated"


class AgentResult(str, enum.Enum):
    success = "success"
    blocked = "blocked"
    failed = "failed"


class TransactionStatus(str, enum.Enum):
    created = "created"
    paid = "paid"
    failed = "failed"


class Merchant(Base):
    __tablename__ = "merchants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    razorpay_account_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    catalog_source: Mapped[str] = mapped_column(String, default="seed")

    catalog_items: Mapped[list["CatalogItem"]] = relationship(back_populates="merchant", cascade="all, delete-orphan")


class CatalogItem(Base):
    __tablename__ = "catalog_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String, default="INR")
    availability: Mapped[str | None] = mapped_column(String, nullable=True)  # "in_stock" | "out_of_stock" | None (ambiguous)
    variant_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    agent_readable: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[ItemSource] = mapped_column(Enum(ItemSource), default=ItemSource.manual)

    merchant: Mapped["Merchant"] = relationship(back_populates="catalog_items")


class DiagnosticReport(Base):
    __tablename__ = "diagnostic_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), nullable=False)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    gaps: Mapped[list] = mapped_column(JSON, default=list)  # [{check_name, status, detail}]


class CatalogManifest(Base):
    __tablename__ = "catalog_manifests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    generated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
    url: Mapped[str] = mapped_column(String, nullable=False)
    item_ids: Mapped[list] = mapped_column(JSON, default=list)


class Mandate(Base):
    __tablename__ = "mandates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    merchant_id: Mapped[str | None] = mapped_column(ForeignKey("merchants.id"), nullable=True)
    spend_ceiling: Mapped[float] = mapped_column(Float, nullable=False)
    allow_listed_merchants: Mapped[list] = mapped_column(JSON, default=list)  # list of merchant_id
    created_by: Mapped[str] = mapped_column(String, default="demo-user")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class AgentAction(Base):
    __tablename__ = "agent_actions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    agent_name: Mapped[str] = mapped_column(String, nullable=False)  # Diagnose | Fix | Transact | BuyerAgent
    merchant_id: Mapped[str | None] = mapped_column(ForeignKey("merchants.id"), nullable=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
    reasoning: Mapped[str] = mapped_column(String, nullable=False)
    action_taken: Mapped[str] = mapped_column(String, nullable=False)
    input: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result: Mapped[AgentResult] = mapped_column(Enum(AgentResult), nullable=False)
    mandate_id: Mapped[str | None] = mapped_column(ForeignKey("mandates.id"), nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), nullable=False)
    catalog_item_id: Mapped[str] = mapped_column(ForeignKey("catalog_items.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    razorpay_order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    razorpay_payment_link_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.created)
    agent_action_id: Mapped[str | None] = mapped_column(ForeignKey("agent_actions.id"), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
