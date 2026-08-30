import datetime

from pydantic import BaseModel, ConfigDict, Field


class CatalogItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    name: str
    description: str | None
    price: float
    currency: str
    availability: str | None
    variant_info: dict | None
    has_variants: bool
    agent_readable: bool
    source: str


class PriceUpdateIn(BaseModel):
    price: float = Field(gt=0)


class MerchantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    razorpay_account_ref: str | None
    catalog_source: str


class GapOut(BaseModel):
    check_name: str
    status: str  # "pass" | "fail"
    detail: str


class DiagnosticReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    timestamp: datetime.datetime
    score: float
    gaps: list[GapOut]


class CatalogManifestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    version: int
    generated_at: datetime.datetime
    url: str
    item_ids: list[str]


class MandateIn(BaseModel):
    merchant_id: str | None = None
    spend_ceiling: float = Field(gt=0)
    allow_listed_merchants: list[str] = []
    created_by: str = "demo-user"


class MandateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str | None
    spend_ceiling: float
    allow_listed_merchants: list[str]
    created_by: str
    created_at: datetime.datetime


class AgentActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_name: str
    merchant_id: str | None
    timestamp: datetime.datetime
    reasoning: str
    action_taken: str
    input: dict | None
    output: dict | None
    result: str
    mandate_id: str | None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    catalog_item_id: str
    amount: float
    razorpay_order_id: str | None
    razorpay_payment_link_id: str | None
    status: str
    agent_action_id: str | None
    created_at: datetime.datetime


class PurchaseRequestIn(BaseModel):
    catalog_item_id: str
    requested_amount: float
    buyer_goal: str | None = None


class ImportStoreIn(BaseModel):
    store_url: str
    merchant_name: str
    source: str = "shopify"
    currency: str = "INR"
    limit: int = 25


class ShoppingGoalIn(BaseModel):
    merchant_id: str
    goal: str
