# Frontage

*"Give your merchant a storefront AI agents can actually see — and shop from."*

Razorpay AI Buildathon 2026 — Track 01: AI Growth & Agentic Commerce. Full problem framing,
scope, and rationale live in [PROJECT_SPEC.md](PROJECT_SPEC.md); this file covers running the
project and what actually works.

**Status: all three phases (Diagnose → Fix → Transact) built and verified live**, including a
real Razorpay test-mode order created by the simulated Buyer Agent, and the deliberate
spend-ceiling-breach failure case triggering correctly through that same natural path.

**Live demo:** https://frontage-frontend.vercel.app

## What it does

1. **Diagnose** — audits a merchant's catalog against a 4-check agent-readability rubric
   (description quality, agent-readable manifest, price/availability clarity, programmatic
   checkout) and produces a score + itemized gaps.
2. **Fix** — auto-generates missing product descriptions with an LLM (flagged `generated`,
   held for human approval), then publishes a structured, versioned, fetchable catalog manifest.
   Re-running Diagnose after a publish shows the score improve.
3. **Transact** — a simulated Buyer Agent is given a natural-language shopping goal, reasons
   over the published manifest with an LLM to pick a product, then hands off to a Transact
   Agent that checks the request against a human-set mandate (merchant allow-list, spend
   ceiling, live price match, stock) before ever calling Razorpay. Every step — success or
   blocked — is written to an audit log in plain language.

