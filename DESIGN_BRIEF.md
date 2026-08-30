# Frontage — UI/UX Design Brief

## How to use this document

This brief is for a design session redesigning Frontage's frontend. The backend is finished and
working; **this is a frontend-only redesign.**

Read alongside:
- **[PROJECT_SPEC.md](PROJECT_SPEC.md)** — why this product exists, what's in and out of scope,
  and the 5-minute demo structure it has to support.
- **[README.md](README.md)** — how to run it, what works today, and the known limitations.

Inspiration screenshots are supplied separately (see §12). **Where those screenshots conflict
with any aesthetic suggestion in this document, the screenshots win.** This brief fixes the
*constraints and problems*; it deliberately does not fix the palette, typography, or visual
direction.

---

## 1. What Frontage is

Small and mid-size Indian D2C merchants are structurally invisible to AI shopping agents
(ChatGPT, Gemini, and whatever comes next). Their product data isn't machine-readable, and even
if an agent found them, there's no safe, bounded way for it to complete a purchase.

Frontage fixes that in three phases:

1. **Diagnose** — audits a merchant's catalog against a 4-check rubric and scores how
   agent-readable it is (0–100), with itemized gaps.
2. **Fix** — generates missing product descriptions with an LLM (held for human approval), then
   publishes a structured, versioned, fetchable catalog feed that an AI agent can read.
3. **Transact** — a simulated AI buyer is given a natural-language shopping goal, reasons over
   that feed, picks a product, and hands off to an agent that checks the request against a
   human-set spending mandate before creating a **real Razorpay test-mode order.**

Every agent decision — success, blocked, or failed — is written to an audit log in plain
language. That audit trail and the deliberate, gracefully-handled failures are explicitly what
the buildathon grades.

This is a real working system, not a mockup: it imports real catalogs from real Shopify stores
and creates real Razorpay test-mode orders.

---

## 2. Two audiences, one app

This is the insight driving the whole redesign. Frontage currently serves two completely
different people through one undifferentiated interface, and that's the root of why it feels
like an internal tool.

**The merchant console** — a business owner, probably non-technical, fixing their own catalog so
AI agents can see and sell their products. They care about: what's broken, what it costs them,
and how to fix it. This surface is *allowed* to be dense and information-rich. It is not allowed
to look like a database viewer.

**The buyer surface** — where a natural-language shopping goal becomes a real purchase. This is
the payoff of the entire product and the emotional centre of the demo. It should feel
consumer-grade.

**Architecture (decided):** one Vite app, two zones at `/merchant/*` and `/shop/*`, with an entry
point at `/` to choose. The two zones should **not** share a layout shell — different navigation,
different density, different type treatment. A visitor landing in one should never wonder which
one they're in.

---

## 3. Decisions already locked

Please don't relitigate these; they were decided deliberately.

