"""Simulated Buyer Agent: stands in for a real third-party shopping agent
(ChatGPT, Gemini, etc). Fetches the published manifest, reasons over it with
an LLM to pick a matching product, then hands off to the Transact Agent —
which is the only thing allowed to touch money, and applies its own mandate
gates regardless of what the Buyer Agent asked for.

A goal can land in one of three buckets, not just match/no-match: it can also
be genuinely ambiguous (e.g. "X Lows" matching 9 different colorways of the
same shoe) — in which case the agent must not silently guess one, it should
say so and surface the candidates.
"""
import json

from sqlalchemy.orm import Session

from app.agents.llm_client import REASONING_MODEL, get_client
from app.agents.transact import attempt_purchase
from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, Merchant

SYSTEM_PROMPT = (
    "You are a shopping agent choosing a product from a merchant's catalog manifest to "
    "satisfy a buyer's goal. Respond with ONLY a JSON object, no other text, in exactly one "
    "of these three shapes:\n"
    '- Exactly one product clearly satisfies the goal: '
    '{"status": "match", "selected_item_id": "<id>", "reasoning": "<one sentence>"}\n'
    "- The goal is too vague and multiple different products satisfy it about equally well "
    "(e.g. the goal names a style/collection/line but not which specific variant): "
    '{"status": "ambiguous", "candidate_ids": ["<id>", "<id>", ...], '
    '"reasoning": "<one sentence explaining what needs to be narrowed down>"} '
    "(list at most 6 candidates)\n"
    "- Nothing in the catalog satisfies the goal: "
    '{"status": "no_match", "reasoning": "<one sentence>"}\n'
    "Never invent a product id that isn't in the manifest. Prefer \"match\" only when you're "
    "confident the goal picks out one specific product, not a family of them."
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


def _log(db: Session, merchant_id: str, goal: str, reasoning: str, action_taken: str, result: AgentResult, output: dict | None = None) -> AgentAction:
    action = AgentAction(
        agent_name="BuyerAgent",
        merchant_id=merchant_id,
        reasoning=reasoning,
        action_taken=action_taken,
        input={"merchant_id": merchant_id, "goal": goal},
        output=output,
        result=result,
    )
    db.add(action)
    db.flush()
    return action


def shop(db: Session, merchant: Merchant, goal: str) -> dict:
    products = _manifest_products(db, merchant)
    if not products:
        action = _log(
            db, merchant.id, goal,
            f"No published manifest available for {merchant.name} — nothing to shop from.",
            "Attempted to fetch the catalog manifest.",
            AgentResult.failed,
        )
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
        action = _log(
            db, merchant.id, goal,
            f"Could not reason over the manifest for goal '{goal}': {exc}",
            "Called the LLM to select a product from the manifest.",
            AgentResult.failed,
        )
        return {"status": "failed", "reason": str(exc), "agent_action_id": action.id}

    status = parsed.get("status")
    buyer_reasoning = parsed.get("reasoning", "")

    if status == "ambiguous":
        candidate_ids = parsed.get("candidate_ids") or []
        candidates = [p for p in products if p["id"] in candidate_ids]
        action = _log(
            db, merchant.id, goal,
            buyer_reasoning or f"'{goal}' matches multiple products — refusing to guess which one.",
            f"Found {len(candidates)} equally-plausible candidates and stopped instead of picking one arbitrarily.",
            AgentResult.failed,
            output={"candidate_ids": [c["id"] for c in candidates]},
        )
        return {
            "status": "ambiguous",
            "goal": goal,
            "reasoning": buyer_reasoning,
            "candidates": candidates,
            "agent_action_id": action.id,
        }

    if status != "match" or not parsed.get("selected_item_id"):
        action = _log(
            db, merchant.id, goal,
            buyer_reasoning or f"No product in the manifest satisfies: {goal}",
            "Reasoned over the manifest and found no match.",
            AgentResult.failed,
            output={"products_considered": len(products)},
        )
        return {"status": "no_match", "reasoning": buyer_reasoning, "agent_action_id": action.id}

    selected_id = parsed["selected_item_id"]
    selected = next((p for p in products if p["id"] == selected_id), None)
    if not selected:
        action = _log(
            db, merchant.id, goal,
            f"The LLM selected item id {selected_id}, which is not in the manifest — refusing to proceed.",
            "Validated selected product id against the manifest.",
            AgentResult.failed,
            output={"selected_item_id": selected_id},
        )
        return {"status": "invalid_selection", "agent_action_id": action.id}

    action = _log(
        db, merchant.id, goal,
        f"For goal '{goal}': {buyer_reasoning}",
        f"Selected {selected['name']} (₹{selected['price']:g}) from the manifest and requested purchase.",
        AgentResult.success,
        output={"selected_item_id": selected_id},
    )

    purchase_result = attempt_purchase(db, selected_id, selected["price"], requester="BuyerAgent")

    return {
        "status": "purchase_attempted",
        "goal": goal,
        "selected_product": selected,
        "buyer_reasoning": buyer_reasoning,
        "buyer_agent_action_id": action.id,
        "purchase_result": purchase_result,
    }