Beyond the two seeded demo merchants, **a real merchant's live catalog can be imported** from
their public Shopify storefront feed and run through the exact same pipeline — see
[Importing a real store](#importing-a-real-store) below.

## Architecture

```
Merchant catalog (seed data)
        │
        ▼
  Diagnose Agent ──── scores + gaps ────► Dashboard
        │
        ▼
    Fix Agent ──── LLM description fill-in (Groq) ────► pending approval
        │
        ▼
  published CatalogManifest ──── GET /merchants/{id}/manifest.json (fetchable)
        │
        ▼
   Buyer Agent ──── LLM reasoning over manifest (Groq) ────► picks a product
        │
        ▼
  Transact Agent ──── mandate gate (allow-list → ceiling → price → stock) ────┐
        │                                                                     │
   all checks pass                                                    any check fails
        │                                                                     │
        ▼                                                                     ▼
 Razorpay test-mode Orders + Payment Links API              blocked before any Razorpay call
        │                                                                     │
        └──────────────────────► AgentAction audit log ◄──────────────────────┘
                                          │
                                          ▼
                                    Audit Log UI (live)
```

Backend: FastAPI + SQLAlchemy + SQLite. Frontend: React + Vite. LLM: Groq (free tier — see
[what broke](#what-broke-at-2-am) for why it's Groq and not Claude). Payments: Razorpay
test-mode Orders + Payment Links APIs.

## Project layout

```
backend/    FastAPI app — models, agents (diagnose/fix/transact/buyer), routers, seed data
frontend/   React + Vite dashboard (Dashboard / Manifest / Buyer Agent / Audit Log)
```

## Prerequisites

- Python 3.11+
- Node 18+
- A Razorpay account with **test-mode** API keys (Settings → API Keys → Test Mode)
- A Groq API key (free, no card required — [console.groq.com](https://console.groq.com)), used
  by the Fix and Buyer agents

## Setup

1. Copy `.env.example` to `.env` at the repo root and fill in real values:
   ```bash
   cp .env.example .env
   ```
2. Backend:
   ```bash
   cd backend
   python -m venv .venv
   .venv/Scripts/activate   # Windows; use `source .venv/bin/activate` on macOS/Linux
   pip install -r requirements.txt
   python -m app.seed.seed   # seeds two demo merchants with deliberately messy catalogs
   uvicorn app.main:app --port 8000
   ```
   (Deliberately omitting `--reload` here — see [what broke](#what-broke-at-2-am) below.)
3. Frontend (separate terminal):
   ```bash
   cd frontend
   npm install
   npm run dev -- --port 5173
   ```
4. Open http://localhost:5173 — the dashboard should list two seeded merchants
   (Bloom & Thread, Terracotta & Co) and their catalogs.

To reset to a clean demo state (undo any manifests/transactions from a previous run), re-run
the seed script — it wipes and reseeds both merchants.

### Running the backend tests

```bash
cd backend
pytest
```

Each test gets a fresh, isolated SQLite DB (never the real `frontage.db`) built from the same
engine/session factories production uses. Covers the mandate-gating logic, foreign-key
enforcement, Fix Agent failure handling, and Buyer Agent edge cases — see `backend/tests/`.

## Try it end to end

1. **Dashboard** → select a merchant → "Run Diagnose Agent" → see the score and gaps.
2. **Manifest** → "Generate missing descriptions" → approve the generated ones → "Publish
   manifest" → go back to Dashboard and re-run Diagnose to see the score improve.
3. **Buyer Agent** → try *"find a blue cotton shirt under 1500 rupees"* on Bloom & Thread — it
   should pick the Classic Blue Cotton Shirt and complete a real Razorpay test-mode order.
4. **Buyer Agent** → try *"I want the Premium Wool-Blend Jacket"* — it correctly identifies the
   product, but the Transact Agent blocks it (₹4999 exceeds the ₹1500 demo mandate) — this is
   the deliberate failure case, see below.
5. **Audit Log** → every step from all four agents, in plain language, live-polling.

## Importing a real store

**Import Store** → enter a real Shopify store's domain (e.g. `neemans.com`), a display name,
and its pricing currency → "Import store". This fetches the store's public `/products.json`
feed (a default Shopify storefront feature — not scraping, no credentials needed), creates a
new merchant from the real product data, and auto-adds it to the demo mandate's allow-list so
it's immediately transactable. The new merchant runs through the identical Diagnose → Fix →
Transact pipeline as the seeded demo data.

The importer is built as a pluggable "catalog source" (`backend/app/agents/catalog_sources/`)
so a second platform can be added later without touching the import endpoint — Shopify is the
first implementation, not the only one it's designed for.

Verified against two real, live, unrelated Indian D2C brands:
- **Neemans** (footwear) — 12 real products imported, scored **75/100** on first Diagnose (the
  only gap: no manifest yet — their real descriptions and availability data were already clean
  enough to pass on their own). After publishing a manifest: **100/100**. A Buyer Agent shopping
  goal ("find black pointed flats under 1500 rupees") correctly picked the right product and
  completed a real Razorpay test-mode order.
- **Bombay Shaving Company** — 25 products imported end to end through the UI, confirming the
  mechanism isn't tuned to one specific store.

One caveat: Shopify's public product feed doesn't expose currency, so the import form asks for
it explicitly — get it wrong and the Transact Agent's mandate-ceiling comparison won't make
sense, since amounts are compared directly with no currency conversion.

## The deliberate failure case

Per the track brief's "every money action explainable, bounded, gated — show the audit trail
and one failure handled gracefully": the demo mandate is seeded with a ₹1500 spend ceiling,
and Bloom & Thread's catalog includes a ₹4999 jacket specifically so this is reachable without
any special setup. When the Buyer Agent (or a direct `/transact/purchase` call) requests an
item over the ceiling, the Transact Agent:

- checks the mandate **before** calling Razorpay,
- refuses the purchase,
- logs exactly why (`"Requested ₹4999 exceeds mandate ceiling of ₹1500"`) as a `blocked`
  `AgentAction`,
- returns a clear denial — no crash, no partial charge, no silent no-op.

Every other gate (merchant allow-list, live price match, stock) fails closed the same way —
see `backend/app/agents/transact.py`.

## What broke at 2 AM

The build's real failure story, honestly: the original plan used Claude for the Fix and Buyer
agents. Partway through, it turned out there was no funded Anthropic account for this build —
the API needs a paid account, unlike claude.ai's free chat tier. Rather than block on that,
the two agents were swapped to Groq's free tier (the spec itself names Groq/Gemini/OpenRouter
as accepted fallbacks for exactly this kind of lower-stakes generation call, so this wasn't
scope creep, just an anticipated pivot arriving early).

The swap itself surfaced two real bugs, back to back:

1. **Stale model names.** The first model names tried (`llama-3.1-8b-instant`,
   `llama-3.3-70b-versatile`) no longer exist on Groq's current lineup — a 404
   `model_not_found`. Worse, the Fix router had no error handling around the generation call,
   so this surfaced to the user as a raw, unexplained 500 — exactly the kind of "explainable,
   bounded, gated" failure this project is supposed to model, and it wasn't, on its own
   generation path. Fixed by listing the account's actual available models via
   `client.models.list()`, switching to `openai/gpt-oss-20b` / `openai/gpt-oss-120b`, and
   wrapping the Fix Agent's generation loop so one bad item logs a failed `AgentAction` and
   degrades gracefully instead of crashing the request.

2. **Silent empty output.** Once the model names were fixed, generation "succeeded" — 200 OK,
   no error — but wrote empty-string descriptions. `gpt-oss` models spend part of their token
   budget on hidden chain-of-thought reasoning before the visible answer; at `max_tokens=100`
   the reasoning consumed the entire budget and `finish_reason` came back `"length"` with zero
   content left for the actual description. This is the more dangerous kind of failure — no
   error, no crash, just quietly wrong data — caught only by inspecting a live response instead
   of trusting a 200. Fixed with `reasoning_effort="low"` and a higher token ceiling.

A smaller, separate annoyance along the way: on Windows, `uvicorn --reload`'s
multiprocessing-based file watcher left orphaned worker processes bound to port 8000 across a
few restarts, so a stopped "old" server kept silently answering requests with stale routes
while a new one appeared to start cleanly. The setup instructions above deliberately run
without `--reload` for that reason — restart manually after backend changes.

## Known limitations

- Fix only generates missing *descriptions* — it doesn't invent availability or variant data,
  by design (inventing stock status would be dishonest, not a gap-fill).
- Payment Links created by the Transact Agent are real and payable in test mode, but this repo
  doesn't drive an actual test-card payment through them automatically — that's a manual
  browser step if you want to see a link fully paid, not part of the automated flow.
- No production deployment — this runs locally per the setup above; the submission rubric asks
  for "runs end to end on a fresh clone," which this satisfies without needing a hosted demo.
- Real-store import only covers Shopify so far, and only stores that haven't disabled their
  public `/products.json` feed. It also can't verify a store's actual payment gateway (that's
  checkout-time config, invisible from a public product feed) — picking a real Razorpay
  merchant to showcase is a curation choice, not something the importer checks or enforces.
