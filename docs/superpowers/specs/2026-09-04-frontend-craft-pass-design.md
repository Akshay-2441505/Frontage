# Frontage — Frontend Craft Pass

**Date:** 2026-09-04
**Status:** Rewritten after audit. Two P0s implemented; remainder ready for planning.

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

## 3. Otto — the money moment (P1)

The graded failure case, and the one screen where the buyer-facing vocabulary rule breaks.
`Outcome`'s blocked branch renders `purchase.reason` verbatim: **"mandate" twice in the
buyer surface**, which `DESIGN_BRIEF.md` §9 forbids, with unformatted `₹4999` sitting
above a correctly formatted `₹4,999`.

- Stop rendering `purchase.reason` in the buyer zone. Compose client-side from numbers
  `BudgetBreach` already fetches: *"That's ₹4,999 and this store's shopper budget has
  ₹1,201 left. I stopped before paying."*
- Add remaining budget as a fourth legend item — it is the one number that lets someone act.
- Add one action: **"Find me something under ₹1,201"**, calling `send()` with that goal.
- Reorder the turn so the verdict sits above the product card. Peak-end currently ends on
  a 293px hero shot of the thing you were denied.

## 4. Diagnose's grid answers the page's own question (P1)

The gap row says "6 of 6 products have no product image", then renders all 26 products with
no filter, sort or marker — **1,623px of a 2,645px page**. The page names a defect and
denies you any way to act on it. This is the largest cognitive-load failure and the reason
it reads as a database viewer.

- Gap rows drive the grid: clicking one filters to its failing items and re-titles the section.
- Default to failing items, with "Show all 26" as the escape.
- Make `.elevation__bay` a `<button>` that selects its check — the bays become the control.

## 5. Accessibility and contrast (P2)

Measured against *rendered* text on its actual background, which earlier audits did not do:

- **Console light theme fails AA consistently at 4.14–4.46**, every case tracing to
  `--text-dim #6a6288` on `--bg-deep #e5e2ee`. Earlier passes measured tokens against
  `--raised` only and reported all four combinations clean. Three of the failures
  (`brandmark__sub`, `rail-group__label`, `rail-foot__note`) appear on every console page,
  so one token nudge clears the majority. Re-check syntax tokens against `--bg-deep`.
- **`shop.css:561` sets `outline: none` on `:focus`, not `:focus-visible`**, killing the
  composer's keyboard ring. The `:focus-within` border that remains measures **1.47:1**
  against a 3:1 threshold.
- **No skip link** — 10 rail tab-stops before content on every console page.
- **`MerchantPicker` ARIA is invalid**: `role="listbox"` on a `<ul>` whose `<li>` wrap
  `role="option"`. The intervening `listitem` breaks the required parent/child
  relationship. No arrow-key navigation, no `aria-activedescendant`, no focus move on open.

Measured and already correct, for the record: **zero unclipped horizontal overflow** at
375px on every route, and **25 of 26 tab stops** show a real 2px ring (6.87:1 in console).

## 6. Extend the material system past the Elevation (P2)

The narrower, evidence-backed version of the original light-source item. One light position
in tokens; raised surfaces get a top edge that catches, a bottom edge that falls away, and
a cast shadow pointing away from the source. The page sits in a soft pool rather than a
uniform fill.

**Scope discipline:** the console currently renders 0 box-shadows deliberately, and the
audit rated Aesthetic/Minimalist 3/4. This is the lowest-priority item here and should be
done last, if at all. Overdone it becomes skeuomorphism, and the flat 1px-line treatment
is a defensible choice rather than an accident.

## 7. Otto — hero on idle, field once asked (product decision, unchanged)

Not a response to the audit; a product decision taken before it. Otto is now one agent
across 11 stores and 222 products, but `getCatalog(merchantId)` still drives the hero wall
and the suggestion chips — single-store views inside a multi-store agent.

- Idle: keep the hero, add store pins to tiles and a line stating reach ("11 stores · 222
  products"). Draw chips from across stores.
- Asked: the field. Counter reads **222 → 19 → 1** from the new response fields; render the
  shortlist (≤50), not all 222; conversation drops to a rail; store attribution on the tile.
- Degradations to design, not discover: `shortlist: null`, photo-less stores, and mobile
  (which cannot hold a field and a rail, and falls back to the conversation view).

## 8. Fix a fragility introduced in Phase 3

`.otto` and `.console` carry `initial={{ opacity: 0 }}`, so the entire zone's visibility
depends on a JS animation completing. Confirmed: with `requestAnimationFrame` not firing,
the app renders blank rather than merely un-animated. Entrances must enhance a visible
element, never gate its visibility.

---

## Sequencing

1. **§8 fragility fix** — minutes; removes a whole-app-blank failure mode.
2. **§3 money moment** — the graded beat, and the one live vocabulary violation.
3. **§4 Diagnose grid** — biggest usability win remaining.
4. **§5 accessibility and contrast** — mechanical, verifiable, cheap.
5. **§7 Otto field** — largest remaining build; independent of everything above.
6. **§6 material** — last, and optional.

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
