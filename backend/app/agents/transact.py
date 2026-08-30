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

Beyond the gates, two more failure modes are handled deliberately (the spec's other
named failure option, §9: "Razorpay API failure/timeout... retries within a bounded
limit, then fails closed"):
- transient Razorpay/network errors are retried a bounded number of times with a
  short backoff, then fail closed -- never a silent infinite retry loop
- a validation error (e.g. amount too large) is never retried, since retrying a
  request that's deterministically invalid just wastes time before failing anyway
"""
import logging
import time

import requests
from razorpay.errors import GatewayError, ServerError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.razorpay_client import get_client
from app.models import AgentAction, AgentResult, CatalogItem, Mandate, Transaction, TransactionStatus

logger = logging.getLogger(__name__)

PRICE_TOLERANCE = 0.01

MAX_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 0.5
# ServerError/GatewayError are Razorpay's own transient-side failures; connection/timeout
# errors are transport-level. A BadRequestError (bad amount, bad currency, etc.) is a
# validation failure that will fail identically every time, so it's deliberately NOT here.
RETRYABLE_EXCEPTIONS = (ServerError, GatewayError, requests.exceptions.ConnectionError, requests.exceptions.Timeout)


def _call_with_retry(fn):
    """Calls fn() up to MAX_ATTEMPTS times, retrying only on RETRYABLE_EXCEPTIONS with a
    short linear backoff. Returns (result, attempts_used). Raises the last exception
    (retryable or not) once attempts are exhausted -- never retries forever."""
    last_exc = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn(), attempt
        except RETRYABLE_EXCEPTIONS as exc:
            last_exc = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    raise last_exc


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


def _cumulative_spend(db: Session, mandate_id: str) -> float:
    """Total already spent under this specific mandate version -- scoped to the
    mandate's id, not the merchant, so raising the ceiling (which inserts a new
    mandate row) naturally starts a fresh budget rather than carrying old spend
    forward forever."""
    total = (
        db.query(func.sum(Transaction.amount))
        .join(AgentAction, Transaction.agent_action_id == AgentAction.id)
        .filter(AgentAction.mandate_id == mandate_id, AgentAction.result == AgentResult.success)
        .scalar()
    )
    return total or 0.0


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

    already_spent = _cumulative_spend(db, mandate.id)
    if already_spent + requested_amount > mandate.spend_ceiling:
        return _blocked(
            db, merchant.id, requester,
            f"Requested ₹{requested_amount:g} plus ₹{already_spent:g} already spent under this "
            f"mandate would exceed its ceiling of ₹{mandate.spend_ceiling:g}.",
            "Checked requested amount plus cumulative spend against mandate spend ceiling.", input_data, mandate.id,
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
    except Exception as exc:  # noqa: BLE001 - e.g. RazorpayNotConfigured; never retryable
        action = AgentAction(
            agent_name="Transact",
            merchant_id=merchant.id,
            reasoning=f"All mandate checks passed, but the Razorpay client could not be created: {exc}",
            action_taken="Attempted to create a Razorpay client.",
            input=input_data,
            output=None,
            result=AgentResult.failed,
            mandate_id=mandate.id,
        )
        db.add(action)
        db.flush()
        return {"status": "failed", "reason": str(exc), "agent_action_id": action.id}

    try:
        order, order_attempts = _call_with_retry(
            lambda: client.order.create(
                {
                    "amount": amount_paise,
                    "currency": item.currency,
                    "receipt": f"frontage-{item.id[:8]}",
                    "notes": {"merchant_id": merchant.id, "catalog_item_id": item.id, "requester": requester},
                }
            )
        )
    except Exception as exc:  # noqa: BLE001 - fail closed after retries (if any) are exhausted
        action = AgentAction(
            agent_name="Transact",
            merchant_id=merchant.id,
            reasoning=f"All mandate checks passed, but creating the Razorpay order failed: {exc}",
            action_taken="Attempted to create a Razorpay test-mode order (with bounded retry on transient errors).",
            input=input_data,
            output=None,
            result=AgentResult.failed,
            mandate_id=mandate.id,
        )
        db.add(action)
        db.flush()
        return {"status": "failed", "reason": str(exc), "agent_action_id": action.id}

    # The order is now real and valid regardless of what happens next -- a payment link is
    # a convenience artifact, not the authoritative record of the purchase. Razorpay's
    # Payment Links API has a lower maximum amount than Orders (~INR 75k vs 5,00,000 on
    # this account), so a large-but-legitimate order can outrun it; that's not a reason to
    # report the whole purchase as failed when the order itself succeeded.
    payment_link = None
    payment_link_error = None
    link_attempts = 1
    try:
        payment_link, link_attempts = _call_with_retry(
            lambda: client.payment_link.create(
                {
                    "amount": amount_paise,
                    "currency": item.currency,
                    "description": _razorpay_safe_text(f"{merchant.name}: {item.name}"),
                    "notes": {"order_id": order["id"], "catalog_item_id": item.id},
                }
            )
        )
    except Exception as exc:  # noqa: BLE001 - degrade to order-only, don't fail the purchase
        payment_link_error = str(exc)

    # From here on, a real Razorpay order already exists -- nothing below may raise
    # uncaught. If our own bookkeeping fails, the caller must still learn the real
    # order id rather than getting a raw 500 with no trace of money-adjacent state
    # that now exists on Razorpay's side.
    try:
        transaction = Transaction(
            merchant_id=merchant.id,
            catalog_item_id=item.id,
            amount=item.price,
            razorpay_order_id=order["id"],
            razorpay_payment_link_id=payment_link["id"] if payment_link else None,
            status=TransactionStatus.created,
        )
        db.add(transaction)
        db.flush()

        reasoning = (
            f"All mandate checks passed for {item.name} at ₹{item.price:g} "
            f"(ceiling ₹{mandate.spend_ceiling:g}). "
        )
        if order_attempts > 1:
            reasoning += f"Order creation needed {order_attempts} attempts after transient Razorpay errors. "
        reasoning += f"Created Razorpay test-mode order {order['id']}. "
        if payment_link:
            reasoning += f"Created payment link {payment_link['id']}"
            reasoning += f" (needed {link_attempts} attempts)." if link_attempts > 1 else "."
        else:
            reasoning += (
                f"Could not create a payment link ({payment_link_error}) — the order itself is "
                "still valid and was not affected."
            )

        action = AgentAction(
            agent_name="Transact",
            merchant_id=merchant.id,
            reasoning=reasoning,
            action_taken="Created Razorpay test-mode order" + (" and payment link." if payment_link else "; payment link creation failed."),
            input=input_data,
            output={
                "order_id": order["id"],
                "payment_link_id": payment_link["id"] if payment_link else None,
                "payment_link_url": payment_link.get("short_url") if payment_link else None,
                "payment_link_error": payment_link_error,
            },
            result=AgentResult.success,
            mandate_id=mandate.id,
        )
        db.add(action)
        db.flush()

        transaction.agent_action_id = action.id
        db.flush()  # without this, agent_action_id stays unpersisted until the caller's
        # eventual commit -- fine for a single request, but invisible to any query (like
        # cumulative spend) issued against the DB before that commit happens

        return {
            "status": "success",
            "transaction_id": transaction.id,
            "razorpay_order_id": order["id"],
            "razorpay_payment_link_id": payment_link["id"] if payment_link else None,
            "payment_link_url": payment_link.get("short_url") if payment_link else None,
            "payment_link_error": payment_link_error,
            "agent_action_id": action.id,
        }
    except Exception as exc:  # noqa: BLE001 - the Razorpay order already succeeded; never lose that
        logger.error(
            "Bookkeeping failed after a successful Razorpay order %s for merchant %s: %s",
            order["id"], merchant.id, exc,
        )
        try:
            db.rollback()
        except Exception:  # noqa: BLE001 - best effort; the order id below is what matters most
            pass
        return {
            "status": "success",
            "transaction_id": None,
            "razorpay_order_id": order["id"],
            "razorpay_payment_link_id": payment_link["id"] if payment_link else None,
            "payment_link_url": payment_link.get("short_url") if payment_link else None,
            "payment_link_error": payment_link_error,
            "agent_action_id": None,
            "local_record_error": str(exc),
        }
