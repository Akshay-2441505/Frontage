# Frontage — Frontend Craft Pass

**Date:** 2026-09-04
**Status:** Rewritten after audit. All sections implemented. Remaining: the dead `.delta` CSS, an unverified `prefers-reduced-motion` pass, and an `/impeccable critique` re-run against the 24/40 baseline.

---

## Context

This spec was first written from a hypothesis: that the frontend reads as **generic**
(anonymous shapes — uniform cards, a centred column, the ChatGPT hero) and **flat**
(surfaces lit from nowhere), and that the fix was a drawing-sheet relayout of the
console plus a light system.

**An `/impeccable critique` run — two isolated assessments, one design review and one
detector/measurement pass — refuted the first half of that.** The spec has been
rewritten around the evidence rather than the hypothesis.

### What the audit changed

**"Generic" does not survive contact with the evidence.** Strip the copy from Diagnose
and the page still cannot be repurposed: the Elevation is a shopfront generated from a
merchant's own rubric weights, the colour reservation is a semantic system (mint only
for money that actually moved through Razorpay; rose rather than red because a refusal
is the system working), and the two zones assign the *same token names* to opposed
values so every primitive is zone-agnostic. The slop detector found **2 warnings across
36 files, zero in any JSX** — one of them a false positive (a CSS border-triangle
drawing a disclosure caret, matched on a literal string).

The "uniform containers" claim was measured and contradicted: **19 distinct
`border-radius` values, 15 border treatments, 9 unique shadows** are declared.

**So the drawing-sheet relayout is cut.** It solved a problem the evidence says does not
exist, and it was the largest item in the original plan.

**"Flat" was half-right and misdiagnosed.** There *is* a material system — layered
gradients on `.elevation`, `.elevation__glass::after`, `.elevation__spill`,
`.cat-thumb`, `.gate`. It stops at the edge of the one illustration. The rendered
console shows **0 box-shadows**. That is flatness in one zone, not sameness everywhere,
and it is a much smaller job than a relayout.

**The real problems were defects, not taste.** The signature element contradicted its
own number, and the product's core feedback loop had never rendered once.

Design health at time of audit: **24/40 (Acceptable)**. Snapshot at
`.impeccable/critique/2026-09-04T09-26-20Z__frontend-src-pages-console-diagnose-jsx.md`.

---

## 0. Backend — DONE

`discover()` computed a shortlist and discarded it. Two additive fields now describe the
funnel, in `backend/app/agents/buyer.py`:

```jsonc
{ "considered_count": 222, "shortlist": [ { id, name, price, currency, image_url, merchant_id, merchant_name }, … ] }
```

Added in `discover()`, not `_resolve_goal()`, because the latter is shared with
single-merchant `shop()` where there is no catalog-wide funnel. `shortlist` is `null`
when no narrowing happened, rather than reporting the whole catalog as a shortlist.
Descriptions omitted — real products carry thousands of characters and the list holds 50.

Verified live: `considered_count: 222`, `shortlist: 19`. **102 backend tests pass.**

## 1. The Elevation tells the truth — DONE

Three defects, all in the signature element:

- **Bays were all `1fr`** while weights are 25/25/20/15/10/5 — so a check worth 25 looked
  exactly as wide as one worth 5, hiding the product's own argument that the fetchable
  catalog matters five times more than photos. Bay width is now the weight, via a
  `--tracks` custom property (not an inline `grid-template-columns`, so the mobile media
  query can still override). Bays, pavement and labels share the track list and the same
  gap and inline padding, so all three are in exact register.
- **Weights were never normalised** to the checks a report actually contains. Five
  merchants carry stale four-check reports; today's six-check weights summed those to 80
  under a reading of 100 — three of them displaying **100/100**. Now scaled to whatever
  is present, using **largest-remainder allocation** rather than per-weight rounding
  (independent rounding produced 31.3 + 31.3 + 25 + 12.5 = 100.1, the same defect at
  small scale). Verified: 4-check stores read `31 + 31 + 25 + 13 = 100`, 6-check stores
  `25 + 25 + 20 + 15 + 10 + 5 = 100`.
