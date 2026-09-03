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
from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, DiagnosticReport, Merchant

SYSTEM_PROMPT = (
    "You are a shopping agent choosing a product from a merchant's catalog manifest to "
    "satisfy a buyer's goal. Respond with ONLY a JSON object, no other text, in exactly one "
    "of these four shapes:\n"
    '- Exactly one product clearly satisfies the goal: '
    '{"status": "match", "selected_item_id": "<id>", "reasoning": "<one sentence>"}\n'
    "- The goal already narrows the catalog to a small, specific family -- it names a "
    "style/collection/line/feature that only SOME products share (e.g. \"the X Lows\" "
    "narrows to that shoe's colorways) -- but not which exact one: "
    '{"status": "ambiguous", "candidate_ids": ["<id>", "<id>", ...], '
    '"reasoning": "<one sentence explaining what needs to be narrowed down>"} '
    "(list at most 6 candidates)\n"
    "- The goal is so bare that MORE THAN 6 different products would satisfy it about "
    "equally well -- it doesn't point at any specific style, line, feature, or budget, just "
    "a broad category (e.g. \"best TV\", \"recommend a watch\", \"I need a laptop\" alone): "
    "do not dump a wall of unrelated candidates -- ask ONE short clarifying question instead "
    "(budget, use case, or the one defining detail that would actually narrow it down): "
    '{"status": "need_more_info", "reasoning": "<one short clarifying question>"}\n'
    "- Nothing in the catalog satisfies the goal: "
    '{"status": "no_match", "reasoning": "<one sentence>"}\n'
    "Never invent a product id that isn't in the manifest. Prefer \"match\" only when you're "
    "confident the goal picks out one specific product, not a family of them. If a "
    "conversation history is given below, use it: if you already asked a clarifying question "
    "and the buyer's current goal answers it, resolve to match/ambiguous/no_match using the "
    "combined context -- never ask a second clarifying question in a row about the same thing. "
    "Each product may also include merchant_name and merchant_score (0-100, higher means the "
    "merchant is better prepared for agents like you to shop from) -- when multiple products "
    "from different merchants are similarly good matches for the goal, prefer the one from the "
    "higher-scored merchant; treat a missing or null merchant_score as neutral, never as a low "
    "score."
)


DESCRIPTION_PROMPT_CHARS = 150  # keep the LLM prompt small -- a full manifest of real
# products (long real descriptions, variant lists, pretty-printed) can push a bigger
# catalog well past Groq's free-tier per-request token limit; the full data still goes
# back to the caller for display, just not into the prompt.

HISTORY_TURN_LIMIT = 3  # only the most recent turns matter for resolving a follow-up,
# and folding in the whole conversation would eat further into the same token budget
# DESCRIPTION_PROMPT_CHARS already protects.
HISTORY_FIELD_CHARS = 200


def _format_history(history: list[dict] | None) -> str:
    """Turns the frontend's per-turn history into a short block the prompt can use to
    resolve a follow-up goal. Capped server-side regardless of what the caller sends --
    never trust the frontend's own cap alone."""
    if not history:
        return ""
    lines = []
    for turn in history[-HISTORY_TURN_LIMIT:]:
        goal = str(turn.get("goal") or "")[:HISTORY_FIELD_CHARS]
        status = turn.get("status")
        line = f"Buyer said: {goal}"
        if status:
            reasoning = str(turn.get("reasoning") or "")[:HISTORY_FIELD_CHARS]
            line += f" -> Agent ({status}): {reasoning}"
        lines.append(line)
    return "\n".join(lines)


def _compact_for_prompt(products: list[dict]) -> list[dict]:
    compact = []
    for p in products:
        entry = {
            "id": p["id"],
            "name": p["name"],
            "description": (p["description"] or "")[:DESCRIPTION_PROMPT_CHARS],
            "price": p["price"],
            "currency": p["currency"],
            "availability": p["availability"],
        }
        if "merchant_name" in p:
            entry["merchant_name"] = p["merchant_name"]
            entry["merchant_score"] = p.get("merchant_score")
        compact.append(entry)
    return compact


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
            "image_url": i.image_url,
            "image_urls": i.image_urls,
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


