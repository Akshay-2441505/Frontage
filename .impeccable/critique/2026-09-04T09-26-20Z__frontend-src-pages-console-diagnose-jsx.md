---
target: the current UI (console + Otto)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-04T09-26-20Z
slug: frontend-src-pages-console-diagnose-jsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), run isolated and in parallel.

Disclosure: the parent context had already seen detector output before Assessment A returned, so the *synthesis* was mildly anchored. Assessment A itself ran clean and its specificity verdict is unanchored.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons, busy labels and Otto's payment poll are handled. But `FrontageElevation` is `role="img"` with a static label and **no live region** — "Measure again" changes the score silently for AT, and an unchanged score gives no acknowledgement at all. |
| 2 | Match System / Real World | 3 | The `CHECKS` table is the best writing in the product. Undone at the worst moment: Otto's refusal renders raw backend prose saying **"mandate" twice in the buyer surface**, which DESIGN_BRIEF §9 forbids, with unformatted `₹4999` sitting above a correctly formatted `₹4,999`. |
| 3 | User Control and Freedom | 2 | `merchantId` lives in React state only — no URL param, no persistence. Reload returns you to Bloom & Thread. No deep links, no undo, no way to clear an Otto conversation. A blocked purchase is a terminal state. |
| 4 | Consistency and Standards | 2 | Three check-counts on one page: lede says "Six things", empty state says "the four checks", drawing renders 4 or 6 bays depending on report staleness. Trail shows the same outcome as `WENT THROUGH` / `success` / `REFUSED` in three places. |
| 5 | Error Prevention | 3 | Genuinely strong — wall clicks write the goal rather than send it, `AddressConfirm` gates checkout, the dev panel is quarantined, "middle price" fills without saving. Gap: "Save limit" can be set below money already spent with no warning. |
| 6 | Recognition Rather Than Recall | 2 | Under 640px `.elevation__labels` becomes 2 columns while `.elevation__bays` stays 6 — **the label↔bay mapping is destroyed**. Bays are non-interactive, so you cannot get from "the dark one" to "why". The 11-store picker shows no scores. |
| 7 | Flexibility and Efficiency | 1 | No skip link (10 rail tab-stops before content, every page). No keyboard shortcuts, no deep links, no search in an 11-store picker, no filter/sort on a 26-card grid. |
| 8 | Aesthetic and Minimalist Design | 3 | Disciplined tokens, real semantic colour, a convincing zone split. But the bottom **1,623px of 2,645px** of Diagnose is an undifferentiated grid answering no question the page asked. |
| 9 | Error Recovery | 2 | `no_match` and `invalid_selection` say what to do next. The two that matter most do not: console diagnose failure prints a bare `err.message`, and Otto's blocked purchase offers **no action** and never states the remaining budget. |
| 10 | Help and Documentation | 3 | The in-place `jargon` glosses do exactly what the brief asks. Penalised because the lede teaches a reading of the drawing the drawing does not honour. |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment: the design is product-specific. The "generic" hypothesis that drove the committed spec is wrong.**

Strip the copy out of Diagnose and the page still cannot be repurposed. The Elevation is a shopfront drawn as an architectural elevation — dimension line, glazing bars, sills, pavement, light spill — generated from one merchant's rubric weights. The colour reservation is a semantic system, not a palette: mint exclusively for money that actually moved through Razorpay, rose rather than red because a refusal is the system working. The two zones assign the *same token names* to opposed values (radii 5/8/12 vs 12/18/26, Archivo vs Bricolage), so every primitive works in either zone without knowing which it is in. That is not templated work.

**"Flat" is half-right but misdiagnosed.** There is a material system — layered gradients on `.elevation`, `.elevation__glass::after`, `.elevation__spill`, `.cat-thumb`, `.gate`. It simply **stops at the edge of the one illustration**. Everything outside that band is `background: var(--surface)` plus `1px solid var(--line)`, forever.

**Deterministic scan: 2 findings across 36 files, zero in any JSX.**

- `side-tab` (slop) — base.css:593 — **false positive.** `width:0; height:0` with transparent block borders is the CSS border-triangle idiom drawing a disclosure caret, not an accent bar on a card. Matched on the literal string.
- `layout-transition` (quality) — console.css:771 — **valid, minor.** `.meter__fill { transition: width }` animates a layout property. It is a childless leaf inside a fixed-height clipped track, so no thrash cascade. `transform: scaleX()` is a drop-in.

A slop detector finding one true warning in 36 files, none of it in markup, is corroborating evidence against the "AI slop" reading.

**Container uniformity — the evidence contradicts the claim.** The stylesheets declare 19 distinct `border-radius` values, 15 border treatments across 6 widths, and 9 box-shadows of which every one is unique. What is true is narrower: the rendered console shows **0 box-shadows** and leans on 1px lines with radius doing the differentiating. Not sameness — flatness, and only in one zone.