- **The fill ran vertically** while the dimension line measuring the same quantity ran
  horizontally. The fill is now a horizontal `clip-path`, so **lit width across the
  shopfront literally equals the score** — measured 85% lit against a reading of 85/100.

Also: the lede's count is derived from `bays.length` (a hardcoded "Six things" contradicted
an empty state saying "the four checks"), and the drawing gained an `aria-live` region so
a remeasure is announced rather than changing in silence.

## 2. The core feedback loop renders — DONE

`Diagnose.jsx` read `history[history.length - 1]` against an **oldest-first** endpoint, so
`first` was the newest run and equalled `report.score` by construction. `gained` was always
exactly 0 and the badge never rendered in three phases. `DESIGN_BRIEF.md` §7 calls this
loop the thing that "should be impossible to miss."

Fixed to `history[0]`. Verified: Bloom & Thread now shows **"+35 since your first
measurement"** against a history of `[50.0 … 85.0]`.

Still open: `.delta`, `.delta__step`, `.delta__val` and `.delta__arrow` were styled and
never wired to anything. Either wire the two-numbers-and-an-arrow component into the
Diagnose header or delete the CSS.

---

## 3. Otto — the money moment — DONE

The graded failure case, and the one screen where the buyer-facing vocabulary rule broke.
`Outcome` rendered `purchase.reason` verbatim: **"mandate" twice in the buyer surface**,
which `DESIGN_BRIEF.md` §9 forbids, with an unformatted `₹4999` above a correctly
formatted `₹4,999`.

**The plan assumed every block was a budget breach. Six rules produce one
`status: "blocked"`** — no mandate, merchant not allow-listed, per-transaction cap, spend
ceiling, price mismatch, out of stock — and only the fourth is a breach. Nothing could be
rewritten client-side while every refusal arrived as one opaque string, and the meter was
being drawn under all six, including "out of stock".

So the backend now sends `block_code` plus the numbers that rule decided with:

```jsonc
{ "block_code": "spend_ceiling",
  "block_data": { "requested": 175000, "already_spent": 40000, "spend_ceiling": 50000,
                  "remaining": 10000, "window": "one_time" } }
```

`code` is keyword-only and required, so a block site added later cannot ship without one.
`reason` is unchanged — it is correct for the console's audit trail, which is where
mandate vocabulary belongs. `window_label` is deliberately *not* sent: it reads "so far
under this mandate", which would only invite the leak back in.

Frontend:

- `refusalCopy()` composes the sentence per code, in Otto's voice. An unrecognised code
  falls back to a true but vague sentence, never to `reason` — vague in the buyer's voice
  is a smaller failure than precise in the operator's.
- `BudgetBreach` is presentational and renders only for a real breach.
- Remaining budget added as a fourth legend item — the one number anyone can act on.
- One next-step action, **scoped to the store**. A bare "under ₹50,000" came back asking
  what kind of product you wanted; a next step that asks another question is not a next
  step. The limit is that store's limit, so its catalog is the honest scope, and
  "Show me what's under ₹10,000 at Jaipur Watch Company" returns real candidates.
- The turn reorders on outcome: a bought turn ends on the order, a refused one ends on
  the way forward, rather than on a 293px photograph of what you were denied.

**GOV.UK's design system draws the line this screen was crossing:** an error message tells
someone their input was wrong; being refused permission is not that, and the guidance is to
explain the problem *and give a way forward*. The explanation was already here. The way
forward was not.

