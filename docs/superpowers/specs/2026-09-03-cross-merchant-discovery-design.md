# Cross-merchant discovery for Otto

## Context

Otto (the buyer-facing agent, `/shop`) is currently scoped to one merchant at a time: a
human picks a store from a dropdown, then Otto reasons only over that store's manifest.
This doesn't demonstrate Frontage's actual thesis. Per `PROJECT_SPEC.md`, Otto stands in
for a real third-party shopping agent (ChatGPT, Gemini) — and a real agent is never told
which store to shop at. It's given a goal and decides *where* to look. Requiring a
merchant to be picked first inverts that, and undercuts the pitch: a well-prepared store
should get *found and chosen* by an agent that's already searching everywhere else too,
not just browsed once it's been manually selected.

This was scoped through `/superpowers:brainstorming` across several turns: an initial
survey of admin- and buyer-side improvement candidates (inspired partly by a kore.ai "AI
Retail" reference video analyzed earlier in this project), narrowed down to this one
piece as the highest-value, most on-thesis addition. Two feasibility questions were
resolved with real evidence before finalizing scope:

- **Token budget**: the combined compact-JSON size of all 11 currently-imported
  merchants' manifests is ~66,900 characters (~16,700 tokens). Even at ~20 merchants
  (the user's stated near-term plan), that's roughly ~35,000 tokens.
- **Model context window**: Groq's `openai/gpt-oss-120b` (already `REASONING_MODEL` in
  `backend/app/agents/llm_client.py`) has a **131,072-token** context window — confirmed
  via Groq's `/v1/models` endpoint. That's ~4x the projected combined-catalog size at
  20 merchants. **No new LLM provider is needed for this feature.** An `OPENROUTER_API_KEY`
  was added to `.env` during exploration and confirmed working (two free models —
  `nvidia/nemotron-3-super-120b-a12b:free` and `z-ai/glm-5.2:free`, both 256k+ context —
  verified live to return correctly-structured JSON) as a documented future scale lever
  if the merchant count grows far beyond what's planned, but it is **out of scope for
  this implementation**. Building a dual-provider fallback now, for a limit that's not
  close to being hit, would be exactly the kind of speculative complexity this project
  has deliberately avoided elsewhere.
- **Currency**: confirmed all current catalog items use `INR` — no cross-merchant
  currency-normalization problem to design around.

Two decisions were made explicitly with the user before design:

1. **The merchant picker is removed from Otto's UI entirely** (not kept as an optional
   filter). Otto always searches every Frontage-enabled merchant.
2. **A merchant's Frontage (Diagnose) score acts as a tiebreaker.** When multiple
   products from different merchants are similarly good matches for a goal, Otto should
   prefer the one from the higher-scored merchant. This is the single most direct,
   literal way to demonstrate the product's real value proposition inside a live
   purchase decision, not just as a static score on a dashboard.

## Scope

**In scope:**
- A new `discover()` function in `backend/app/agents/buyer.py` that reasons over every
  merchant with a published manifest in one LLM call, using the existing Groq client.
- Extracting `shop()`'s branch-handling logic (validate LLM status, check candidates,
  log, hand off to `attempt_purchase`) into a shared helper both `shop()` and
  `discover()` call, so behavior isn't duplicated or allowed to drift between them.
- A new `POST /buyer-agent/discover` endpoint.
- Otto's frontend (`OttoChat.jsx` and the small components it renders) switching from
  per-merchant to cross-merchant, including merchant attribution wherever a product is
  shown.

**Explicitly out of scope:**
- Any OpenRouter/dual-provider integration (see above — not needed at current or
  planned scale).
- Any change to `shop()`'s existing single-merchant behavior or its `/buyer-agent/shop`
  endpoint — both stay exactly as they are today, unused by Otto's frontend going
  forward, but preserved (e.g. for a possible future merchant-console "preview as Otto"
  tool that was discussed but not scoped as part of this work).
- Any change to `attempt_purchase()`, the mandate-gating logic, or Transact — cross-merchant
  discovery only changes *how a product is found*, not how a purchase is gated or paid
  for. `attempt_purchase()` already resolves whichever merchant's own mandate applies
  once a specific `catalog_item_id` is chosen, regardless of how that item was
  discovered — confirmed during design, no change needed there.
- A two-phase ("narrow candidate merchants first, then reason in detail") search
  architecture. Not needed given the token-budget findings above; noted here only as
  the natural next step if the merchant count someday grows far past what's planned.

## Backend design

### `_manifest_products()` stays merchant-scoped; a new aggregator wraps it

