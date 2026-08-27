# Frontage — Project Specification & Build Context

**Prepared for:** Razorpay AI Buildathon 2026 — Track 01: AI Growth & Agentic Commerce
**Purpose of this document:** This is the single source of truth to hand to Claude Code (or any builder) as context before writing a line of code. It defines the problem, the product, what's in and out of scope, the architecture, the data model, the agent design, and exactly how this will be judged and demoed. Every build decision should be checked against this doc — if a feature doesn't trace back to something in here, it's probably drift.

> Product name: **Frontage**. Tagline: *"Give your merchant a storefront AI agents can actually see — and shop from."* (Named for the real-estate term for a shop's street-facing visibility — the digital equivalent, built for AI agents instead of foot traffic.)

---

## 1. Track Alignment (read this first, check against it constantly)

This section exists so the build never drifts off the actual brief. Quoted directly from the official track card:

> **Track 01 — AI Growth & Agentic Commerce**
> Grow the merchant's revenue, and make them sellable to AI buyers.
> Build an agent that grows revenue for a merchant on Razorpay test-mode APIs, or that makes a merchant transactable by an AI buyer end to end.
>
> **Why now:** NPCI's UAP and the global protocol race (ACP, AP2, x402) make agent-to-agent commerce the open problem of the year, and Razorpay's in-app pilots are already live.
>
> **Example directions:** Conversational in-app checkout · Agent-readable catalog · Upsell & cross-sell agent · Campaign orchestrator
>
> **The bar:** Every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully.

**How Frontage maps to this, explicitly:**

| Track requirement | Frontage component |
|---|---|
| "makes a merchant transactable by an AI buyer end to end" | The Transact phase — a simulated AI buyer agent discovers a product and completes a real Razorpay test-mode order |
| "Agent-readable catalog" (example direction) | The Fix phase — auto-generated structured catalog manifest |
| "grows revenue for a merchant" | The Diagnose phase quantifies revenue left on the table from being AI-invisible; Fix + Transact close that gap |
| "Every money action explainable, bounded and gated" | Every Transact-phase action is logged with reasoning, has a hard spend ceiling, and requires a pre-set mandate before firing |
| "Show the audit trail and one failure handled gracefully" | A dedicated Audit Log view + one deliberately engineered failure case (see §9) |

**Submission format** (from the site's "What we read instead of your resume" section — treat this as the actual grading rubric):
- A repo that **actually runs** — not a slide deck, not mocked screenshots. Every phase must be runnable end to end on a fresh clone.
- A **5-minute video** of it working.
- **"What broke at 2 AM, and how you got out"** — the submission explicitly wants a real failure story, not a polished happy path. Do not hide bugs; document one and show the recovery. See §9 and §11.

**Guardrail for Claude Code:** if an implementation idea doesn't serve the Diagnose → Fix → Transact loop, or doesn't help demonstrate "explainable, bounded, gated" money actions, treat it as scope creep and cut it, no matter how interesting it is. This buildathon is scored on a working repo + honest demo, not on breadth of features.

---

## 2. Problem Statement

**Who has the problem:** Small and mid-size merchants who accept payments via Razorpay (long-tail D2C, local retail, service businesses) — not the handful of large enterprise merchants (Zomato, Swiggy, Zepto) who already have bespoke agentic-payment integrations with Razorpay.

**The problem, in one sentence:** These merchants are structurally invisible to AI shopping agents (ChatGPT, Gemini, Claude, and whatever comes next) because their product data isn't structured for machines to read, and even if an agent found them, there's no safe, bounded way for that agent to actually complete a purchase.

**Why this is real, not hypothetical** (with honest caveats — see §12 for full sourcing and confidence levels):

- Indian MSMEs are not resistant to going digital — only ~half are on e-commerce at all, and among those who aren't, **43% cite lack of knowledge about digital platforms** as the reason, not cost (ICRIER survey of 2,007 registered MSMEs). This is a knowledge/tooling gap, not a demand gap.
- Where Indian SMBs have adopted AI, it's working: **78% of Indian SMBs use or experiment with AI**, and **93% of those report it boosted income** (Salesforce-backed survey via IndiaAI).
- AI-agent-driven shopping is a real and fast-growing behavior — **US** AI-referred retail traffic grew 138% YoY (May 2026) and converts 54% better than non-AI traffic (Adobe). Morgan Stanley projects agentic commerce could capture 10–20% of US online retail by 2030.
- **Important honest gap:** there is no equivalent India-specific data proving AI shopping agents are already driving Indian consumer purchases at scale — because the infrastructure (agent-readable catalogs, agent-safe checkout) largely doesn't exist yet for anyone but a few enterprise pilots. Frontage's bet is that this infrastructure gap is the blocker, not lack of consumer interest. This is a bet on the trend arriving, argued from the US precedent + Razorpay's own "why now," not a proven India fact — say so plainly in the pitch, don't imply otherwise.
- Razorpay's own agentic payments pilot (UPI Reserve Pay, via Claude, with NPCI) currently covers exactly **three merchants**: Zomato, Swiggy, Zepto. Razorpay reports serving **8M+ businesses** (as of a 2023 figure — likely larger now, treat as a floor not a current count). The gap between "3 merchants wired up" and "8M+ merchants on the platform" is the whitespace.
- Existing "AI visibility" tooling (the GEO/Generative Engine Optimization category — Semrush, Profound, Otterly, Peec AI, Scrunch, Evertune, etc.) is priced in USD ($29–$800+/month) for a global/enterprise buyer, and none of it targets India or the SMB long tail, and — critically — almost all of it only *reports* a visibility score. Nobody *fixes* it and nobody closes the loop into an actual transaction.

**The JTBD framing:** *A small merchant on Razorpay hires Frontage to make their store discoverable and safely purchasable by AI shopping agents, without needing to hire an engineer or understand UCP/ACP/AP2 themselves.*

---

## 3. Product: Diagnose → Fix → Transact

Three phases, each a distinct, demoable capability, chained into one agent workflow.

### Phase 1 — Diagnose
An audit agent looks at a merchant's existing Razorpay-connected store/product data and scores how "agent-readable" it currently is. Concretely, it checks for things like:
- Do products have structured, complete descriptions (not just a name + price)?
- Is there any machine-readable feed/manifest an AI agent could fetch at all?
- Are prices, availability, and variants unambiguous and current?
- Is there any programmatic checkout endpoint an agent could call, or does purchase require a human clicking through a UI?

Output: a **Diagnostic Report** — a score plus a specific, itemized list of gaps ("12 of 40 products have no description," "no agent-readable feed found," "no programmatic checkout available"). This report is what makes the revenue-growth argument concrete in the demo: "here is exactly why this merchant is invisible to an AI buyer, and here is what closing each gap is worth."

### Phase 2 — Fix
A generation agent takes the diagnostic gaps and **auto-produces** the missing pieces, using only data the merchant already has in Razorpay/their store — no manual data entry required from the merchant:
- A structured, agent-readable **catalog manifest** (product name, description, price, currency, availability, variant info, a stable product ID) exposed at a predictable, fetchable location — conceptually similar to how UCP proposes a `/.well-known/` style manifest, though Frontage does not need to claim UCP-conformance, just agent-readability.
- Cleaned-up / auto-generated product descriptions where the source data is too thin (LLM-assisted, clearly flagged as generated so the merchant can review before publishing).

Output: a live, fetchable catalog manifest + an updated Diagnostic Report showing the score improvement.

### Phase 3 — Transact
This is the phase that satisfies "the bar." A demo **AI buyer agent** (built by us, standing in for a real third-party shopping agent like ChatGPT or Gemini) is given a shopping goal in natural language (e.g., "find a blue cotton shirt under ₹1500"). It:
1. Fetches the Phase 2 catalog manifest and reasons over it to pick a matching product.
2. Requests to purchase — but only within a **pre-set mandate**: a spend ceiling and a merchant allow-list configured by a human ahead of time (deliberately mirroring the spirit of Razorpay's own UPI Reserve Pay: "AI can act decisively, but never independently of the user's intent").
3. If within bounds, the Transact agent calls Razorpay's **test-mode Orders API** (and/or Payment Links API) to create and complete a real (test-mode) transaction.
4. Every step — reasoning, decision, amount, gate check, API call, result — is written to an **Audit Log** that's visible in the UI in plain language, not just raw JSON.
5. If the request would breach the mandate (over spend limit, merchant not allow-listed, price mismatch between what the agent expected and what checkout returned, item out of stock), the agent **fails gracefully**: it stops, logs exactly why, and reports back to the buyer agent instead of silently succeeding or crashing. This is the "one failure handled gracefully" the bar asks for — see §9 for which specific failure to build and demo.

---

## 4. Users

- **Primary customer (the one who "hires" the product):** A small-to-mid Razorpay merchant with an existing product catalog but little/no engineering capacity — e.g. a D2C seller, local retailer, or service business already taking payments through Razorpay.
- **Secondary actor (not a paying customer, but essential to the demo):** An AI buyer agent acting on behalf of an end consumer. For the buildathon, this is simulated in-house (see §8) since we won't have live access to ChatGPT's/Gemini's actual shopping-agent internals in test mode — be explicit about this in the architecture doc and demo narration, don't imply a real third-party integration that doesn't exist.
- **Implicit audience:** the buildathon judges, who are reading this as a "would this actually work for our merchant base" evaluation, and — per the site's own "what we read instead of your resume" framing — expect a working repo and an honest account of what broke, not a polished fiction.

---

## 5. Explicit Scope: In and Out

Keeping this list visible is the main defense against drift. If Claude Code (or you) is about to build something not on the left, stop and ask whether it belongs.

**In scope:**
- Diagnose: catalog audit + scoring against a defined rubric (see §7 data model for what's checked)
- Fix: auto-generated agent-readable catalog manifest, served at a fetchable endpoint
- Transact: simulated AI buyer agent + Razorpay test-mode Orders/Payment Links integration, with mandate-based spend gating
- Audit log UI showing every agent decision in plain language
- One deliberately engineered, gracefully-handled failure case, documented for the "what broke at 2 AM" narrative
- A minimal merchant-facing dashboard showing: diagnostic score, generated manifest, live audit trail, and a "before/after" revenue-opportunity framing

**Out of scope (do not build, even if it seems related):**
- Real production payments — everything runs on Razorpay **test-mode** keys, always. Never wire in live-mode credentials.
- Actual integration with a real third-party AI shopping agent (OpenAI's ACP, Google's AP2/UCP, etc.) — simulate it, and say so.
- Full UCP/ACP/AP2 protocol conformance/certification — borrow the *concept* (structured, fetchable, agent-readable catalog; mandate-gated payment) without chasing spec compliance, which is a multi-month standards effort, not a buildathon deliverable.
- General-purpose GEO/SEO tooling (rank tracking, content marketing, backlink analysis) — that's the crowded, already-solved-elsewhere category we're explicitly differentiating from; stay narrow to catalog-readability + transaction-completion.
- Multi-merchant marketplace features, merchant-to-merchant discovery, or anything that turns this into "a new storefront platform" — Frontage augments a merchant's existing Razorpay presence, it doesn't replace it.
- Fraud/risk/chargeback features (that's the Risk Manager track, not this one) — the only "risk" control we build is the spend mandate/gating for the Transact agent, nothing broader.
- Reconciliation, forecasting, settlement reporting (that's Finance Controller) — do not let Phase 1's "audit" language drift into a finance-ops audit; it is strictly a *catalog/discoverability* audit.

---

## 6. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Merchant Dashboard (UI)                      │
│   Diagnostic score & gaps · Generated manifest preview · Audit log   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │        Backend API        │
                    │      (FastAPI, Python)     │
                    └───┬───────────┬───────────┬┘
                        │           │           │
            ┌───────────┘   ┌───────┘   ┌───────┘
            ▼               ▼           ▼
    ┌───────────────┐ ┌─────────────┐ ┌────────────────────┐
    │ Diagnose Agent │ │  Fix Agent  │ │   Transact Agent    │
    │ (audit + score)│ │ (generate   │ │ (mandate-gated,     │
    │                │ │  manifest)  │ │  calls Razorpay API)│
    └───────┬────────┘ └──────┬──────┘ └──────────┬──────────┘
            │                 │                    │
            ▼                 ▼                    ▼
    ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
    │ Merchant/     │  │ Catalog        │  │ Razorpay Test-Mode│
    │ Catalog store │  │ Manifest       │  │ Orders/Payment    │
    │ (seed data or │  │ (served at a   │  │ Links API         │
    │ Razorpay data)│  │ fetchable URL) │  │                   │
    └──────────────┘  └────────────────┘  └──────────┬────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │   Audit Log store   │
                                            │ (every agent action,│
                                            │  reasoning, result) │
                                            └──────────┬──────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │  Simulated AI Buyer │
                                            │  Agent (demo-only)  │
                                            │  browses manifest → │
                                            │  requests purchase  │
                                            └─────────────────────┘
```

**Data flow in one sentence:** Merchant catalog data → Diagnose Agent scores it → Fix Agent turns gaps into a published manifest → simulated AI Buyer Agent reads the manifest and requests a purchase → Transact Agent checks the request against a mandate, calls Razorpay test-mode APIs if allowed, and writes every step to the Audit Log → Dashboard renders the score, the manifest, and the audit trail live.

---

## 7. Suggested Tech Stack

Picked for fit to what this system actually needs to do, not for familiarity — this is a different problem shape than past projects (three chained agents doing tool-calling and reasoning, a manifest that has to be served and re-fetched, an audit trail that has to be trustworthy), so the stack should be justified on its own terms. Where a past-project choice happens to also be the right tool for this job, that's a nice bonus, not the reason to pick it.

- **Backend:** FastAPI (Python) — justified independent of past use: strong async support for the I/O-heavy parts of this system (calling an LLM, calling Razorpay, serving the manifest endpoint can all happen concurrently), good typed-request/response validation via Pydantic which is genuinely useful for a system whose whole premise is "structured, machine-readable data," and a mature ecosystem for background jobs if the Diagnose/Fix agents need to run asynchronously. Python is also the path of least friction if the agent layer is built with the Claude Agent SDK (see LLM/agent layer below).
- **Frontend:** React + Vite — justified by the actual UI need: the dashboard has to show *live-updating* state (diagnostic score changing, manifest regenerating, audit log streaming in during the Transact demo), which React's component model and a fast Vite dev loop handle well; a simpler static-site approach would fight against that requirement.
- **LLM / agent layer:** worth deliberately reconsidering rather than defaulting. Options, with real tradeoffs:
  - **Claude (via the Claude Agent SDK or Anthropic API)** — worth serious consideration specifically *because* Razorpay's own Agent Studio is built on the Claude Agent SDK (see §12 sourcing); building the Diagnose/Fix/Transact agents the same way signals technical alignment with how the host company itself builds agents, which is a legitimate pitch point, not just a technical one. Also a natural fit since the build itself is being done with Claude Code.
  - **Gemini / Groq / OpenRouter** — cheaper/faster for the higher-volume, lower-stakes calls (e.g. bulk description generation in the Fix phase), and there's known integration experience to draw on there if a call needs to happen fast rather than needing the most rigorous reasoning.
  - A reasonable split: use whichever model is strongest at careful, explainable reasoning for the Transact Agent specifically (since its decisions are the ones judged on "explainable, bounded, gated"), and use a cheaper/faster model for bulk Fix-phase content generation where the bar is lower.
- **Database:** lightweight — Postgres or SQLite; the data model in §8 is small enough that either works for a buildathon timeframe. Don't over-invest in infra choice here regardless of which one is picked.
- **Payments:** Razorpay **test-mode** API keys only — this one is not a choice, it's the track's requirement. Core endpoints to build against:
  - **Orders API** — create an order for a specific amount tied to a specific catalog item; this is the core "transact" call.
  - **Payment Links API** — an alternative/complementary path to actually complete a payment against an order without building a full checkout UI; useful for making the demo concretely show money moving in test mode.
  - Sandbox/test setup via Razorpay's documented Test Mode API key generation flow.
  - Note: Razorpay does **not** provide a native product-catalog API — that absence is precisely the gap Frontage's manifest-generation step fills. Don't go looking for a Razorpay catalog endpoint that doesn't exist; the catalog is something *we* build and host, referencing Razorpay only for the payment-execution leg.
- **Deployment (demo):** Vercel (frontend) + Render or similar (backend) — justified by the demo's needs: both offer fast redeploys during iteration and free/cheap tiers sufficient for a buildathon-scale demo; swap either out if the final agent-framework choice pulls toward a different host.

---

## 8. Data Model (minimum viable)

- **Merchant** — id, name, Razorpay account reference (test-mode), catalog source
- **CatalogItem** — id, merchant_id, name, description, price, currency, availability, variant info, `agent_readable: bool`, `source: manual | generated`
- **DiagnosticReport** — id, merchant_id, timestamp, score, list of gap objects (`{check_name, status, detail}`)
- **CatalogManifest** — id, merchant_id, version, generated_at, URL/endpoint it's served at, list of CatalogItem references
- **Mandate** — id, merchant_id (or global demo default), spend_ceiling, allow-listed merchants, created_by, created_at — this is the human-set boundary the Transact Agent must respect
- **AgentAction** (the Audit Log) — id, agent_name (Diagnose/Fix/Transact/BuyerAgent), timestamp, reasoning (plain language), action_taken, input, output, result (`success | blocked | failed`), linked Mandate check if relevant
- **Transaction** — id, merchant_id, catalog_item_id, amount, razorpay_order_id, razorpay_payment_link_id, status, linked AgentAction

---

## 9. The Deliberate Failure (for "what broke at 2 AM")

The submission format explicitly wants a real failure story, and "the bar" explicitly requires "one failure handled gracefully" — so this isn't optional polish, it's a graded requirement. Pick **one** of these, build it deliberately, and document it honestly in the repo README and the pitch video:

- **Spend-ceiling breach:** Buyer Agent tries to purchase an item priced above the Mandate's spend ceiling → Transact Agent blocks the call before it reaches Razorpay, logs the reasoning ("requested ₹X exceeds mandate ceiling of ₹Y"), and returns a clear denial to the Buyer Agent instead of silently failing.
- **Price/availability drift:** the manifest says a product is ₹999, but by the time the Transact Agent goes to create the order, the merchant's underlying catalog has changed (price update or stock-out) → Transact Agent detects the mismatch, halts before charging, logs it, and surfaces a "re-confirm" step instead of charging the stale price.
- **Razorpay API failure/timeout:** simulate a failed or slow response from the test-mode API → Transact Agent retries within a bounded limit, then fails closed (no partial charge, no silent retry loop) and logs the failure clearly.

Recommendation: build the **spend-ceiling breach** first (it's the simplest to make deterministic and demo live), and add price/availability drift as a stretch if time allows — it tells a slightly richer story about real-world data staleness.

---

## 10. Demo / Pitch Video Structure (5 minutes)

Map directly to the three phases so judges can follow the JTBD story without narration overload:

1. **Cold open — the problem (30–45s):** show a real (or realistic) small merchant's current storefront/catalog data — no structure, no way for an AI agent to read it. State the JTBD line: *"this merchant hired nobody to make them AI-discoverable, because nobody offers that."*
2. **Diagnose (45–60s):** run the audit live, show the score and the itemized gap list.
3. **Fix (45–60s):** show the generated manifest appear, score improve, and briefly show what the manifest actually looks like (structured, fetchable).
4. **Transact (90s):** the simulated Buyer Agent is given a shopping goal, browses the manifest, requests a purchase, gets approved within mandate, and a real Razorpay test-mode order completes — audit log visible throughout.
5. **The failure, on purpose (45–60s):** trigger the deliberate failure case from §9 live, show it get caught, logged, and handled without a silent crash or a wrongful charge. This is the moment that answers "what broke at 2 AM, and how you got out" — don't cut it for time, it's explicitly what's being graded.
6. **Close (15s):** revenue-opportunity framing — tie back to the Diagnose score improvement and what it represents for the merchant.

---

## 11. Build Sequencing (phase-based, adjust to actual days remaining)

1. **Foundation:** seed data for 1–2 realistic merchant catalogs (deliberately messy/incomplete, to make Diagnose meaningful); Razorpay test-mode account + API keys wired up; basic FastAPI + React skeleton.
2. **Diagnose Agent:** define the rubric (§3), implement scoring + gap detection, render the Diagnostic Report in the UI.
3. **Fix Agent:** manifest generation from catalog data + LLM-assisted description fill-in, served at a fetchable endpoint, re-run Diagnose to show score improvement.
4. **Transact Agent + Mandate gating:** Orders/Payment Links integration in test mode, mandate config, Audit Log wiring.
5. **Simulated Buyer Agent:** natural-language shopping goal → manifest reasoning → purchase request.
6. **The deliberate failure (§9):** build and verify it triggers reliably and is demoable live — do not leave this for the last hour.
7. **Polish + record:** dashboard pass, README with architecture + "what broke" writeup, 5-minute video per §10.

---

## 12. Sources for Claims Used in This Doc (confidence levels noted)

- Razorpay track brief — Track 01 card, official buildathon site (primary source, verbatim quoted in §1).
- Razorpay Agentic Payments product page, [razorpay.com/agentic-payments](https://razorpay.com/agentic-payments/) — UPI Reserve Pay description, live pilot scope.
- Razorpay/NPCI announcement, [razorpay.com/blog/agentic-payments-and-npci](https://razorpay.com/blog/agentic-payments-and-npci/) — confirms pilot is limited to Zomato, Swiggy, Zepto, "closed user group."
- Razorpay Agent Studio, [razorpay.com/blog/agent-studio-ai-agents-by-razorpay](https://razorpay.com/blog/agent-studio-ai-agents-by-razorpay/) — confirms existing pre-built agents are ops-side (disputes, recovery, RTO, cashflow), not catalog/growth-side — supports the whitespace claim.
- Razorpay Business Breakdown, [research.contrary.com/company/razorpay](https://research.contrary.com/company/razorpay) — 8M+ businesses figure, dated Feb 2023; **stated in this doc as a floor, not a current number** — flag this if a judge asks for a fresher figure.
- ICRIER Annual Survey of MSMEs in India, [icrier.org/pdf/E-commerce_MSME_Annual-Survey.pdf](https://icrier.org/pdf/E-commerce_MSME_Annual-Survey.pdf) — 50% e-commerce integration, 43.1% cite knowledge gap. Credible source (policy research institute), survey-based, moderate sample size (2,007 firms) — reasonably solid.
- Salesforce/IndiaAI SMB AI adoption report, [indiaai.gov.in/article/78-of-indian-smbs-leverage-ai-for-business-success-salesforce-report](https://indiaai.gov.in/article/78-of-indian-smbs-leverage-ai-for-business-success-salesforce-report) — 78%/93% figures. Vendor-adjacent survey (Salesforce) — treat as directionally credible, not independently audited.
- Adobe AI-referred traffic data via Digital Commerce 360, [digitalcommerce360.com/2026/06/17/adobe-ai-referred-traffic-to-retail-sites-doubles-in-a-year](https://www.digitalcommerce360.com/2026/06/17/adobe-ai-referred-traffic-to-retail-sites-doubles-in-a-year/) — **US-only data**, do not present as India evidence.
- Morgan Stanley agentic commerce outlook, [morganstanley.com/insights/articles/agentic-commerce-market-impact-outlook](https://www.morganstanley.com/insights/articles/agentic-commerce-market-impact-outlook) — **US-only projections** ($190B–$385B by 2030, 10–20% of US online retail).
- GEO tools competitive landscape, [semrush.com/blog/best-generative-engine-optimization-tools](https://www.semrush.com/blog/best-generative-engine-optimization-tools/) — pricing/positioning of Semrush, Otterly, Profound, Peec AI, Scrunch, Evertune, etc.; confirms none target India/SMB.
- Razorpay API docs, [razorpay.com/docs/api](https://razorpay.com/docs/api/) and Payment Links docs, [razorpay.com/docs/api/payments/payment-links](https://razorpay.com/docs/api/payments/payment-links/) — confirms Orders/Payments/Payment Links/Refunds/Settlements/Subscriptions as the actual API surface, and that there is no native catalog API.

**Open items to validate before the pitch, not yet independently confirmed:**
- A current (2026) count of Razorpay's active SMB merchant base, ideally split by size — the 8M figure is stale.
- Direct India-specific evidence of AI-agent-driven consumer purchases (currently arguing from US precedent + Razorpay's own "why now" framing, not from India data).
- Exact field-level schema for Payment Links API creation (amount, description, notes, expiry) — confirm against live API docs when integrating, this doc only confirms the endpoint exists and its general purpose.

---

*End of spec. Hand this whole file to Claude Code as project context (e.g. drop it in the repo root as `PROJECT_SPEC.md` or reference it from `CLAUDE.md`) before starting implementation.*