Verified live on a cumulative refusal — ₹50,000 limit, ₹40,000 already spent:
body reads *"That's ₹1,75,000, and the spending limit for Jaipur Watch Company has ₹10,000
left. I stopped before paying."*; legend reads `₹40,000 already spent · ₹1,75,000 this
request · ₹10,000 left · ₹1,65,000 over`; DOM order `reasoning → OUTCOME → PRODUCT →
ATTRIBUTION`; no "mandate", "ceiling" or "allow-list" anywhere in the buyer zone.
**104 backend tests pass.**

### Found on the way: the console's budget meter was wrong too

`spentUnderMandate()` summed **all time** while the backend counts a rolling window, so a
daily or weekly budget showed weeks of purchases against it and a merchant could see "no
headroom" on a budget that had already reset. The helper now applies the window, mirroring
`WINDOW_DURATIONS`. Its timestamps also needed care: the backend stores naive UTC, so
`Date.parse` was reading them as local time — five and a half hours adrift on IST, enough
to drop a purchase out of a daily window that should still hold it.

Otto no longer reads from this helper at all. Two independent derivations of the same
number cannot be kept in agreement; the refusal now uses the numbers the backend refused
with.

## 4. Diagnose's grid answers the page's own question (P1)

The gap row says "6 of 6 products have no product image", then renders all 26 products with
no filter, sort or marker — **1,623px of a 2,645px page**. The page names a defect and
denies you any way to act on it. This is the largest cognitive-load failure and the reason
it reads as a database viewer.

- Gap rows drive the grid: clicking one filters to its failing items and re-titles the section.
- Default to failing items, with "Show all 26" as the escape.
- Make `.elevation__bay` a `<button>` that selects its check — the bays become the control.

## 5. Accessibility and contrast — DONE

Measured against *rendered* text on its actual background, in both themes, on every
console route and the shop.

**Contrast.** `--text-dim #6a6288` measured **4.43** on `--bg-deep` — the rail's ground,
and so the ground under `brandmark__sub`, `rail-group__label` and `rail-foot__note`, three
labels on every console page. Now `#675f85`: 4.63, still lighter than `--text-muted` (5.51)
so the hierarchy reads.

The syntax highlighting on Fix failed identically and for the same reason: `--info`, `--ok`
and `--bad` were checked against `--surface`, but the code block sits on `--bg-deep`, where
at 9–11px they landed at **4.19–4.46**. Three units of ink each. The `-soft`/`-line`
variants are untouched — backgrounds and borders, held to 3:1, already clear.

**Skip links** in both zones, now the first tab stop, skipping 10 rail stops. `:focus`, not
`:focus-visible`: the link is off-screen until focused, so every focus it gets is already a
keyboard focus, and narrowing the selector only risks a link that takes focus while staying
invisible.

**The composer** set `outline: none` on `:focus`, removing the ring for the only people it
serves. Its wrapper's `focus-within` ring is `--accent-soft`, a low-alpha wash well under
3:1 — decoration standing in for an indicator. Now a real 2px outline on `:focus-visible`,
measuring 4.04 light / 6.41 dark.

**MerchantPicker** is rewritten to the APG listbox pattern. The old markup put
`role="listbox"` on a `<ul>` whose `<li>` wrapped `role="option"` buttons, so the implicit
`listitem` broke the required parent/child relationship and assistive tech saw a listbox
containing no options at all. Options are now direct children, focus moves to the listbox
and `aria-activedescendant` names the active option, and opening lands on the current store.
Arrows wrap, Home/End jump, Enter commits, Escape closes and returns focus, Tab closes
without committing. Selection keeps the filled ground and the active option takes a ring —
if both were a fill, arrowing off the current store would look like nothing happened.

### Method note, for the next audit

**The browser pane starves `requestAnimationFrame`, so a theme toggle leaves CSS transitions
stalled at an intermediate colour, and any reading taken during one is fiction.** Three
separate rounds of "failures" here — `page-head__title` at 1.05, the rail step badges at
2.97, a primary button at 2.74 — were all mid-transition artifacts that measured correctly
once transitions were disabled. Inject
`*,*::before,*::after{transition:none!important;animation:none!important}` before auditing
colour in this environment.

Verified: **7 console routes + the shop, both themes each, zero failures.**

## 6. Material system — DONE

The narrow, evidence-backed version of the original light-source item: the audit measured
the rendered console at **0 box-shadows**. That is now 10 per page, and the depth is a
system rather than a set of one-off casts.

**One light, fixed above the page and slightly left.** Six tokens, redefined in all four
zone/theme blocks:

| token | role |
|---|---|
| `--edge-lit` | the top edge that catches |
| `--edge-fall` | the bottom edge that falls away |
| `--lift-1/2/3` | resting · raised · floating |
| `--sink` | the same light read backwards, for things cut *into* a surface |

Dark and light invert which cue does the work. In a dark room a black cast barely reads,
so separation is carried by the lit edge and only supported by the shadow; in daylight it
is the other way round, and the shadow is tinted with the zone's own ink — a neutral grey
shadow on a violet-grey ground reads as dirt.

**Applied by what a thing *is*, not by what looks nice.** Raised: `.card`, `.picker__menu`
(lift-3, the only floating plane), `.picker__button`, `.composer`, `.fieldtile`
(lift-1 → lift-2 on hover), `.btn--primary` (lift-1 → lift-2 → **sink on `:active`**, so
the hover lift actually resolves into a press). Recessed: `.input`, `.code-block`,
`.meter__track`, `.breach__track`, `.console__rail` — the rail is the one plane set *back*
from the page, since it holds still while main scrolls past.

Deliberately left flat: `.gap-row`, because rows inside a card must not each lift off it;
`.cat-item` and `.step` get the two edges but **no cast**, for the same reason. That is
where skeuomorphism starts — depth that stops adding up.

**The ground.** Both zones get a two-stop gradient: a lit pool overhead and a shade
gathering at the bottom, `background-attachment: fixed` so the light stays overhead as the
page scrolls. Painted into the background layer, not an overlaid pseudo-element — an
overlay is one stacking-context mistake away from covering the page's own text.

**The alphas were set by measuring the composite, not by eye**, and the first pass was
wrong in both directions. Light themes started at 0.75/0.85 white, which lifted the ground
to effectively white and would have erased the separation between page and white cards.
Dark themes then failed the same way inverted: at 0.04 the console's lit ground reached
`#1a1a26` against a `--surface` of `#1a1727` — a raised panel dissolving into the page at
the top of the viewport, the exact failure `--edge-lit` exists to prevent. Final values,
verified live in all four combinations:

| zone / theme | ground | lit peak | shade peak | surface |
|---|---|---|---|---|
| Console dark | `#12101c` | `#171521` | `#0c0b13` | `#1a1727` |
| Console light | `#f2f0f7` | `#f9f8fb` | `#e8e6ee` | `#ffffff` |
| Otto dark | `#0d0f14` | `#111318` | `#080a0d` | `#14171f` |
| Otto light | `#fdfdfb` | `#fefefd` | `#f1f1f0` | `#ffffff` |

The lit peak stays below `--surface` everywhere, which is the invariant the whole thing
rests on.

**Three hardcoded shadows were tokenised on the way.** `.picker__menu` carried
`0 18px 40px rgba(0,0,0,0.42)` — a night-time cast under a daylight menu in the light
theme. Two in `shop.css` were inked for the light theme and so were nearly invisible in
dark, where a shadow needs to be deepest. `.composer:focus-within` also dropped its lift
entirely on focus, so the composer visibly fell back onto the page the moment you clicked
into it.

### Found on the way: a class collision from §7

`OttoField` used `.field`, which `base.css` has defined all along for form groups — and
`shop.css` loads *after* `base.css`, so the field's `gap`, `overflow-y` and `min-height`
were being applied to every form field in Connect and Settings. Renamed to `.otto-field`.
Verified fixed: form groups are back to their own `6px` gap and `overflow-y: visible`.

## 7. Otto — hero on idle, field once asked — DONE

Reordered ahead of §4–§6 after the user pointed out, fairly, that nothing shipped so far
was visible on opening the app. The earlier items were correctness; this is the one that
changes the shape of the page.

**The field.** A chat column can show a conclusion but not the work, and the work is the
whole claim: 222 products became 25 became 1, and none of it appeared anywhere. Once a
question is asked the conversation moves to a rail and `OttoField` takes the room — the
funnel as three counting numbers, and the shortlist as the products it actually holds with
the chosen one marked among them.

- `.otto__work` is a two-column grid, `minmax(380px, 32%) 1fr`. Measured at 1440px:
  rail 429px, field 883px, 5 tiles per row, no horizontal overflow.
