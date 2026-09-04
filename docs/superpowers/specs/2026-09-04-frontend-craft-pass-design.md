# Frontage — Frontend Craft Pass

**Date:** 2026-09-04
**Status:** Design approved, ready for implementation planning

---

## Context

Three frontend phases have shipped: two zones with a token system, the Frontage
Elevation, Motion throughout, a product wall with a lazy WebGL layer, and an
ink-violet console. The work is competent and none of it is broken.

The problem is that it reads as **AI slop**. Asked to be specific, the two things
setting that off were:

1. **Generic** — the shapes and layouts are ones you have seen a hundred times.
   Competent but anonymous.
2. **Flat** — nothing feels premium or crafted. Surfaces have no material quality.

Notably *not* on that list: too little motion, or incoherence between parts. This
matters, because the instinctive fix — more effects, more 3D — is the most common
way a design *becomes* slop. This spec adds almost no new motion. It changes
composition and material instead.

### Diagnosis

**Why it reads as generic.** Every container is the same rounded rectangle with the
same 1px border and the same padding, at every level of hierarchy. The console is a
single centred column at `max-width: 1120px`. Nothing dominates — the Elevation is
the signature element and it sits as one card among equals. Otto is the centred
hero-greeting-pill-input shape, which is the single most-copied layout on the web
right now and therefore reads as AI-made regardless of execution quality.

**Why it reads as flat.** Every surface is a flat fill lit from nowhere. No surface
has a top, a bottom, or a position in space. The Elevation's "glass" is a linear
gradient in a box.

### Decisions taken

| Decision | Choice |
|---|---|
| Console layout | **B−** — drawing-sheet structure, plain language |
| Material | **Both** — light system on surfaces *and* the Elevation as real glass |
| Otto shape | **Hero on idle, narrowing field once asked** |
| Backend | Change approved and **already implemented** (see §0) |
| Palette / type families | **Unchanged.** Anonymous structure is the problem, not the colours |

---

## 0. Backend prerequisite — DONE

`discover()` computed its shortlist and threw it away; on a match the response
carried only `selected_product`. Two additive fields now describe the funnel:

```jsonc
{
  "status": "purchase_attempted",
  "selected_product": { … },
  "considered_count": 222,
  "shortlist": [ { id, name, price, currency, image_url, merchant_id, merchant_name }, … ]
}
```

Implemented in `backend/app/agents/buyer.py` (`discover()` and `_shortlist_summary()`).

- Added in `discover()`, **not** `_resolve_goal()`, because the latter is shared with
  the single-merchant `shop()` path where there is no catalog-wide funnel to describe.
- `shortlist` is `null` when `_shortlist_products()` declined or failed — the
  candidate set is then the entire catalog, and reporting it as a shortlist would
  claim a narrowing that never happened.
- Descriptions are omitted: a real imported catalog carries products with 4,954-character
  descriptions and the shortlist holds up to 50.

Verified live: `considered_count: 222`, `shortlist: 19 products`. **102 backend tests
pass** (4 new).

---

## 1. Console — drawing-sheet layout

Frontage is named for a shop's street-facing width. The console should be laid out
the way the thing it measures is drawn: as a sheet, not a dashboard.

**Structure.** Replace the centred column of cards with an asymmetric two-region
sheet — a wide drawing plate and a narrow title block, divided by hairline rules
rather than card borders.

- **Title block** (right, ~200px): merchant, the score at display size, product count,
  published version. The manifest version genuinely *is* a revision number.
- **Drawing plate** (left, fluid): the Elevation, then regions separated by rules.
- **No card chrome.** `.card` stops being the default container in the console.

  This does not contradict §2. Removing card chrome removes the *uniform bordered
  rectangle as default container*; it does not remove surfaces. What still sits above
  the sheet and therefore still takes the light treatment: the title block, product
  tiles, buttons, inputs, and the Elevation itself. What loses its border and becomes a
  region divided by rules: the gap list, the catalog section, the step tracker, the
  manifest viewer. Rule of thumb — **if it would physically sit on the drawing, it is
  lit; if it is a region of the drawing, it is ruled.**

**B−, not B.** Plain language throughout — "2 gaps", not `DETAIL 2 — OPEN`; "10 of 20",
not `10.0`; bay names, not point values. The drawing-sheet *structure* is what fixes
generic; the drafting *vocabulary* would fight the brief's requirement that the console
not read like a database viewer.

**One exception:** the Elevation keeps its dimension line and reading. That is the
drawing's own language, not costume borrowed for the rest of the page.

**Typographic range.** Currently everything sits between 11px and 34px. Widen it: small
mono annotations against a large score figure in the title block. Range is a large part
of what "crafted" means and it costs nothing.

Applies to every console page — `Diagnose`, `Fix`, `Trail`, `Settings`, `Connect`,
`Preview`. A half-converted console is worse than either state.