`_manifest_products(db, merchant)` (in `buyer.py`) is unchanged — it already returns a
list of per-product dicts (id, name, description, price, currency, availability,
variant_info, image_url, image_urls) for one merchant's published manifest. A new
function, `_all_discoverable_products(db)`, loops over every `Merchant` that has at
least one `CatalogManifest` row, calls `_manifest_products` for each, and tags every
resulting product dict with three additional keys: `merchant_id`, `merchant_name`, and
`merchant_score`. A merchant's score comes from its latest `DiagnosticReport.score`
(ordered by `timestamp` descending); a merchant with a manifest but no diagnostic
history yet gets `merchant_score: None` (the prompt instruction below treats a missing
score as neutral, never as zero — a merchant simply hasn't been scored yet is not the
same as a merchant scoring badly). Merchants with no published manifest are skipped
entirely — silently invisible, exactly matching the existing "not agent-readable, not
found" narrative already established by the single-merchant flow.

### Shared resolution helper replaces `shop()`'s inline branch logic

`shop()` today: fetches one merchant's products, builds a prompt, calls the LLM, then
inline-handles five possible outcomes (`ambiguous`, `need_more_info`, `no_match`,
`invalid_selection`, `match` → `attempt_purchase`). That branch-handling logic doesn't
care where the product list came from. It's extracted into a private helper,
`_resolve_goal(db, goal, history, products, default_merchant_id=None)`, taking an
already-assembled `products` list (regardless of source) plus an optional
`default_merchant_id` used for logging when the caller already knows a single merchant
(the `shop()` case) — `discover()` passes `None` there, since no single merchant is known
until a product actually resolves.

`shop(db, merchant, goal, history=None)` becomes a thin wrapper: check `merchant` has a
published manifest (unchanged `no_manifest` early return), call
`_manifest_products(db, merchant)`, then `_resolve_goal(db, goal, history, products,
default_merchant_id=merchant.id)`. Its return shapes, its `no_manifest` status, and every
existing test in `test_buyer.py` must keep passing unmodified — this is the regression
signal that the extraction didn't change `shop()`'s behavior.

`discover(db, goal, history=None)` is the new entry point: call
`_all_discoverable_products(db)`; if empty, return `{"status": "no_merchants",
"agent_action_id": <id>}` (logged the same way `no_manifest` is today, just without a
specific merchant). Otherwise call `_resolve_goal(db, goal, history, products,
default_merchant_id=None)`.

### Logging with no single merchant