1. **One app, two zones — not two separate apps.** One dev server and one deploy keeps the
   README's "runs end to end on a fresh clone" promise honest and makes switching zones live
   during the 5-minute demo trivial. (There's also a hard technical reason — see §10.)
2. **The merchant console gets a new information architecture** organised around the merchant's
   journey rather than one tab per backend service. This is the primary fix for "feels
   tech-heavy" — see §7.
3. **The buyer surface's identity is deliberately left open** — see §4.

---

## 4. Open question: what *is* the buyer surface?

This needs deciding early, ideally once the inspiration screenshots are in, because it
determines whether the two zones share a brand or deliberately clash.

**Reading A — a simulated third-party AI agent.** `PROJECT_SPEC.md` (§4, §8) frames this
component explicitly as standing in for ChatGPT or Gemini, because we can't integrate with their
real shopping internals. Under this reading it should look like *a different company's product*
— visually unrelated to Frontage. This sharpens the pitch: judges see exactly what an outside AI
buyer experiences when it hits a Frontage-enabled catalog.

**Reading B — Frontage's own consumer shopping product.** Shares Frontage's identity and design
language with the merchant console, positioning Frontage as owning the shopper experience too.
This is a coherent product story, but it diverges from the spec's "simulated third party"
framing, so the pitch narration would need adjusting to match.

Both are defensible. Pick one explicitly rather than drifting between them.

---

## 5. Current state — what exists

**Stack:** React 19, Vite 8, `react-router-dom` 7.
**No CSS framework, no component library, no icon set, no charting library.** This is a green
field — adding dependencies is entirely fair game.

**Files:**
- [frontend/src/index.css](frontend/src/index.css) — all styling, 257 lines, essentially
  unstyled defaults.
- [frontend/src/App.jsx](frontend/src/App.jsx) — nav shell, merchant `<select>`, routes.
- [frontend/src/api.js](frontend/src/api.js) — the complete API client.
- `frontend/src/pages/` — five components: `Dashboard`, `Manifest`, `BuyerAgent`, `AuditLog`,
  `ImportStore`.

**The full data surface available to the UI** (all already wired in `api.js`, no backend work
needed to use any of it):

| Call | Endpoint |
|---|---|
| `listMerchants` / `getMerchant` / `getCatalog` | `GET /merchants`, `/merchants/{id}`, `/merchants/{id}/catalog` |
| `runDiagnose` | `POST /merchants/{id}/diagnose` |
| `getLatestDiagnosis` / `getDiagnosisHistory` | `GET /merchants/{id}/diagnose/latest` · `/history` |
| `generateDescriptions` | `POST /merchants/{id}/fix/generate-descriptions` |
| `approveItem` | `POST /catalog-items/{id}/approve` |
| `updateItemPrice` | `PUT /catalog-items/{id}/price` |
| `publishManifest` / `getManifestJson` | `POST /merchants/{id}/fix/publish` · `GET /merchants/{id}/manifest.json` |
| `getMandate` / `setMandate` | `GET /mandate?merchant_id=` · `PUT /mandate` |
| `purchase` | `POST /transact/purchase` |
| `getAuditLog` | `GET /audit-log?merchant_id=` |
| `buyerShop` | `POST /buyer-agent/shop` |
| `importStore` | `POST /import` |

**Shapes worth knowing when designing:**
- **Diagnostic report** — `{ score, gaps: [{ check_name, status, detail }] }`. Always exactly
  four checks, 25 points each: `product_descriptions`, `agent_readable_feed`,
  `price_availability_clarity`, `programmatic_checkout`. History is available, so
  before/after over time is designable.
- **Catalog item** — `name`, `description`, `price`, `currency`, `availability`, `variant_info`,
  `has_variants`, `agent_readable`, `source` (`manual` | `generated`).
- **Audit action** — `agent_name` (Diagnose / Fix / Transact / BuyerAgent), `timestamp`,
  `reasoning` (plain language), `action_taken`, `result` (`success` | `blocked` | `failed`).
- **`buyerShop` returns one of several statuses**, and the UI must handle all of them:
  `purchase_attempted`, `ambiguous` (with a candidate list), `no_match`, `no_manifest`,
  `failed`, `invalid_selection`.

---

## 6. What's specifically wrong today

Not "it looks bad" — these are the concrete problems to solve.

- **The IA mirrors the backend, not the user.** Five tabs, each named after a technical
  component. A merchant doesn't think "I need to visit the Manifest tab."
- **A raw JSON `<pre>` blob is the manifest preview.** The single most "internal tool" moment in
  the product — and it's showing off the thing the product is proudest of.
- **The diagnostic score is bare text**, and the before/after revenue story is a prose
  paragraph. The most persuasive number in the product has no visual weight.
- **The audit log is an undifferentiated flat list.** No grouping by run, no filtering, no way to
  follow a single purchase attempt through its steps. It's the trust artifact and it reads like
  console output.
- **The "Try a purchase" panel is a developer testing shortcut** sitting inside the Audit Log
  page with nothing marking it as such. It bypasses the buyer agent entirely and calls the
  transact endpoint directly. It should either be visually quarantined as a dev tool or moved.
- **The buyer surface reads as a form, not a conversation.** Its three example goals are
  hardcoded to one seeded merchant and are nonsense for the other eight.
- **Empty and loading states are bare strings** — "No actions yet.", "Running…".
- **The merchant switcher is an unlabelled `<select>`** in the top bar. With nine merchants
  there's no sense of who you're working on or what state they're in.
- **Zero mobile consideration.** `main` is a fixed `max-width: 1000px`.
- **Implementation vocabulary leaks everywhere** — *manifest*, *mandate*, *agent_readable*,
  *variant_info*. See §9.

---

## 7. Merchant console — proposed new IA

A starting proposal, not a mandate. If the design session finds a better arrangement, take it.

Organise around **Diagnose → Fix → Transact** as a visible spine, with the merchant's current
position and next action always clear. Roughly:

- **Onboarding / entry** ← today's *Import Store*. Connect a real store, or explore a demo one.
- **Diagnose** ← today's *Dashboard*. The score, the gaps, and what each gap costs.
- **Fix** ← today's *Manifest*. Generate descriptions, approve them, publish. Re-diagnose to
  watch the score move.
- **Trust / history** ← today's *Audit Log*, minus the settings and the dev panel.
- **Settings** — the spending mandate lives here, not buried in the audit view.

The score improving after a fix is the product's core feedback loop. Today it requires
navigating between two tabs and pressing a button to notice. That loop should be impossible to
miss.

---

## 8. Real data the design must survive

This is the most important section for avoiding a design that only works on tidy mock data. All
of the following are **real catalogs already imported into the running app:**

- **Bangalore Watch Co** — 25 products with **1,000+ character descriptions**. Today's table
  layout collapses completely under these.
- **Comet** — nine near-identical product names ("X Lows MR CLAUS", "X Lows GREYSCALE", "X Lows
  VIPER"…). This is what drives the buyer agent's ambiguity picker, and the design must make
  choosing between near-duplicates genuinely easy.
- **Plum Goodness** — emoji in product names (`🎁 Mystery Box`), *exactly duplicate* product
  names (two different products, identical strings), and ₹1 promo items sitting beside ₹950
  ones.
- **Jaipur Watch Company** — prices from ₹35,000 to ₹1,75,000. Large-number formatting, and
  Indian digit grouping (₹1,75,000 not ₹175,000) is worth getting right.
- **Nine merchants and growing**, with long names like "Terracotta & Co (Home Goods)".

Design against these, not against three tidy rows.

---

## 9. Copy and vocabulary

Words are design material here, because half the product's job is making an abstract problem
legible.

**Merchant zone** may use precise terminology, but must define it in place the first time it
appears. **Buyer zone** should never show any of it.

| Internal term | Merchant-facing | Buyer-facing |
|---|---|---|
| manifest | "what AI agents can see" / your agent-readable catalog | never shown |
| mandate | spending limit | "your budget" |
| `agent_readable` | ready for AI shoppers | never shown |
| `variant_info` | sizes, colours, options | options |
| Diagnose / Fix / Transact | fine as section names, if explained | never shown |

Also:
- Active voice, sentence case, no filler.
- An action keeps its name through the whole flow — a button that says "Publish" produces
  "Published".
- Errors say what happened *and what to do next*. They don't apologise and they're never vague.
- Empty states are invitations to act, not statements of absence.

---

## 10. Hard constraints — do not break these

- **No backend changes.** This is a frontend-only redesign. If the design genuinely needs a new
  endpoint, flag it rather than working around it.
- **CORS is pinned to `http://localhost:5173`** in
  [backend/app/main.py](backend/app/main.py) (line 20). A second app on a different port will
  fail silently. This is the concrete technical reason the one-app decision holds.
- **The six-beat demo in `PROJECT_SPEC.md` §10 must stay performable and legible at video
  resolution:** messy catalog → Diagnose → Fix → Transact → blocked failure → revenue close.
  If any beat becomes harder to show, the redesign has regressed.
- **Both deliberate failure cases must remain obvious on screen** — a spend-ceiling breach and a
  price-drift mismatch. These are explicitly graded; they should be among the clearest moments in
  the UI, not error text.
- **Spend is now cumulative per mandate version.** The ceiling caps *total* spend, not each
  individual purchase. The UI must make remaining budget visible — during testing this caused
  genuinely confusing "why was this blocked?" moments, and a merchant will hit the same wall.

---

## 11. Quality floor

Meet these quietly; don't advertise them.

- Responsive down to mobile.
- Visible keyboard focus.
- `prefers-reduced-motion` respected.
- Real contrast ratios, especially on the pass/fail state colours that carry meaning.

---

## 12. Inspiration screenshots

> **Add screenshots and notes here before starting the design session.**
>
> For each one, a line on *what specifically* is being borrowed — a layout idea, a density
> level, a type treatment, a motion feel — is far more useful than the image alone.

**Already gathered, in `Screenshots/`:**
- Console-side (dark, data-dense admin references): audit/alert overview, e-commerce sales
  dashboard, fintech product-performance panel, deep-navy SaaS analytics with glowing charts.
  Consistent direction — dark, dense, chart-forward — worth treating as the default read for
  `/merchant/*` unless overridden.
- Buyer-side (conversational AI-assistant references): dark chat entry screens ("How can I
  help you today?") and ChatGPT-style shopping flows with curated product cards, ratings, and
  an "instant checkout here" link. These consistently point toward **Reading A in §4** — the
  buyer surface as a simulated third-party agent, visually unrelated to Frontage — rather than
  Reading B. Worth treating that as decided unless the design session finds a reason not to.

**Audit Log specifically — a named pattern worth borrowing:** a Razorpay agentic-commerce
marketing example (an "Abandoned Cart Conversion" automation — a different capability than
anything Frontage does, purely a UI reference here) displays its agent run as a **live
step-by-step trace**: named steps, a duration per step, a green checkmark on completion, and
one step carries an inline
artifact (an embedded, playable call recording). Applied to our Audit Log, the equivalent
artifact would be the Razorpay order/payment link a successful Transact step produces. This is
a much stronger model than the current flat list for showing *one purchase attempt's* steps
in sequence — worth using as the direct reference for that view, not just general inspiration.

---

## 13. Material to draw from, and defaults to avoid

**Raw material specific to this subject** — offered as fuel, not instruction:

- **"Frontage"** is the real-estate term for a shop's street-facing width — its visibility from
  the street. The product is named after it and currently does nothing with the metaphor.
- Machine-readable feeds; structured data as something a machine *sees*.
- Bounded autonomy — an agent that can act decisively but never independently of human intent.
  Guardrails, ceilings, allow-lists.
- Two machines negotiating a purchase with a human's rules between them.
- Indian D2C retail, ₹, and the real brands already in the app.
- Razorpay's own visual world, since this is a Razorpay buildathon submission.

**Defaults to avoid.** Current AI-generated design converges on three looks regardless of
subject, and they read as templated:

1. Warm cream background (~`#F4F1EA`) + high-contrast serif display + terracotta accent.
2. Near-black background + a single acid-green or vermilion accent.
3. Broadsheet layout — hairline rules, zero border-radius, dense newspaper columns.

Each is legitimate for *some* brief. None should be arrived at by default here. If the
inspiration screenshots point at one of them, follow the screenshots — that's a choice, not a
default.

---

## 14. Verifying the redesign

1. Run both servers per [README.md](README.md).
2. Walk all six demo beats end to end (§10) and confirm each is still clear on screen.
3. Check every view against the stress-case merchants in §8 — especially Bangalore Watch Co for
   long text and Jaipur Watch Company for large prices.
4. Exercise every `buyerShop` status from §5, not just the happy path — particularly `ambiguous`
   and `no_match`.
5. Run `pytest` in `backend/` — 16 tests should still pass, proving nothing backend-side moved.
