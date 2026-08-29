"""Simulated Buyer Agent: stands in for a real third-party shopping agent
(ChatGPT, Gemini, etc). Fetches the published manifest, reasons over it with
an LLM to pick a matching product, then hands off to the Transact Agent —
which is the only thing allowed to touch money, and applies its own mandate
gates regardless of what the Buyer Agent asked for.
"""
import json

from sqlalchemy.orm import Session

from app.agents.llm_client import REASONING_MODEL, get_client
from app.agents.transact import attempt_purchase
from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, Merchant

SYSTEM_PROMPT = (
    "You are a shopping agent choosing at most one product from a merchant's catalog "
    "manifest to satisfy a buyer's goal. Respond with ONLY a JSON object, no other text: "
    '{"selected_item_id": "<id>", "reasoning": "<one sentence>"} if a product matches, or '
    '{"selected_item_id": null, "reasoning": "<one sentence explaining why nothing matches>"} '
    "if nothing in the catalog satisfies the goal. Never invent a product id that isn't in "
    "the manifest."
)


DESCRIPTION_PROMPT_CHARS = 150  # keep the LLM prompt small -- a full manifest of real
# products (long real descriptions, variant lists, pretty-printed) can push a bigger
# catalog well past Groq's free-tier per-request token limit; the full data still goes
# back to the caller for display, just not into the prompt.


def _compact_for_prompt(products: list[dict]) -> list[dict]:
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "description": (p["description"] or "")[:DESCRIPTION_PROMPT_CHARS],
            "price": p["price"],
            "currency": p["currency"],
            "availability": p["availability"],
        }
        for p in products
    ]


def _manifest_products(db: Session, merchant: Merchant) -> list[dict]:
    manifest = (
        db.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == merchant.id)
        .order_by(CatalogManifest.version.desc())
        .first()
    )
    if not manifest:
        return []
    items = db.query(CatalogItem).filter(CatalogItem.id.in_(manifest.item_ids)).all()
    return [
        {
            "id": i.id,
            "name": i.name,
            "description": i.description,
            "price": i.price,
            "currency": i.currency,
            "availability": i.availability,
            "variant_info": i.variant_info,
        }
        for i in items
    ]


def shop(db: Session, merchant: Merchant, goal: str) -> dict:
    products = _manifest_products(db, merchant)
    if not products:
        action = AgentAction(
            agent_name="BuyerAgent",
            merchant_id=merchant.id,
            reasoning=f"No published manifest available for {merchant.name} — nothing to shop from.",
            action_taken="Attempted to fetch the catalog manifest.",
            input={"merchant_id": merchant.id, "goal": goal},
            output=None,
            result=AgentResult.failed,
        )
        db.add(action)
        db.flush()
        return {"status": "no_manifest", "agent_action_id": action.id}

    try:
        client = get_client()
        completion = client.chat.completions.create(
            model=REASONING_MODEL,
            max_tokens=600,
            reasoning_effort="low",  # gpt-oss models spend tokens on hidden reasoning by default
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Shopping goal: {goal}\n\nCatalog manifest:\n"
                        f"{json.dumps(_compact_for_prompt(products), separators=(',', ':'))}"
                    ),
                },
            ],
        )
        raw = completion.choices[0].message.content.strip()
        parsed = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - fail closed if the LLM call/parse fails
        action = AgentAction(
            agent_name="BuyerAgent",
            merchant_id=merchant.id,
            reasoning=f"Could not reason over the manifest for goal '{goal}': {exc}",
            action_taken="Called the LLM to select a product from the manifest.",
            input={"merchant_id": merchant.id, "goal": goal},
            output=None,
            result=AgentResult.failed,
        )
        db.add(action)
        db.flush()
        return {"status": "failed", "reason": str(exc), "agent_action_id": action.id}

    selected_id = parsed.get("selected_item_id")
    buyer_reasoning = parsed.get("reasoning", "")

    if not selected_id:
        action = AgentAction(
            agent_name="BuyerAgent",
            merchant_id=merchant.id,
            reasoning=buyer_reasoning or f"No product in the manifest satisfies: {goal}",
            action_taken="Reasoned over the manifest and found no match.",
            input={"merchant_id": merchant.id, "goal": goal},
            output={"products_considered": len(products)},
            result=AgentResult.failed,
        )
        db.add(action)
        db.flush()
        return {"status": "no_match", "reasoning": buyer_reasoning, "agent_action_id": action.id}

    selected = next((p for p in products if p["id"] == selected_id), None)
    if not selected:
        action = AgentAction(
            agent_name="BuyerAgent",
            merchant_id=merchant.id,
            reasoning=f"The LLM selected item id {selected_id}, which is not in the manifest — refusing to proceed.",
            action_taken="Validated selected product id against the manifest.",
            input={"merchant_id": merchant.id, "goal": goal},
            output={"selected_item_id": selected_id},
            result=AgentResult.failed,
        )
        db.add(action)
        db.flush()
        return {"status": "invalid_selection", "agent_action_id": action.id}

    action = AgentAction(
        agent_name="BuyerAgent",
        merchant_id=merchant.id,
        reasoning=f"For goal '{goal}': {buyer_reasoning}",
        action_taken=f"Selected {selected['name']} (₹{selected['price']:g}) from the manifest and requested purchase.",
        input={"merchant_id": merchant.id, "goal": goal},
        output={"selected_item_id": selected_id},
        result=AgentResult.success,
    )
    db.add(action)
    db.flush()

    purchase_result = attempt_purchase(db, selected_id, selected["price"], requester="BuyerAgent")

    return {
        "status": "purchase_attempted",
        "goal": goal,
        "selected_product": selected,
        "buyer_reasoning": buyer_reasoning,
        "buyer_agent_action_id": action.id,
        "purchase_result": purchase_result,
    }
