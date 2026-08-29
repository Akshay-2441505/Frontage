"""Transact Agent: the money-path agent. Every call either completes a bounded,
gated, explainable purchase, or fails closed with a clear logged reason before
any Razorpay call is made — never a silent no-op, never a partial charge.

Gate order (checked in this sequence, first failure wins):
1. a mandate exists for this merchant
2. merchant is allow-listed under that mandate
3. requested amount <= mandate spend ceiling  (the deliberate failure case, §9)
4. requested amount matches the item's current catalog price (price/availability drift)
5. item is in stock
Only if all five pass does Razorpay get called.
"""
from sqlalchemy.orm import Session

from app.agents.razorpay_client import get_client
from app.models import AgentAction, AgentResult, CatalogItem, Mandate, Transaction, TransactionStatus

PRICE_TOLERANCE = 0.01


def _razorpay_safe_text(text: str) -> str:
    """Razorpay's backend rejects characters outside the Basic Multilingual Plane
    (most emoji, some symbols) in free-text fields like a payment link description --
    a real MySQL utf8mb3/utf8mb4 collation mismatch on their end, not ours. Real
    merchant-authored product names (e.g. imported from a live store) can contain
    these, so strip anything outside the BMP rather than let the whole purchase fail."""
    return "".join(ch for ch in text if ord(ch) <= 0xFFFF).strip()


def _active_mandate(db: Session, merchant_id: str) -> Mandate | None:
    specific = (
        db.query(Mandate)
        .filter(Mandate.merchant_id == merchant_id)
        .order_by(Mandate.created_at.desc())
        .first()
    )
    if specific:
        return specific
    return db.query(Mandate).filter(Mandate.merchant_id.is_(None)).order_by(Mandate.created_at.desc()).first()


def _blocked(db: Session, merchant_id: str, requester: str, reasoning: str, action_taken: str, input_data: dict, mandate_id: str | None = None) -> dict:
    action = AgentAction(
        agent_name="Transact",
        merchant_id=merchant_id,
        reasoning=reasoning,
        action_taken=action_taken,
        input=input_data,
        output=None,
        result=AgentResult.blocked,
        mandate_id=mandate_id,
    )
    db.add(action)
    db.flush()
    return {"status": "blocked", "reason": reasoning, "agent_action_id": action.id}


def attempt_purchase(db: Session, catalog_item_id: str, requested_amount: float, requester: str = "BuyerAgent") -> dict:
    item = db.get(CatalogItem, catalog_item_id)
    if not item:
        raise ValueError("Catalog item not found")
    merchant = item.merchant

    input_data = {
        "catalog_item_id": catalog_item_id,
        "requested_amount": requested_amount,
        "requester": requester,
    }

    mandate = _active_mandate(db, merchant.id)
    if not mandate:
        return _blocked(
            db, merchant.id, requester,
            f"No mandate is configured for {merchant.name} — refusing to transact without a "
            "human-set spend boundary.",
            "Checked for an active mandate.", input_data,
        )

    if merchant.id not in (mandate.allow_listed_merchants or []):
        return _blocked(
            db, merchant.id, requester,
            f"{merchant.name} is not on the mandate's allow-list — refusing to transact with "
            "a merchant the human hasn't pre-approved.",
            "Checked merchant against mandate allow-list.", input_data, mandate.id,
        )

    if requested_amount > mandate.spend_ceiling:
        return _blocked(
            db, merchant.id, requester,
            f"Requested ₹{requested_amount:g} exceeds mandate ceiling of ₹{mandate.spend_ceiling:g}.",
            "Checked requested amount against mandate spend ceiling.", input_data, mandate.id,
        )

    if abs(requested_amount - item.price) > PRICE_TOLERANCE:
        return _blocked(
            db, merchant.id, requester,
            f"Price mismatch: buyer agent expected ₹{requested_amount:g} but the current "
            f"catalog price for {item.name} is ₹{item.price:g}. Halting before charging the "
            "stale price.",
            "Compared requested amount against live catalog price.", input_data, mandate.id,
        )

    if item.availability == "out_of_stock":
        return _blocked(
            db, merchant.id, requester,
            f"{item.name} is out of stock — refusing to create an order for unavailable inventory.",
            "Checked item availability.", input_data, mandate.id,
        )

    amount_paise = int(round(item.price * 100))
    try:
        client = get_client()
        order = client.order.create(
            {
                "amount": amount_paise,
                "currency": item.currency,
                "receipt": f"frontage-{item.id[:8]}",
                "notes": {"merchant_id": merchant.id, "catalog_item_id": item.id, "requester": requester},
            }
        )
        payment_link = client.payment_link.create(
            {
                "amount": amount_paise,
                "currency": item.currency,
                "description": _razorpay_safe_text(f"{merchant.name}: {item.name}"),
                "notes": {"order_id": order["id"], "catalog_item_id": item.id},
            }
        )
    except Exception as exc:  # noqa: BLE001 - fail closed on any Razorpay error (incl. not configured)
        action = AgentAction(
            agent_name="Transact",
            merchant_id=merchant.id,
            reasoning=f"All mandate checks passed, but the Razorpay call failed: {exc}",
            action_taken="Attempted to create a Razorpay test-mode order.",
            input=input_data,
            output=None,
            result=AgentResult.failed,
            mandate_id=mandate.id,
        )
        db.add(action)
        db.flush()
        return {"status": "failed", "reason": str(exc), "agent_action_id": action.id}

    transaction = Transaction(
        merchant_id=merchant.id,
        catalog_item_id=item.id,
        amount=item.price,
        razorpay_order_id=order["id"],
        razorpay_payment_link_id=payment_link["id"],
        status=TransactionStatus.created,
    )
    db.add(transaction)
    db.flush()

    action = AgentAction(
        agent_name="Transact",
        merchant_id=merchant.id,
        reasoning=(
            f"All mandate checks passed for {item.name} at ₹{item.price:g} "
            f"(ceiling ₹{mandate.spend_ceiling:g}). Created Razorpay test-mode order "
            f"{order['id']} and payment link {payment_link['id']}."
        ),
        action_taken="Created Razorpay test-mode order and payment link.",
        input=input_data,
        output={"order_id": order["id"], "payment_link_id": payment_link["id"], "payment_link_url": payment_link.get("short_url")},
        result=AgentResult.success,
        mandate_id=mandate.id,
    )
    db.add(action)
    db.flush()

    transaction.agent_action_id = action.id

    return {
        "status": "success",
        "transaction_id": transaction.id,
        "razorpay_order_id": order["id"],
        "razorpay_payment_link_id": payment_link["id"],
        "payment_link_url": payment_link.get("short_url"),
        "agent_action_id": action.id,
    }