**Visual overlays:** injection succeeded and the overlay ran, but two of its findings were self-contamination and are discarded — a `low-contrast` hit reporting the overlay's own amber highlight composited over `--surface`, and ~130 bogus light-theme failures caused by its translucent ancestor. All numbers below were re-measured overlay-free.

## Overall Impression

This is better work than the brief that commissioned this critique assumed, and it has two defects serious enough that no amount of restyling would matter.

The signature element — the thing the whole product is named for — **contradicts its own number**. The bays are equal width while the weights are 25/25/20/15/10/5. The weight table is never normalised to the checks actually present, so five merchants carrying stale 4-check reports render labels summing to 80, three of them under a reading of **100/100**. And the fill is vertical while the dimension line measuring the same quantity is horizontal.

The second is smaller and worse: the before/after badge has never rendered once, because of a single reversed index.

The biggest opportunity is not a redesign. It is that several finished ideas in this codebase stalled one wire short of working.

## What's Working

1. **The two-zone architecture is real, not cosmetic.** Same token names, opposed values, every `base.css` primitive zone-agnostic. Most attempts at "two brands, one app" produce one brand with a hue rotation. This delivers the brief's Reading A — you cannot mistake which product you are in.

2. **Colour carries meaning and the meanings are defended.** Mint reserved for money that moved. Rose not red for refusals. Every `--text-dim` carries its measured ratio in a comment. This is arithmetic, not eyeballing.

3. **`gapFraction` and the `CHECKS` table.** The rubric is translated into consequences ("An agent will not guess… it skips the product rather than risk getting it wrong"), and `gapFraction` parses "3 of 6 products have…" out of backend prose so a failing check still shows the points it *is* earning. Design work done in a util file.

## Priority Issues

### [P0] The signature element contradicts its own number
**Why it matters.** The file header states the conceit: "the score is not a figure printed next to a storefront. It IS the storefront." If the geometry does not encode the score it is a decorative bar chart with a story attached — and on 5 of 11 demo merchants the labels demonstrably do not sum to the reading. A judge who checks the arithmetic finds it wrong.

**Fix.** Drive `grid-template-columns` from the weights (`bays.map(b => b.weight + 'fr')`) on bays, labels and pavement together. Normalise weights to the checks actually present (`weight * 100 / sum`) so labels always total the reading. Change the partial fill from a vertical `clip-path` to a horizontal one, so lit *width* is literally the score and the dimension line lands where the light stops with no separate calculation. Derive the lede's count from `bays.length`.

**Suggested command:** `/impeccable layout`

### [P0] The core feedback loop has never rendered
**Why it matters.** DESIGN_BRIEF §7: the score improving after a fix "should be impossible to miss." `Diagnose.jsx:107` reads `history[history.length - 1]`, but history returns oldest-first — so `first` is the newest run and `gained` is always exactly 0. Verified: Bloom & Thread history is `[50.0, … 85.0]`; the code compares 85 against 85. `.delta`, `.delta__step`, `.delta__val` and `.delta__arrow` were styled and never wired at all.

**Fix.** `history[0]`. Then wire the existing `.delta` component into the Diagnose header and animate the elevation *from* the old score on remeasure. One index turns demo beat 6 from a sentence into a moment.

**Suggested command:** `/impeccable polish`

### [P1] The money moment leaks backend voice and offers no exit
**Why it matters.** This is the graded failure case and the emotional low of the demo, and it is the one screen where the buyer-facing vocabulary rule breaks. It says "mandate" twice, shows unformatted currency, never states the remaining budget, and offers no next action.

**Fix.** Stop rendering `purchase.reason` in the buyer zone; compose client-side from numbers `BudgetBreach` already fetches — *"That's ₹4,999 and this store's shopper budget has ₹1,201 left. I stopped before paying."* Add a fourth legend item for remaining, and one button: **"Find me something under ₹1,201"** calling `send()`. Move the verdict above the product card — peak-end currently ends on a hero shot of the thing you were denied.

**Suggested command:** `/impeccable clarify`

### [P1] Diagnose's bottom 61% cannot answer the question its top half asks
**Why it matters.** The gap row says "6 of 6 products have no product image", then renders all 26 products with no filter, no sort, no marker for which ones fail. The page names a defect and denies you any way to act on it. This is the largest cognitive-load failure and the reason it reads as a database viewer.

**Fix.** Make the gap rows drive the grid — clicking a gap filters to its failing items and re-titles the section. Default to failing items with "Show all 26" as the escape. Turn `.elevation__bay` into a `<button>` that selects its check.

