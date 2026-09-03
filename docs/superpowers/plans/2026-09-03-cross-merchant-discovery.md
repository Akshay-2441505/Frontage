# Cross-Merchant Discovery for Otto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Otto searches every Frontage-enabled merchant for a goal instead of requiring one store to be picked first, with a merchant's Frontage (Diagnose) score acting as a tiebreaker among similarly-matching products.

**Architecture:** A new backend `discover()` function reasons over every published merchant's manifest in one Groq call (existing model's 131k-token context comfortably fits the combined catalog). It shares all branch-handling logic with the existing single-merchant `shop()` via an extracted helper, so nothing is duplicated. The frontend removes Otto's merchant picker entirely and attributes every shown product to its merchant.

**Tech Stack:** FastAPI + SQLAlchemy (backend, unchanged), React 19 + Vite (frontend, unchanged), Groq `openai/gpt-oss-120b` (existing LLM, no new provider).

**Spec:** `docs/superpowers/specs/2026-09-03-cross-merchant-discovery-design.md`

## Global Constraints

- No new LLM provider (no OpenRouter code path) — Groq's existing model has enough context headroom (confirmed: 131,072 tokens vs. ~35,000 projected combined-catalog tokens at 20 merchants).
- `shop()` and `POST /buyer-agent/shop` must remain fully functional and behaviorally unchanged — the existing `test_buyer.py` suite passing unmodified is the proof.
- `attempt_purchase()`, mandate gating, and Transact are untouched.
- All currency values in the current catalog are `INR` — no currency normalization needed.
- Follow this repo's existing test conventions exactly: `unittest.mock.patch.object` on `get_client`, shared fixtures from `backend/tests/conftest.py` (`db_session`, `merchant`, `catalog_item`, `client`), compact-JSON prompt assertions via `call_args.kwargs["messages"][1]["content"]`.
- This project has no frontend unit-test framework — frontend tasks are verified via `npx vite build` (from `frontend/`) plus live browser checks, matching how every prior frontend change this session was verified.
- Never stage frontend changes with `git add -A`/`-A`; stage explicit paths only (established discipline — a parallel session may have other in-progress frontend work).
- Git commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: Extract `_resolve_goal()` from `shop()` — pure refactor, zero behavior change