`_log()` (unchanged signature) already accepts a nullable `merchant_id` — no schema
change needed. Inside `_resolve_goal`, the reasoning-log call for `ambiguous`,
`need_more_info`, `no_match`, and `invalid_selection` uses `default_merchant_id` (which
is `None` for a `discover()` call, or the real id for a `shop()` call). Once a `match` is
resolved, the log call for that specific action uses the *selected product's own*
`merchant_id` if present (i.e. from `discover()`'s tagged products) falling back to
`default_merchant_id` otherwise (the `shop()` case, where every product already carries
the same single merchant implicitly). `attempt_purchase()` itself is untouched and
already logs its own `AgentAction` under the correct merchant via the resolved
`catalog_item_id` — nothing there needs to change.

### Prompt changes

`_compact_for_prompt()` gains an optional inclusion of `merchant_name` and
`merchant_score` per product (present when called from `discover()`, absent — as today —
when called from `shop()`, so the single-merchant prompt shape is byte-for-byte
unchanged). `SYSTEM_PROMPT` gains one additional instruction, appended after the
existing candidate-selection guidance: when products from different merchants are
similarly good matches for the goal, prefer the one from the merchant with the higher
`merchant_score`; treat a missing score as neutral, not as a low score. The existing
four response shapes (`match` / `ambiguous` / `need_more_info` / `no_match`) are
unchanged; `candidate_ids` and `selected_item_id` still just refer to catalog item ids,
which remain globally unique (UUIDs) regardless of merchant, so no id-collision handling
is needed across merchants.

### New endpoint

`backend/app/schemas/__init__.py`: new `DiscoverGoalIn(goal: str, history: list[ConversationTurnIn] = [])`
(reuses the existing `ConversationTurnIn`). `backend/app/routers/buyer.py` gets a new
route, `POST /buyer-agent/discover`, thin wrapper calling `discover(db, body.goal,
history)` and committing, mirroring the existing `/buyer-agent/shop` handler exactly.
The existing `ShoppingGoalIn`/`/buyer-agent/shop` route is untouched.

## Frontend design (`frontend/src/pages/shop/OttoChat.jsx` and siblings)

- **Merchant picker removed.** The `<select>` currently rendered in Otto's header
  (reading from `useMerchants()`) is deleted from this page only. `MerchantContext`
  itself, and its use in the merchant console pages (`Diagnose`, `Fix`, `Connect`,
  `Settings`, `Trail`), is untouched.
- **`api.js`**: new `discover: (goal, history = []) => request('/buyer-agent/discover', {method: 'POST', body: JSON.stringify({goal, history})})`, alongside the existing (kept, unused-by-Otto-going-forward) `buyerShop`.
- **`send()`** calls `api.discover(asked, buildHistory(turns))` instead of
  `api.buyerShop(merchantId, asked, buildHistory(turns))`. `buildHistory` itself is
  unchanged.
- **Hero copy and composer placeholder** drop the merchant name: "I can read every
  agent-ready store's catalog the way a machine reads it…" / "What are you looking
  for?" (no `at {merchantName}` suffix).
- **Suggested-goal chips**: `suggestGoals(catalog)` currently derives three example
  goals from one fetched merchant's catalog (`api.getCatalog(merchantId)`, no longer
  meaningful without a single selected merchant). Replaced with a small fixed set of
  generic example goals (e.g. "find something under 1000 rupees", "I want a striped
  t-shirt") that don't reference any specific store or product. The `catalog`
  state/fetch tied to `merchantId` is removed from this page entirely.
- **Merchant attribution.** Every place a product is rendered now shows which merchant
  it's from:
  - `ProductCard`: a small merchant-name line/pill near the price.
  - The disambiguation list and `SpecCompare`'s table: a merchant-name row/column.
  - `Outcome`: already says "Order placed with {merchantName}" — currently reads
    `merchantName` from page-level context; changes to read it off the resolved
    `selected_product`/candidate object instead (which now always carries
    `merchant_name` from the backend).
  - `differentiators()` (used to tag disambiguation options): when two candidates would
    otherwise be visually identical (today's fallback is a catalog-id suffix, for the
    rare same-name-same-price-same-merchant case), a cross-merchant tie is far more
    likely just to be two *different* merchants selling similarly-described products —
    so the fallback tag becomes the merchant name first, catalog id only as a last
    resort if two candidates are additionally from the *same* merchant.
- **Unchanged mechanically**: `pick()`, `confirmPurchase()`, `AddressConfirm`, the
  delivery-estimate line, the payment-status polling, and the voice-input mic button —
  all already operate on a single resolved candidate/purchase object and don't care
  where it came from. They pick up `merchant_name` for display "for free" once the
  backend tags every product with it.

## Testing plan

Backend (TDD, `backend/tests/`, matching existing conventions — `unittest.mock.patch.object`
on `get_client`, shared fixtures in `conftest.py`):
- `_all_discoverable_products` combines products from multiple merchants, each tagged
  with its own `merchant_id`/`merchant_name`/`merchant_score`.
- A merchant with no published manifest is absent from the combined list.
- `discover()` returns `no_merchants` when nothing is published anywhere.
- The LLM prompt built by `discover()` actually contains both merchants' scores
  (inspecting `call_args`, same pattern already used for the conversation-history tests)
  — this is the honest limit of what's unit-testable here: the *real* model's judgment
  isn't something a mocked test can verify, only that it was given the right
  information to make that judgment on.
- A `match` resolved via `discover()` logs its `AgentAction` under the selected
  product's actual merchant, not `None`.
- The full existing `test_buyer.py` suite passes unmodified after the `_resolve_goal`
  extraction — the regression signal that `shop()`'s behavior didn't change.
- A new router test for `/buyer-agent/discover`, mirroring `test_buyer_router.py`.

Live verification: a real query against the live catalog for something two merchants
plausibly both sell, confirming correct cross-merchant attribution end to end and
inspecting the real `AgentAction.reasoning` for evidence the score-tiebreaker
instruction was followed when candidates were close. Frontend: `vite build` clean, plus
a full live walkthrough (search → disambiguate/compare across merchants → address
confirm → checkout) with no merchant picker anywhere in the flow.

## Verification

- All items in the Testing plan above pass.
- `shop()` and `/buyer-agent/shop` remain fully functional and unchanged in behavior
  (existing tests are the proof).
- Otto's UI never shows a merchant picker, and every product/result it shows names its
  merchant.
- No `OPENROUTER_API_KEY` code path is added as part of this work.