**Suggested command:** `/impeccable layout`

### [P2] Console light theme misses AA, and one focus ring is effectively absent
**Why it matters.** My earlier audits measured tokens against `--raised` and reported all four combos passing. Measuring *rendered* text against its actual background finds **console-light failing consistently at 4.14–4.46** — every case tracing to `--text-dim #6a6288` on `--bg-deep #e5e2ee`. Three of them (`brandmark__sub`, `rail-group__label`, `rail-foot__note`) appear on every console page. Separately `shop.css:561` sets `outline: none` on `:focus` rather than `:focus-visible`, killing the composer's keyboard ring; the `:focus-within` border that remains measures **1.47:1** against a 3:1 threshold.

**Fix.** One nudge to light-theme `--text-dim` clears the majority; re-measure syntax tokens against `--bg-deep` specifically. Change `:focus` to `:focus-visible` and add a real ring.

**Suggested command:** `/impeccable audit`

## Cognitive Load — 5 of 8 fail

Failing: **single focus** (Diagnose does three jobs), **grouping** (six checks rendered twice with no visual connection; mapping destroyed under 640px), **one thing at a time** ("Measure again" and "Fix 2 gaps" adjacent with no stated precedence), **≤4 choices**, **working memory** (page names a gap, then makes you scroll 700px and eyeball 26 cards to find it).

Decision points over four options: merchant picker (11, no search, no scores), Trail filters (9 chips visible), catalog grid (26 cards), Otto's ambiguity list (5+).

## Persona Red Flags

**Alex (power user).** `merchantId` is React state only — no URL param, no localStorage — so no page can be linked, bookmarked or restored; every reload snaps to Bloom & Thread. The 11-store picker has no search and shows no scores, so "which store is worst?" is 11 sequential selections. No sort, filter or bulk approve on 26 cards. No keyboard shortcuts anywhere.

**Sam (screen reader / keyboard).** No skip link — 10 rail tab-stops before content on every page. `MerchantPicker` puts `role="listbox"` on a `<ul>` whose `<li>` wrap `<button role="option">`; the intervening `listitem` breaks the required ARIA parent/child relationship, and there is no arrow-key navigation, no `aria-activedescendant`, no focus move on open. `.elevation__measure` is `aria-hidden`, and with no live region the score changes silently on remeasure. Measured positives: 25 of 26 tab stops show a real 2px ring at 6.87:1 in the console.

**Casey (distracted, mobile).** At 375px: six 45px bays, labels in a 2-column grid that no longer line up with the bays they name, a horizontally scrolling nav strip hiding "Preview as Otto" behind a scrollbar with no affordance, 30–38px tap targets against a 44px minimum, and ~3,000px of scroll for a six-product store. Verified positive: **zero unclipped horizontal overflow** on any route.

## Minor Observations

- `"Show all 2393 characters"` — a developer's unit, ungrouped digits, in a product whose `format.js` makes a point of `en-IN` grouping.
- Empty state says "Run the Diagnose agent"; the button says "Measure my frontage". The brief's own rule — an action keeps its name — broken in adjacent elements.
- The card headed "2 gaps between you and an agent" lists all six checks, four saying "passing".
- `.gap-row` uses `open={!bay.pass}` uncontrolled, so any re-render discards what the user expanded.
- `Attribution` reprints the merchant name `ProductCard` just printed.
- `.elevation__goods` is dead for exactly the merchants the drawing most needs to dramatise — `shopfrontImages` is empty precisely when `product_imagery` fails.
- Unbounded paragraphs run long: `field__hint` 158 ch, `cat-item__desc` 141 ch, `thread__action` 136 ch. Elements with `max-width` (`thread__reason` 92, `page-head__lede` 73) are fine — the fix is a `max-width`, not a rewrite.
- Trail over-merges: four unrelated shopping goals grouped into one "Shopping goal · FAILED" thread.

## Questions to Consider

1. If the bays were sized by weight, "Fetchable catalog" would be a quarter of the shopfront and "Product photos" a twentieth. **Would a merchant then instantly see that fixing photos is nearly pointless and fixing the feed is everything?** That is the product's entire argument, currently invisible because all six bays are identical.
2. The drawing has no *before*. What if the unlit portion were scaffolding rather than shutters, and a remeasure animated it coming down?
3. Why is the catalog on Diagnose at all? If the gap rows filtered it, the grid becomes evidence. If they don't, it belongs on Fix.
4. Should the shopper see whose rule stopped them — *"Bloom & Thread set a ₹1,500 budget for agent purchases"* — turning "the robot said no" into "the shop has a policy"?
5. `.delta` was designed, styled and never wired. What else here is a finished idea one wire short — and is the real remaining work *connecting what exists* rather than building anything new?
