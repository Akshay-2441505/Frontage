---
target: frontend/src/pages/console/Overview.jsx
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-04T15-11-31Z
slug: frontend-src-pages-console-overview-jsx
---
# Design Critique — console/Overview.jsx

Method: dual-agent (A: design review · B: detector + browser evidence, isolated and parallel)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | `error` never destructured from useConsole() (line 128). "Measure again" fails silently. Zero live regions. |
| 2 | Match System / Real World | 2 | "Products readable: 6 / 6 need work" — same 6. Label means products in catalog. |
| 3 | User Control and Freedom | 3 | Read-only, navigable, nothing traps you. |
| 4 | Consistency and Standards | 1 | Bar geometry contradicts the Elevation. `stat__sub--accent` has no CSS rule (verified: 0 occurrences). |
| 5 | Error Prevention | 3 | Failed fetches drop rather than show zero — deliberate, but silent. |
| 6 | Recognition Rather Than Recall | 2 | Current store looks identical to the other ten in the comparison panel. |
| 7 | Flexibility and Efficiency | 2 | Chart readout is onPointerMove only; tabIndex === -1. |
| 8 | Aesthetic and Minimalist Design | 2 | Two of four stat cards preview panels below them. Row measures 280/211/393px. |
| 9 | Error Recovery | 0 | No error surface. catch(() => {}) on both fetches. |
| 10 | Help and Documentation | 3 | card__note on the costing panel is genuinely good explanatory writing. |
| **Total** | | **19/40** | **Poor** |

## Design Specificity Verdict

"A generic SaaS dashboard wearing Frontage's paint. Strip the copy and nothing identifiably
Frontage survives." Default admin skeleton in default order: 4 stat cards -> wide area chart
-> donut + two bar panels -> wide feed. Relabellable for a CI pipeline unchanged.

The product already owns an authored element — the Elevation, where bay width IS the check's
weight. The Overview ignores it and CONTRADICTS it: RankedBars scales each bar to the largest
value in its own list ((row.value / max) * 100%, Charts.jsx:192), so a -10 loss draws a
100%-full red bar. Two pages encode one weighted rubric with incompatible geometries.

DETERMINISTIC SCAN IS A NULL RESULT, NOT A CLEAN BILL OF HEALTH. CLI returned [], exit 0.
Cause verified in source: HTML_EXTENSIONS = new Set(['.html','.htm']); detectLocalFile routes
everything else to the regex text engine. A .jsx file of textbook anti-patterns scores [];
the identical CSS as .html fires two findings.

THIS INVALIDATES AN EARLIER DECISION. The craft-pass spec says "the slop detector found 2
warnings across 36 files, zero in any JSX" and CUT the console relayout on that basis.
Zero-in-any-JSX was a scanner reporting on files it cannot read.

Overlay injection succeeded (port 8400, stopped). Six findings at 1440x900: three real
(ranked__label 29px overflow, kicker-above-heading, transition: width), three disproved.

## What's Working

1. Refusal to fabricate data — no revenue/customers/invented series.
2. card__note explains the encoding AND pre-empts the wrong reading.
3. Sparkline and area chart provably share one pathFor function.

Measured and good: 2 distinct box-shadows; every border 1px solid varying only by semantic
colour; zero horizontal overflow at 375px; 22/22 tab stops with visible focus rings.

## Priority Issues

[P1] RankedBars contradicts the product's own encoding. Scale to 100 so the empty track is
points retained. → /impeccable layout

[P1] Y-axis labels don't align with gridlines. .chart__scale is inset-block:0 on .chart
(235px incl. axis+readout) while ticks compute (r.y / 190) * 100%. Gridlines 12/67/123/178,
labels 15/83/152/220; bottom label sits 42px below the SVG. → /impeccable layout

[P1] Main action can fail in total silence. No error, no skeletons, no aria-live. Diagnose
has all four; none carried over. → /impeccable harden

[P1] Mobile feed destroyed — 6/6 rows truncated mid-word, no title attribute, no recovery
on any device. → /impeccable adapt

[P2] Alarmist thresholds (>= 85 ? 'warn' paints 99 and 98 as warnings; six of eleven amber)
and no "you are here" marker. → /impeccable colorize

## Persona Red Flags

Sam (screen-reader/keyboard): worst-served, a regression against Diagnose. Zero live regions.
Heading outline jumps H1 -> H2, skipping the stat grid. Feed outcome carried by COLOUR ALONE
— pill text is the agent name, pill class is the result.

Alex (power user): 16 same-weight controls, no primary. Loop's first action is a ghost button
in a card header. Chart readout hover-only.

Casey (mobile): ~600px scroll before any panel. Area chart's 600x190 viewBox stretched into
~230px at preserveAspectRatio="none" — 3:1 squash into a near-vertical cliff.

## Minor Observations

- Zero-measurement copy lies: "One measurement so far" renders when there are none.
- useAllScores fires N+1 requests — wrong scaling direction under a "connect more stores" CTA.
- The +35 win renders grey because stat__sub--accent has no rule.
- .dash occupies 74.5% of a 1475px page; middle row ragged by 182px.

## Questions to Consider

1. Why does the landing route open with a line chart instead of the Elevation?
2. Would you show this page to a judge before Diagnose? If not, the front door is wrong.
3. The costing panel has losses, weights and a Fix link — why stop at "-10" instead of
   "fixing this is worth twice what photos are worth"?