## 2. Material — one light source

Not "add shadows". Define a light position **once** in tokens and derive every surface
treatment from it.

- **Page** sits in a soft pool (radial gradient), not a uniform fill.
- **Raised surfaces** get a top edge that catches light (`inset 0 1px 0`), a bottom edge
  that falls away, a contact shadow, and a cast shadow pointing away from the source.
  Surfaces are very slightly lighter at the top — they face the light.
- **Buttons** get the same treatment at smaller scale.
- **Elevation glass** becomes glass: recessed inner shadow at the reveal, a specular
  streak across the pane, warm interior, and light spilling onto the pavement below.

Roughly six tokens plus one rule per surface type, in `base.css` with per-zone values.
Otto receives the same system with the light above a white studio rather than a violet
room — light mode needs its own values; a dark treatment cannot be inverted.

**Restraint is the whole job.** Overdone this becomes 2013 skeuomorphism, and the glass
panel is where that risk lives.

## 3. Otto — hero on idle, field once asked

**Otto is now one agent across all stores.** The per-store `<select>` is gone and
`discover()` searches 222 products across 11 published manifests. The frontend has not
caught up: `getCatalog(merchantId)` still drives the hero wall and the suggestion chips,
so single-store views are living inside a multi-store agent. Both must move to the
catalog-wide set.

**Idle — keep the current hero, improved.**
- Store pins on the wall tiles; mix stores so multi-store is visible before you type.
- One line stating reach: "11 stores · 222 products".
- Suggestion chips drawn from across stores, not one arbitrary merchant.

**Asked — the field.** The hero gives way to the catalog narrowing:
- A counter: **222 read → 19 shortlisted → 1 chosen**, from the new response fields.
- The field renders the **shortlist** (≤50), not all 222 — 222 tiles is an unreadable
  mosaic. Non-shortlisted tiles dim; the chosen product enlarges.
- The conversation drops to a **rail** along the bottom. It is the control, not the content.
- **Store attribution on the tile.** With results spanning eleven shops, which shop a
  product came from is part of its identity — and a small Indian D2C brand appearing in
  an agent's results is the pitch in one frame.

**Degradations that must be designed, not discovered:**
- `shortlist: null` (no narrowing) — show read-count and the winner, drop the middle step.
- Photo-less stores (the two seeded ones) — the existing typographic fallback.
- Mobile cannot hold a field and a rail; it falls back to the conversation view.

## 4. Fix a fragility introduced in Phase 3

`.otto` and `.console` carry `initial={{ opacity: 0 }}`, so **the entire zone's visibility
depends on a JS animation completing**. Confirmed during this session: with
`requestAnimationFrame` not firing, the whole app renders blank rather than merely
un-animated.

Entrances must enhance a visible element, never gate its visibility. Applies to the
zone wrappers specifically; component-level `Reveal` usage is fine.

---

## Sequencing

This is larger than one sitting, and the order matters because each stage leaves the app
in a shippable state:

1. **§4 fragility fix** — minutes, and it removes a whole-app-blank failure mode.
2. **§2 material system** — touches tokens only. Every later component inherits it, so
   doing it first means the layout work is never done twice.
3. **§1 console layout** — the largest piece. Six pages; convert all of them, since a
   half-converted console is worse than either state.
4. **§3 Otto** — depends on nothing above, so it can move earlier if the demo needs it.

Stopping after 2 already delivers most of the "flat" fix. Stopping after 3 delivers both
complaints for the console and leaves Otto as it is today.

## Out of scope

- Palette and type families stay as they are.
- No new animation subsystems. No GSAP, no additional 3D beyond the existing lazy
  `ProductWall3D`.
- Per-merchant accent extracted from product photography — interesting, unpredictable,
  and would gamble the AA contrast work. Revisit later.
- `shadcn` component registry: a component library is the opposite of the fix here.

## Verification

1. Both servers up; open **`http://localhost:5173`** — CORS is pinned to that literal
   in `backend/app/main.py`; `127.0.0.1` fails silently.
2. Every console page in the sheet layout — no page left in the old card stack.
3. Contrast re-audited across **all four** zone/theme combinations. Gradients change the
   effective background a token sits on, so the Phase 1/2 AA results do not carry over.
4. Otto: idle hero, then the field, on an image-rich store and with `shortlist: null`.
5. The counter's numbers match the response — not recomputed client-side.
6. `prefers-reduced-motion`: entrances static. **Verify by toggling it in OS settings** —
   this has gone unverified for three phases because the media query cannot be emulated
   from the tooling here.
7. Zone wrappers render with JS animation disabled (the §4 fix).
8. Mobile 375px, no horizontal overflow in either zone.
9. `npm --prefix frontend run lint` and `build` clean; `pytest` — 102 passing.