**Files:**
- Modify: `backend/app/agents/buyer.py` (whole file restructured, no new public behavior)
- Test: `backend/tests/test_buyer.py` (existing file — must pass unmodified, this is the task's own verification)

**Interfaces:**
- Produces: `_resolve_goal(db: Session, goal: str, history: list[dict] | None, products: list[dict], default_merchant_id: str | None = None) -> dict` — takes an already-assembled product list, builds the prompt, calls the LLM, and returns the same result shapes `shop()` already returns (`failed`, `ambiguous`, `no_match`, `need_more_info`, `invalid_selection`, `purchase_attempted`). `default_merchant_id` is used to log actions before a specific merchant is known; once a `match` resolves, the log uses the selected product's own `merchant_id` if present, falling back to `default_merchant_id`.
- Produces: `shop(db, merchant, goal, history=None)` — same signature and behavior as today, now a thin wrapper over `_resolve_goal`.
- Consumed by: Task 2's `discover()`.

- [ ] **Step 1: Confirm the current test suite is green before touching anything**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer.py -v`
Expected: `9 passed`

- [ ] **Step 2: Replace `backend/app/agents/buyer.py` with the refactored version**

Replace the entire file content from `def shop(` (currently starting at line 132) to the end of the file with:

```python
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
```

- [ ] **Step 3: Run the full existing buyer test suite — must pass with zero changes**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer.py tests/test_buyer_router.py -v`
Expected: `9 passed` (test_buyer.py) + `1 passed` (test_buyer_router.py), identical to before the refactor. This is the regression signal that the extraction didn't change `shop()`'s behavior — if anything fails here, the refactor broke something and must be fixed before continuing, not worked around.

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/ -q`
Expected: all tests pass (60 at time of writing; the exact count may have grown, but nothing should fail).

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/buyer.py
git commit -m "$(cat <<'EOF'
Refactor: extract _resolve_goal() from shop() ahead of cross-merchant discovery

Pure refactor, no behavior change -- shop()'s branch-handling logic
(build prompt, call the LLM, validate the response against the real
catalog, log, hand off to attempt_purchase) doesn't care whether the
product list it's handed came from one merchant or many. Extracted so
the upcoming discover() can reuse it instead of duplicating five
branches of logic. Verified via the full existing test_buyer.py /
test_buyer_router.py suites passing unmodified.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `discover()` — cross-merchant product aggregation + score-tiebreaker prompt

**Files:**
- Modify: `backend/app/agents/buyer.py`
- Test: `backend/tests/test_buyer.py`

**Interfaces:**
- Consumes: `_resolve_goal` (Task 1), `_manifest_products` (existing), `_log` (existing).
- Produces: `_all_discoverable_products(db: Session) -> list[dict]` — every product from every merchant with at least one published `CatalogManifest`, each dict additionally carrying `merchant_id`, `merchant_name`, `merchant_score` (the last is `None` if the merchant has no `DiagnosticReport` yet).
- Produces: `discover(db: Session, goal: str, history: list[dict] | None = None) -> dict` — same result shapes as `shop()`, plus a new `no_merchants` status when nothing is published anywhere.
- Consumed by: Task 3's router.

- [ ] **Step 1: Add the model import**

In `backend/app/agents/buyer.py`, change the models import line (currently `from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, Merchant`) to:

```python
from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, DiagnosticReport, Merchant
```

- [ ] **Step 2: Write the failing tests**

Add to `backend/tests/test_buyer.py`. First update the import line at the top of the file from:
```python
from app.models import CatalogItem, CatalogManifest
```
to:
```python
from app.models import AgentAction, CatalogItem, CatalogManifest, DiagnosticReport, Merchant
```

Then append at the end of the file:

```python
def test_discover_combines_products_across_merchants(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    merchant2 = Merchant(name="Second Store", catalog_source="test")
    db_session.add(merchant2)
    db_session.flush()
    item2 = _published_merchant(db_session, merchant2)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {
            "status": "ambiguous",
            "candidate_ids": [item1.id, item2.id],
            "reasoning": "Both stores sell a matching product.",
        }
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "something vague")

    assert result["status"] == "ambiguous"
    ids = {c["id"] for c in result["candidates"]}
    assert ids == {item1.id, item2.id}
    names = {c["merchant_name"] for c in result["candidates"]}
    assert names == {"Test Merchant", "Second Store"}


def test_discover_skips_merchants_without_a_published_manifest(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    merchant2 = Merchant(name="No Manifest Store", catalog_source="test")
    db_session.add(merchant2)
    db_session.flush()
    unpublished = CatalogItem(
        merchant_id=merchant2.id,
        name="Invisible Product",
        description="Should never surface via discover() -- no manifest published.",
        price=50.0,
        currency="INR",
        availability="in_stock",
        agent_readable=True,
    )
    db_session.add(unpublished)
    db_session.flush()

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Only real match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.discover(db_session, "anything")

    user_message = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "Invisible Product" not in user_message


def test_discover_returns_no_merchants_when_nothing_published(db_session, merchant):
    result = buyer_mod.discover(db_session, "anything")
    assert result["status"] == "no_merchants"


def test_discover_prompt_includes_merchant_name_and_score(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)
    db_session.add(DiagnosticReport(merchant_id=merchant.id, score=87.0, gaps=[]))
    db_session.flush()

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        buyer_mod.discover(db_session, "anything")

    user_message = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert '"merchant_name":"Test Merchant"' in user_message
    assert '"merchant_score":87.0' in user_message


def test_discover_merchant_score_is_null_when_never_diagnosed(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "anything")

    assert result["selected_product"]["merchant_score"] is None


def test_discover_logs_match_under_the_selected_merchant(db_session, merchant):
    item1 = _published_merchant(db_session, merchant)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(
        {"status": "match", "selected_item_id": item1.id, "reasoning": "Match."}
    )

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        result = buyer_mod.discover(db_session, "anything")

    action = db_session.get(AgentAction, result["buyer_agent_action_id"])
    assert action.merchant_id == merchant.id
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer.py -k discover -v`
Expected: FAIL with `AttributeError: module 'app.agents.buyer' has no attribute 'discover'` (or similar) on every new test.

- [ ] **Step 4: Update `SYSTEM_PROMPT` for the score tiebreaker**

In `backend/app/agents/buyer.py`, replace the `SYSTEM_PROMPT` assignment's closing sentence (currently ending `"...never ask a second clarifying question in a row about the same thing."`) so the full constant becomes:

```python
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
```

- [ ] **Step 5: Update `_compact_for_prompt` to include merchant fields when present**

Replace the `_compact_for_prompt` function:

```python
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
```

- [ ] **Step 6: Add `_all_discoverable_products` and `discover`**

Append to the end of `backend/app/agents/buyer.py`:

```python
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
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer.py -v`
Expected: all tests pass, including the 6 new `discover`-related ones and all 9 pre-existing ones (15 total in this file).

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/ -q`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/agents/buyer.py backend/tests/test_buyer.py
git commit -m "$(cat <<'EOF'
Add discover(): cross-merchant product search with score tiebreaker

Otto currently requires a merchant picked before it can search --
discover() instead reasons over every merchant with a published
manifest in one call, tagging each product with which merchant sells
it and that merchant's latest Diagnose score. The system prompt gains
one instruction: among similarly-matching products from different
merchants, prefer the higher-scored one (missing score treated as
neutral, not low). Reuses _resolve_goal() entirely -- no branch logic
duplicated between this and shop().

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `POST /buyer-agent/discover` endpoint

**Files:**
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/routers/buyer.py`
- Test: `backend/tests/test_buyer_router.py`

**Interfaces:**
- Consumes: `discover` (Task 2), existing `ConversationTurnIn` schema.
- Produces: `DiscoverGoalIn(goal: str, history: list[ConversationTurnIn] = [])` schema; `POST /buyer-agent/discover` route returning the same JSON shape `POST /buyer-agent/shop` already returns.
- Consumed by: Task 4's `api.js`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_buyer_router.py`:

```python
def test_discover_endpoint_returns_a_purchase_attempt(client, db_session, merchant, catalog_item):
    catalog_item.agent_readable = True
    manifest = CatalogManifest(merchant_id=merchant.id, version=1, url="/x", item_ids=[catalog_item.id])
    db_session.add(manifest)
    db_session.commit()

    fake_client = MagicMock()
    completion = MagicMock()
    completion.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps(
                    {"status": "match", "selected_item_id": catalog_item.id, "reasoning": "Match."}
                )
            )
        )
    ]
    fake_client.chat.completions.create.return_value = completion

    with patch.object(buyer_mod, "get_client", return_value=fake_client):
        resp = client.post(
            "/buyer-agent/discover",
            json={"goal": "under 600 rupees", "history": []},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "purchase_attempted"
    assert body["selected_product"]["merchant_name"] == "Test Merchant"


def test_discover_endpoint_returns_no_merchants_when_nothing_published(client):
    resp = client.post("/buyer-agent/discover", json={"goal": "anything", "history": []})

    assert resp.status_code == 200
    assert resp.json()["status"] == "no_merchants"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer_router.py -v`
Expected: FAIL with a 404 (route doesn't exist yet).

- [ ] **Step 3: Add `DiscoverGoalIn` to the schemas**

In `backend/app/schemas/__init__.py`, add immediately after the existing `ShoppingGoalIn` class (which ends the file):

```python


class DiscoverGoalIn(BaseModel):
    goal: str
    history: list[ConversationTurnIn] = []
```

- [ ] **Step 4: Add the route**

Replace the full content of `backend/app/routers/buyer.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.buyer import discover, shop
from app.db import get_db
from app.models import Merchant
from app.schemas import DiscoverGoalIn, ShoppingGoalIn

router = APIRouter(prefix="/buyer-agent", tags=["buyer"])


@router.post("/shop")
def buyer_shop(body: ShoppingGoalIn, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, body.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    history = [turn.model_dump() for turn in body.history]
    result = shop(db, merchant, body.goal, history=history)
    db.commit()
    return result


@router.post("/discover")
def buyer_discover(body: DiscoverGoalIn, db: Session = Depends(get_db)):
    history = [turn.model_dump() for turn in body.history]
    result = discover(db, body.goal, history=history)
    db.commit()
    return result
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/test_buyer_router.py -v`
Expected: `3 passed` (the existing shop-endpoint test plus the two new discover ones).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && ".venv/Scripts/python.exe" -m pytest tests/ -q`
Expected: all tests pass.

- [ ] **Step 7: Restart the backend and verify live**

```bash
cd backend && ".venv/Scripts/python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then in a separate shell, confirm the route exists and rejects gracefully with no body:

```bash
curl -s http://127.0.0.1:8000/openapi.json | grep -o '"/buyer-agent/discover"'
```
Expected: prints `"/buyer-agent/discover"`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/__init__.py backend/app/routers/buyer.py backend/tests/test_buyer_router.py
git commit -m "$(cat <<'EOF'
Add POST /buyer-agent/discover endpoint

Thin wrapper over discover(), mirroring the existing /buyer-agent/shop
handler exactly. The existing endpoint and its schema are untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `api.js` + remove the merchant picker from Otto's layout

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/layouts/OttoLayout.jsx`

**Interfaces:**
- Produces: `api.discover(goal, history = [])` — POSTs to `/buyer-agent/discover`.
- Consumed by: Task 5's `OttoChat.jsx`.

- [ ] **Step 1: Add `discover` to `api.js`**

In `frontend/src/api.js`, immediately after the existing `buyerShop` entry (currently ending `}),`), add:

```javascript
  discover: (goal, history = []) =>
    request('/buyer-agent/discover', {
      method: 'POST',
      body: JSON.stringify({ goal, history }),
    }),
```

- [ ] **Step 2: Remove the catalog switcher from `OttoLayout.jsx`**

In `frontend/src/layouts/OttoLayout.jsx`, change the destructure on line 38 from:
```javascript
const { merchants, merchantId, setMerchantId, error } = useMerchants()
```
to:
```javascript
const { error } = useMerchants()
```

Then replace this block:
```jsx
              <div className="cluster otto__tools">
                <label className="cluster otto__catalog-field">
                  <span className="eyebrow">Catalog</span>
                  <select
                    className="field__control otto__catalog"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                  >
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ThemeToggle />
              </div>
```
with:
```jsx
              <div className="cluster otto__tools">
                <ThemeToggle />
              </div>
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npx vite build --logLevel warn`
Expected: no errors (a "chunks larger than 500 kB" warning is pre-existing and fine).

Then clean up: `rm -rf frontend/dist`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js frontend/src/layouts/OttoLayout.jsx
git commit -m "$(cat <<'EOF'
Add api.discover(); remove Otto's merchant picker

The catalog dropdown is gone from Otto's header -- the next task
switches OttoChat.jsx to search across every merchant instead of one
picked one. api.buyerShop stays for a possible future merchant-console
preview tool; unused by Otto going forward.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `OttoChat.jsx` — search everywhere, generic copy, cross-merchant hero sample

**Files:**
- Modify: `frontend/src/pages/shop/OttoChat.jsx`

**Interfaces:**
- Consumes: `api.discover` (Task 4).
- Produces: `useCrossMerchantSample(merchants)` hook, feeding `HeroWall` a real cross-merchant product sample instead of one merchant's catalog.
- Every `result.selected_product` / candidate object from here on carries `merchant_id` / `merchant_name` (from the backend) — Task 6 depends on this to add attribution.

- [ ] **Step 1: Remove `suggestGoals`, `roundUp`, `CURRENCY_WORD` and replace with a fixed example-goal list**

Delete the `CURRENCY_WORD` constant (line 19), the `roundUp` function (lines 21-25), and the `suggestGoals` function (lines 27-48) from `frontend/src/pages/shop/OttoChat.jsx`.

In their place (same location, top of file after the intro comment), add:

```javascript
const EXAMPLE_GOALS = [
  'find something under 1000 rupees',
  'I want a striped t-shirt',
  'recommend a good everyday watch',
]
```

- [ ] **Step 2: Add the cross-merchant hero-sample hook**

Add this function right before `export default function OttoChat()` (after the existing `useSpeechToText` function):

```javascript
const HERO_SAMPLE_MERCHANT_LIMIT = 5

/* The empty-state product wall used to show one selected merchant's catalog. With
   no merchant picker anymore, it instead samples a few merchants' catalogs and
   combines them -- which is a better fit for the wall's purpose anyway: it's the
   first thing a visitor sees, and showing products from multiple stores is itself
   a preview of what "search everywhere" means. Frontend-only, reuses the existing
   per-merchant catalog endpoint rather than adding a new backend sampling route
   for what's a purely cosmetic visualization. */
function useCrossMerchantSample(merchants) {
  const [sample, setSample] = useState([])

  useEffect(() => {
    if (!merchants || merchants.length === 0) {
      setSample([])
      return undefined
    }
    let cancelled = false
    const picked = merchants.slice(0, HERO_SAMPLE_MERCHANT_LIMIT)

    Promise.all(picked.map((m) => api.getCatalog(m.id).catch(() => [])))
      .then((lists) => {
        if (!cancelled) setSample(lists.flat())
      })

    return () => {
      cancelled = true
    }
  }, [merchants])

  return sample
}
```

- [ ] **Step 3: Update the component's state and effects**

Replace:
```javascript
export default function OttoChat() {
  const { merchantId, merchant } = useMerchants()
  const [catalog, setCatalog] = useState([])
  const [goal, setGoal] = useState('')
  const [turns, setTurns] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const convoRef = useRef(null)
  const innerRef = useRef(null)
  const composerRef = useRef(null)
  const speech = useSpeechToText((text) => setGoal(text))

  const merchantName = merchant?.name || 'this store'
  const hasTurns = turns.length > 0
  const motionOK = useMotionOK()

  useEffect(() => {
    setTurns([])
    setGoal('')
    setError(null)
    if (!merchantId) {
      setCatalog([])
      return
    }
    api
      .getCatalog(merchantId)
      .then((items) => setCatalog(Array.isArray(items) ? items : []))
      .catch(() => setCatalog([]))
  }, [merchantId])
```

with:
```javascript
export default function OttoChat() {
  const { merchants } = useMerchants()
  const catalog = useCrossMerchantSample(merchants)
  const [goal, setGoal] = useState('')
  const [turns, setTurns] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const convoRef = useRef(null)
  const innerRef = useRef(null)
  const composerRef = useRef(null)
  const speech = useSpeechToText((text) => setGoal(text))

  const hasTurns = turns.length > 0
  const motionOK = useMotionOK()
```

- [ ] **Step 4: Replace the `goals` memo and `send()`**

Replace:
```javascript
  const goals = useMemo(() => suggestGoals(catalog), [catalog])

  async function send(text) {
    const asked = (text ?? goal).trim()
    if (!asked || !merchantId) return

    setGoal('')
    setError(null)
    setBusy(true)
    setTurns((prev) => [...prev, { goal: asked, result: null }])

    try {
      const data = await api.buyerShop(merchantId, asked, buildHistory(turns))
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, result: data } : t)))
    } catch (err) {
      setError(err.message)
      setTurns((prev) => prev.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }
```

with:
```javascript
  const goals = EXAMPLE_GOALS

  async function send(text) {
    const asked = (text ?? goal).trim()
    if (!asked) return

    setGoal('')
    setError(null)
    setBusy(true)
    setTurns((prev) => [...prev, { goal: asked, result: null }])

    try {
      const data = await api.discover(asked, buildHistory(turns))
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, result: data } : t)))
    } catch (err) {
      setError(err.message)
      setTurns((prev) => prev.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }
```

- [ ] **Step 5: Remove `!merchantId` guards from the composer**

In the `composer` JSX (the `<form>` block), remove every `!merchantId` reference:

- `disabled={!merchantId}` on `.composer__input` → `disabled={busy}` is not appropriate here (the input should stay typeable while busy is fine already elsewhere), so simply drop the `disabled` prop from the `<input>` entirely (there is no longer any pre-send blocking condition).
- `disabled={!merchantId}` on `.composer__mic` → drop the `disabled` prop from that `<button>` as well.
- `disabled={busy || !goal.trim() || !merchantId}` on `.composer__send` → becomes `disabled={busy || !goal.trim()}`.

- [ ] **Step 6: Update the hero copy and composer placeholder**

Replace:
```javascript
        placeholder={speech.isListening ? 'Listening…' : `What are you looking for at ${merchantName}?`}
```
with:
```javascript
        placeholder={speech.isListening ? 'Listening…' : 'What are you looking for?'}
```

Replace the hero sub-copy paragraph:
```jsx
          <motion.p className="otto-hero__sub" variants={fadeRise}>
            I can read {merchantName}'s catalog the way a machine reads it, pick what fits, and
            check out — as long as it's inside the limit they set.
          </motion.p>
```
with:
```jsx
          <motion.p className="otto-hero__sub" variants={fadeRise}>
            I can read every agent-ready store's catalog the way a machine reads it, pick what
            fits, and check out — as long as it's inside the limit each store set.
          </motion.p>
```

- [ ] **Step 7: Build check**

Run: `cd frontend && npx vite build --logLevel warn`
Expected: no errors. (Task 6 still needs to update every `merchantName`-referencing spot inside `Turn`/`Outcome`/`Attribution`/`Ambiguous`/`BudgetBreach` — those references still compile at this point since `merchantName` was removed from the component's own scope but is passed as a prop into `Turn`, which will now receive `undefined`; this is expected and fixed in Task 6, not this one. Confirm the build itself still succeeds structurally before moving on.)

Then clean up: `rm -rf frontend/dist`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/shop/OttoChat.jsx
git commit -m "$(cat <<'EOF'
Otto searches every merchant: send() uses discover(), generic copy

Removes the per-merchant scoping from Otto's own state and search
call -- send() now calls api.discover() instead of api.buyerShop(),
and the composer/hero copy drop the single-store framing. The
empty-state product wall now samples a few merchants' catalogs
instead of one selected merchant's, which doubles as a preview of
"search everywhere" before a goal is even typed.

Per-turn merchant attribution (Turn/Outcome/Attribution/Ambiguous/
BudgetBreach still reference a merchantName that's no longer in this
component's own scope) is the next commit -- this one is intentionally
not yet visually complete on its own.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Merchant attribution everywhere a product is shown

**Files:**
- Modify: `frontend/src/pages/shop/OttoChat.jsx`
- Modify: `frontend/src/styles/shop.css`

**Interfaces:**
- Consumes: `merchant_id` / `merchant_name` now present on every product/candidate object (Task 2's backend change).
- No new exports — this task closes out every place identified in Task 5's commit message as "not yet visually complete."

- [ ] **Step 1: Fix `differentiators()` to fall back to merchant name, not just catalog id**

Replace the `differentiators` function:

```javascript
function differentiators(candidates) {
  const tokenSets = candidates.map(
    (c) => new Set(String(c.name || '').split(/\s+/).filter(Boolean)),
  )
  const first = tokenSets[0] ? [...tokenSets[0]] : []
  const common = new Set(first.filter((t) => tokenSets.every((s) => s.has(t))))

  const unique = candidates.map((c, i) => [...(tokenSets[i] || [])].filter((t) => !common.has(t)))

  const signatures = candidates.map((c, i) => `${c.name}|${unique[i].join(',')}|${c.price}`)
  const counts = new Map()
  for (const sig of signatures) counts.set(sig, (counts.get(sig) || 0) + 1)

  return candidates.map((c, i) => {
    const identical = counts.get(signatures[i]) > 1
    // A same-name-same-price tie across DIFFERENT merchants is common and not
    // confusing -- the merchant name alone tells them apart. A true same-merchant
    // duplicate (e.g. Plum Goodness's exact-duplicate listings) still needs the
    // catalog-id fallback, since two rows from the same store need something finer.
    const identicalWithinSameMerchant =
      identical &&
      candidates.filter((other, j) => signatures[j] === signatures[i] && other.merchant_id === c.merchant_id).length > 1

    return {
      unique: unique[i],
      identical,
      identicalWithinSameMerchant,
    }
  })
}
```

- [ ] **Step 2: Update `Ambiguous`'s disambig-list identical-tag fallback**

Replace this block inside the `.disambig__diff` span:
```jsx
                    {diff.identical && (
                      <span className="disambig__tag disambig__tag--same">
                        catalog id …{String(candidate.id).slice(-6)}
                      </span>
                    )}
```
with:
```jsx
                    {diff.identical && (
                      <span className="disambig__tag disambig__tag--same">
                        {diff.identicalWithinSameMerchant
                          ? `catalog id …${String(candidate.id).slice(-6)}`
                          : candidate.merchant_name || `catalog id …${String(candidate.id).slice(-6)}`}
                      </span>
                    )}
```

Also add a merchant-name line to each disambig option, right after `disambig__name`:
```jsx
                <span className="disambig__main">
                  <span className="disambig__name">{candidate.name}</span>
                  {candidate.merchant_name && (
                    <span className="disambig__merchant">{candidate.merchant_name}</span>
                  )}
                  <span className="disambig__diff">
```
(this only changes the opening of that block — the rest of `disambig__diff` and its children are unchanged)

- [ ] **Step 3: Update `SpecCompare`'s "What's different" row and add a "Store" row**

Add a new row immediately after the `<thead>` block's closing `</thead>` and before the existing image row (i.e. as the first row of `<tbody>`):

```jsx
        <tbody>
          <tr>
            <th scope="row">Store</th>
            {candidates.map((c) => (
              <td key={c.id}>{c.merchant_name || '—'}</td>
            ))}
          </tr>
          {/* Choosing between two near-identical products off attribute rows alone is
```
(the comment line and the existing image-row `{candidates.some(...` block that follows stay exactly as they are — only the new "Store" row is inserted before them)

Replace the "What's different" row's cell logic:
```jsx
              <td key={c.id}>
                {diffs[i].unique.length > 0
                  ? diffs[i].unique.join(', ')
                  : diffs[i].identical
                    ? `catalog id …${String(c.id).slice(-6)}`
                    : '—'}
              </td>
```
with:
```jsx
              <td key={c.id}>
                {diffs[i].unique.length > 0
                  ? diffs[i].unique.join(', ')
                  : diffs[i].identical
                    ? (diffs[i].identicalWithinSameMerchant
                        ? `catalog id …${String(c.id).slice(-6)}`
                        : c.merchant_name || `catalog id …${String(c.id).slice(-6)}`)
                    : '—'}
              </td>
```

- [ ] **Step 4: Add merchant name to `ProductCard`**

Replace:
```jsx
      <div className="prod__foot">
        <span className="prod__price">{formatMoney(product.price, product.currency)}</span>
        {product.availability && product.availability !== 'in_stock' && (
          <span className="pill pill--warn">{String(product.availability).replace(/_/g, ' ')}</span>
        )}
      </div>
```
with:
```jsx
      <div className="prod__foot">
        <span className="prod__price">{formatMoney(product.price, product.currency)}</span>
        {product.merchant_name && <span className="prod__merchant">{product.merchant_name}</span>}
        {product.availability && product.availability !== 'in_stock' && (
          <span className="pill pill--warn">{String(product.availability).replace(/_/g, ' ')}</span>
        )}
      </div>
```

- [ ] **Step 5: Fix `BudgetBreach` to take `merchantId` as a prop instead of page context**

Replace the function signature and its context usage:
```javascript
function BudgetBreach({ product }) {
  const { merchantId } = useMerchants()
  const motionOK = useMotionOK()
```
with:
```javascript
function BudgetBreach({ product, merchantId }) {
  const motionOK = useMotionOK()
```

(the rest of `BudgetBreach`'s body is unchanged — it already only reads `merchantId` as a plain variable from this point on)

Update its call site inside `Outcome`:
```jsx
      {blocked && <BudgetBreach product={product} />}
```
becomes:
```jsx
      {blocked && <BudgetBreach product={product} merchantId={product?.merchant_id} />}
```

- [ ] **Step 6: Fix every `merchantName` reference in `Turn`, `Outcome`, and `Attribution`**

`Turn`'s signature and call sites change — `Turn` no longer receives a page-level `merchantName` prop at all; each status branch that needs a merchant name now derives it from the turn's own `result`.

Replace the `Turn` function signature:
```javascript
function Turn({ turn, index, merchantName, onPick, onConfirmPurchase, busy }) {
```
with:
```javascript
function Turn({ turn, index, onPick, onConfirmPurchase, busy }) {
```

Replace the `no_manifest` branch (which can no longer occur via `discover()`, only the old single-merchant `shop()` which Otto no longer calls) with a `no_merchants` branch:
```jsx
          {result?.status === 'no_manifest' && (
            <>
              <p>
                {merchantName} hasn't published a catalog I can read, so there's nothing here for me
                to shop. Everything they sell is invisible to me right now.
              </p>
              <p>
                <Link to="/merchant/fix" className="btn btn--ghost btn--sm">
                  Publish one in Frontage
                  <IconArrowRight />
                </Link>
              </p>
            </>
          )}
```
becomes:
```jsx
          {result?.status === 'no_merchants' && (
            <>
              <p>
                No store has published a catalog I can read yet, so there's nothing here for me
                to shop at all.
              </p>
              <p>
                <Link to="/merchant/fix" className="btn btn--ghost btn--sm">
                  Publish one in Frontage
                  <IconArrowRight />
                </Link>
              </p>
            </>
          )}
```

Replace the `no_match` branch's default message:
```jsx
          {result?.status === 'no_match' && (
            <p>
              {result.reasoning ||
                `I read everything ${merchantName} publishes and nothing matches that. Try naming a product, or give me a budget.`}
            </p>
          )}
```
with:
```jsx
          {result?.status === 'no_match' && (
            <p>
              {result.reasoning ||
                "I read every store's published catalog and nothing matches that. Try naming a product, or give me a budget."}
            </p>
          )}
```

Replace the `invalid_selection` branch:
```jsx
          {result?.status === 'invalid_selection' && (
            <p>
              I picked something that turned out not to be in {merchantName}'s catalog, so I stopped
              rather than order a product that may not exist. Ask me again and I'll re-read the
              catalog.
            </p>
          )}
```
with:
```jsx
          {result?.status === 'invalid_selection' && (
            <p>
              I picked something that turned out not to be in any published catalog, so I stopped
              rather than order a product that may not exist. Ask me again and I'll re-read the
              catalogs.
            </p>
          )}
```

Replace the `failed` branch:
```jsx
          {result?.status === 'failed' && (
            <>
              <p>I couldn't finish reading {merchantName}'s catalog, so I haven't bought anything.</p>
              {result.reason && <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{result.reason}</p>}
            </>
          )}
```
with:
```jsx
          {result?.status === 'failed' && (
            <>
              <p>I couldn't finish reading the catalogs, so I haven't bought anything.</p>
              {result.reason && <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{result.reason}</p>}
            </>
          )}
```

Replace the `ambiguous` branch's prop passing:
```jsx
          {result?.status === 'ambiguous' && (
            <Ambiguous result={result} merchantName={merchantName} onPick={onPick} busy={busy} />
          )}
```
with:
```jsx
          {result?.status === 'ambiguous' && (
            <Ambiguous result={result} onPick={onPick} busy={busy} />
          )}
```

Replace the `purchase_attempted` branch:
```jsx
          {result?.status === 'purchase_attempted' && (
            <motion.div
              className="stack"
              style={{ '--stack-gap': '0.875rem' }}
              initial={turnMotionOK ? 'hidden' : false}
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: STAGGER.loose } } }}
            >
              <motion.p variants={fadeRise}>
                {result.buyer_reasoning || `Here's what I found at ${merchantName}.`}
              </motion.p>
              <motion.div className="prod-rail" variants={fadeRise}>
                <ProductCard product={result.selected_product} chosen />
              </motion.div>
              <motion.div variants={fadeRise}>
                <Attribution merchantName={merchantName} />
              </motion.div>
              <motion.div variants={fadeRise}>
                <Outcome
                  purchase={result.purchase_result}
                  product={result.selected_product}
                  merchantName={merchantName}
                  addressAlreadyConfirmed={result.addressAlreadyConfirmed}
                />
              </motion.div>
            </motion.div>
          )}
```
with:
```jsx
          {result?.status === 'purchase_attempted' && (
            <motion.div
              className="stack"
              style={{ '--stack-gap': '0.875rem' }}
              initial={turnMotionOK ? 'hidden' : false}
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: STAGGER.loose } } }}
            >
              <motion.p variants={fadeRise}>
                {result.buyer_reasoning ||
                  `Here's what I found at ${result.selected_product?.merchant_name || 'that store'}.`}
              </motion.p>
              <motion.div className="prod-rail" variants={fadeRise}>
                <ProductCard product={result.selected_product} chosen />
              </motion.div>
              <motion.div variants={fadeRise}>
                <Attribution merchantName={result.selected_product?.merchant_name} />
              </motion.div>
              <motion.div variants={fadeRise}>
                <Outcome
                  purchase={result.purchase_result}
                  product={result.selected_product}
                  merchantName={result.selected_product?.merchant_name}
                  addressAlreadyConfirmed={result.addressAlreadyConfirmed}
                />
              </motion.div>
            </motion.div>
          )}
```

- [ ] **Step 7: Fix `Ambiguous`'s own signature and default message**

Replace:
```javascript
function Ambiguous({ result, merchantName, onPick, busy }) {
  const candidates = result.candidates || []
  const diffs = differentiators(candidates)
  const anyIdentical = diffs.some((d) => d.identical)
  const compact = candidates.length >= 2 && candidates.length <= 4

  return (
    <>
      <p>
        {result.reasoning ||
          `${merchantName} sells several things that fit that. I'm not going to guess which one you meant.`}
      </p>
```
with:
```javascript
function Ambiguous({ result, onPick, busy }) {
  const candidates = result.candidates || []
  const diffs = differentiators(candidates)
  const anyIdentical = diffs.some((d) => d.identical)
  const compact = candidates.length >= 2 && candidates.length <= 4

  return (
    <>
      <p>
        {result.reasoning ||
          "Multiple products fit that. I'm not going to guess which one you meant."}
      </p>
```

- [ ] **Step 8: Fix the `Turn` call site inside the conversation list**

Replace:
```jsx
                  <Turn
                    index={i}
                    turn={turn}
                    merchantName={merchantName}
                    onPick={pick}
                    onConfirmPurchase={confirmPurchase}
                    busy={busy}
                  />
```
with:
```jsx
                  <Turn
                    index={i}
                    turn={turn}
                    onPick={pick}
                    onConfirmPurchase={confirmPurchase}
                    busy={busy}
                  />
```

- [ ] **Step 9: Add the new CSS classes**

In `frontend/src/styles/shop.css`, find the existing `.prod__price` rule and add immediately after it:

```css
.prod__merchant {
  font-size: 0.75rem;
  color: var(--text-dim);
}
```

Find the existing `.disambig__name` rule and add immediately after it:

```css
.disambig__merchant {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-block-start: 0.125rem;
}
```

- [ ] **Step 10: Build check**

Run: `cd frontend && npx vite build --logLevel warn`
Expected: no errors, and specifically no `merchantName is not defined` reference errors (that would only surface at runtime in React, not at build time, since it's a valid-but-undefined variable reference bug — so this build check alone isn't sufficient; the live walkthrough in Task 7 is what actually proves this).

Then clean up: `rm -rf frontend/dist`

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/shop/OttoChat.jsx frontend/src/styles/shop.css
git commit -m "$(cat <<'EOF'
Attribute every shown product to its merchant

Closes out the previous commit: Turn/Outcome/Attribution/Ambiguous no
longer reference a page-level merchantName (it doesn't exist anymore),
reading it off each result's own selected_product/candidate instead.
ProductCard, the comparison table, and the disambiguation list all now
show which store a product is from -- necessary once results can span
multiple merchants. differentiators() falls back to the merchant name
(not just a catalog-id suffix) when two candidates from different
stores would otherwise look identical; same-merchant duplicates still
fall back to the catalog id, unchanged. BudgetBreach now takes the
relevant merchant's id as a prop instead of reading the (now-removed)
page-level selected merchant from context.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Restart the backend**

```bash
cd backend && ".venv/Scripts/python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- [ ] **Step 2: Confirm at least two merchants have a published manifest with overlapping-ish products**

```bash
curl -s http://127.0.0.1:8000/merchants
```
Pick two merchant ids that both plausibly sell something similar (e.g. two clothing stores). If needed, use the console UI or `POST /merchants/{id}/fix/publish` to ensure both have a published manifest.

- [ ] **Step 3: Run a real cross-merchant query**

```bash
curl -s -X POST http://127.0.0.1:8000/buyer-agent/discover \
  -H "Content-Type: application/json" \
  -d '{"goal": "<a goal both merchants plausibly satisfy>", "history": []}'
```
Expected: the response's `candidates` (if `ambiguous`) or `selected_product` (if `match`) includes `merchant_name`/`merchant_id` fields naming real, correct merchants.

- [ ] **Step 4: Inspect the real reasoning log for score-tiebreaker evidence**

```bash
curl -s "http://127.0.0.1:8000/audit-log?limit=5"
```
Read the most recent `BuyerAgent` entry's `reasoning` field. If the query resolved to a specific merchant among close candidates, confirm (by eye) that the choice is consistent with — or at least not contradicted by — the relative Diagnose scores of the merchants involved.

- [ ] **Step 5: Full frontend walkthrough**

Start the frontend dev server, open `/shop`, and confirm:
- No merchant picker appears anywhere in Otto's header.
- The empty-state product wall shows products from more than one store (open browser devtools network tab and confirm multiple `/merchants/{id}/catalog` calls fired).
- Typing a goal that could match products from two different stores produces either a comparison table or disambiguation list where every option clearly names its store.
- Picking a candidate shows the address-confirm card, then a real order, with the correct merchant name throughout ("Order placed with {real name}").
- Typing a goal specific enough to resolve directly to one product completes checkout end to end, with the delivery-window line and the passive "Delivering to" line both showing the correct merchant's product.
- If a purchase gets blocked by a spend ceiling, the `BudgetBreach` bar renders correctly using that specific merchant's mandate (not a stale/wrong one).

- [ ] **Step 6: Report completion**

No commit for this task (verification only) — summarize what was confirmed live back to the user.