def _resolve_goal(
    db: Session,
    goal: str,
    history: list[dict] | None,
    products: list[dict],
    default_merchant_id: str | None = None,
) -> dict:
    """Shared by shop() (one merchant) and discover() (every published merchant) --
    this doesn't care where `products` came from, only that every id in it is real
    and that `default_merchant_id` is a sensible thing to log against before a
    specific merchant is known (None for discover(), the merchant's own id for shop())."""
    history_text = _format_history(history)
    user_content = f"Shopping goal: {goal}\n\n"
    if history_text:
        user_content += f"Conversation so far:\n{history_text}\n\n"
    user_content += (
        f"Catalog manifest:\n{json.dumps(_compact_for_prompt(products), separators=(',', ':'))}"
    )

    try:
        client = get_client()
        completion = client.chat.completions.create(
            model=REASONING_MODEL,
            max_tokens=600,
            reasoning_effort="low",  # gpt-oss models spend tokens on hidden reasoning by default
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        raw = completion.choices[0].message.content.strip()
        parsed = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - fail closed if the LLM call/parse fails
        action = _log(
            db, default_merchant_id, goal,
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

        if not candidates:
            # The LLM said "ambiguous" but every candidate id it gave either wasn't in
            # the manifest at all (hallucinated) or the list was empty -- returning
            # "ambiguous" with nothing to pick from is a dead end for the caller, so
            # treat it the same as no match rather than surfacing an empty picker.
            action = _log(
                db, default_merchant_id, goal,
                f"'{goal}' was flagged ambiguous, but none of the LLM's candidate ids matched "
                "a real product in the manifest — treating as no match.",
                "Validated ambiguous-status candidate ids against the manifest.",
                AgentResult.failed,
                output={"raw_candidate_ids": candidate_ids},
            )
            return {"status": "no_match", "reasoning": buyer_reasoning, "agent_action_id": action.id}

        action = _log(
            db, default_merchant_id, goal,
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

    if status == "need_more_info":
        action = _log(
            db, default_merchant_id, goal,
            buyer_reasoning or f"'{goal}' doesn't give enough to narrow down a recommendation.",
            "Determined the goal needs clarification before a product can be suggested.",
            AgentResult.failed,
            output={"clarifying_question": buyer_reasoning},
        )
        return {"status": "need_more_info", "goal": goal, "reasoning": buyer_reasoning, "agent_action_id": action.id}

    if status != "match" or not parsed.get("selected_item_id"):
        action = _log(
            db, default_merchant_id, goal,
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
            db, default_merchant_id, goal,
            f"The LLM selected item id {selected_id}, which is not in the manifest — refusing to proceed.",
            "Validated selected product id against the manifest.",
            AgentResult.failed,
            output={"selected_item_id": selected_id},
        )
        return {"status": "invalid_selection", "agent_action_id": action.id}

    resolved_merchant_id = selected.get("merchant_id") or default_merchant_id

    action = _log(
        db, resolved_merchant_id, goal,
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


def shop(db: Session, merchant: Merchant, goal: str, history: list[dict] | None = None) -> dict:
    products = _manifest_products(db, merchant)
    if not products:
        action = _log(
            db, merchant.id, goal,
            f"No published manifest available for {merchant.name} — nothing to shop from.",
            "Attempted to fetch the catalog manifest.",
            AgentResult.failed,
        )
        return {"status": "no_manifest", "agent_action_id": action.id}

    return _resolve_goal(db, goal, history, products, default_merchant_id=merchant.id)


def _all_discoverable_products(db: Session) -> list[dict]:
    """Every product from every merchant with at least one published manifest, tagged
    with which merchant it's from and that merchant's latest Diagnose score. Merchants
    with no published manifest are silently absent -- the same "not agent-readable, not
    found" rule that already applies within a single merchant's own catalog, just
    applied across all of them."""
    merchant_ids_with_manifest = {
        row[0] for row in db.query(CatalogManifest.merchant_id).distinct()
    }
    if not merchant_ids_with_manifest:
        return []

    merchants = db.query(Merchant).filter(Merchant.id.in_(merchant_ids_with_manifest)).all()
    combined: list[dict] = []
    for m in merchants:
        latest_report = (
            db.query(DiagnosticReport)
            .filter(DiagnosticReport.merchant_id == m.id)
            .order_by(DiagnosticReport.timestamp.desc())
            .first()
        )
        score = latest_report.score if latest_report else None
        for p in _manifest_products(db, m):
            p["merchant_id"] = m.id
            p["merchant_name"] = m.name
            p["merchant_score"] = score
            combined.append(p)
    return combined


def discover(db: Session, goal: str, history: list[dict] | None = None) -> dict:
    products = _all_discoverable_products(db)
    if not products:
        action = _log(
            db, None, goal,
            "No merchant has a published catalog manifest yet — nothing to discover from.",
            "Attempted to fetch every merchant's catalog manifest.",
            AgentResult.failed,
        )
        return {"status": "no_merchants", "agent_action_id": action.id}

    return _resolve_goal(db, goal, history, products, default_merchant_id=None)