- Below 1180px the field **stacks above** the conversation rather than disappearing — it
  is the part that explains what the agent did, so it is the last thing to drop for width.
  Below 768px it hides and the conversation takes the page.
- Numbers count rather than appear, staggered 0 / 0.18 / 0.36s. Three figures snapping in
  together read as three unrelated statistics instead of one narrowing.
- The field follows the most recent turn that reported a funnel, not the last turn, so a
  follow-up in flight doesn't blank the right-hand side.

**Degradations, all designed rather than defaulted:**

- `shortlist: null` renders `—  no narrowing`, muted — **not `0`**, which would read as
  "nothing matched", the opposite of what happened. Verified live.
- A settled turn with no shortlist still shows its one chosen product as a tile. Otherwise
  the funnel ends on "1 chosen" pointing at empty space.
- An ambiguous turn ends on "too close to call" with the candidate count, not a fabricated
  "1 chosen".
- Photo-less products get the name set large — the norm on imported catalogs, not an edge
  case.

**The hero.** The greeting claimed "every agent-ready store" without ever saying how many.
`GET /buyer-agent/reach` counts from `_all_discoverable_products` — the identical set
`discover()` searches — so the hero's claim and the funnel's first number cannot drift.
Reads **222 products · 11 stores · readable right now**. A store that has connected but not
published is not reachable and is not counted.

Store pins added to hero wall cards. **Verified by forcing the fallback path**
(`VITE_OTTO_3D=false`), which caught a real defect: the pins rendered empty, because
`/merchants/{id}/catalog` is scoped to one merchant and so never returns its name. The
sampling hook already knows which merchant it asked, so it stamps the name on client-side
rather than widening the endpoint for one cosmetic consumer. Now shows 7 cards across 3
stores.

**Known limit:** the pins land on the CSS wall only. The default path renders the WebGL
wall, whose planes are textures with no text layer, and adding one is disproportionate —
the reach line carries the multi-store claim there, and more plainly.

## 8. Fix a fragility introduced in Phase 3

`.otto` and `.console` carry `initial={{ opacity: 0 }}`, so the entire zone's visibility
depends on a JS animation completing. Confirmed: with `requestAnimationFrame` not firing,
the app renders blank rather than merely un-animated. Entrances must enhance a visible
element, never gate its visibility.

---

## Sequencing

1. ~~**§8 fragility fix**~~ — done.
2. ~~**§3 money moment**~~ — done.
3. **§4 Diagnose grid** — biggest usability win remaining.
4. ~~**§5 accessibility and contrast**~~ — done.
5. ~~**§7 Otto field**~~ — done, pulled forward: it is the only remaining item visible on
   opening the app.
6. ~~**§6 material**~~ — done.

## Out of scope

- **The drawing-sheet relayout.** Cut — the premise was refuted.
- Palette and type families stay.
- No new animation subsystems; no GSAP; no 3D beyond the existing lazy `ProductWall3D`.
- Per-merchant accent extracted from photography — unpredictable, and would gamble the
  contrast work.
- `shadcn` as a component library. Its Radix primitives remain a legitimate answer for
  §5's `MerchantPicker` ARIA defects, taking behaviour only, not styling.

## Verification

1. Open **`http://localhost:5173`** — CORS is pinned to that literal; `127.0.0.1` fails silently.
2. Elevation weights sum to exactly 100 on both 4-check and 6-check merchants, and lit
   width equals the reading.
3. The gain badge renders on a merchant with history.
4. Contrast re-measured on **rendered text against its actual background**, all four
   zone/theme combinations — not tokens against `--raised`.
5. `prefers-reduced-motion`: entrances static. **Verify in OS settings** — unverified for
   three phases because the media query cannot be emulated from this tooling.
6. Mobile 375px, no unclipped horizontal overflow.
7. `npm --prefix frontend run lint` and `build` clean; `pytest` 102 passing; detector still
   at 2 known findings.
8. Re-run `/impeccable critique` and compare against the 24/40 baseline.
