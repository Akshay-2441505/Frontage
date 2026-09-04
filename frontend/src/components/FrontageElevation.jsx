import { useEffect, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { checkMeta, formatScore, gapFraction, isPass } from '../lib/format'
import { SPRING, useMotionOK } from '../lib/motion'

/* The Frontage Elevation.

   Frontage is the real-estate term for a shop's street-facing width — how much
   of it a passer-by can see. The rubric is six checks, weighted by how much each
   one actually blocks an AI shopping agent (see CHECK_WEIGHTS in the backend's
   diagnose agent — this table mirrors it), which is six bays of a shopfront of
   uneven width. A bay lights up as far as the catalog carries it: fully glazed
   when every product passes that check, half lit when half of them do, shuttered
   when none. The dimension line above spans the lit width, so the drawing and
   the number always agree.

   So the score is not a figure printed next to a storefront. It IS the
   storefront. */

const RUBRIC_ORDER = [
  'agent_readable_feed',
  'programmatic_checkout',
  'price_availability_clarity',
  'name_disambiguation',
  'product_descriptions',
  'product_imagery',
]

const WEIGHTS = {
  agent_readable_feed: 25,
  programmatic_checkout: 25,
  price_availability_clarity: 20,
  name_disambiguation: 15,
  product_descriptions: 10,
  product_imagery: 5,
}

export function baysFromReport(report) {
  const gaps = report?.gaps || []
  const known = RUBRIC_ORDER.filter((key) => gaps.some((g) => g.check_name === key))
  const extra = gaps.map((g) => g.check_name).filter((name) => !RUBRIC_ORDER.includes(name))
  const order = known.length || extra.length ? [...known, ...extra] : RUBRIC_ORDER
  const fallbackWeight = order.length ? 100 / order.length : 25

  const raw = order.map((key) => ({ key, weight: WEIGHTS[key] ?? fallbackWeight }))

  /* Normalise to the checks this report actually contains.
     Older reports were scored against a four-check rubric and are still stored.
     Applying today's six-check weights to four of them totals 80, so the bay
     labels summed to 80 under a dimension line reading 100 — the drawing
     contradicting its own number, on five of eleven demo merchants. Scaling to
     whatever is present keeps the parts summing to the whole whatever rubric
     produced the report. */
  const total = raw.reduce((sum, b) => sum + b.weight, 0) || 1
  const scale = 100 / total

  /* Largest-remainder allocation, not per-weight rounding.
     Rounding each weight on its own reintroduces the same defect at a smaller
     scale: a four-check report scales 25 to 31.25, and two of those displayed as
     31.3 push the labels to 100.1. Handing the leftover to the largest
     fractional parts makes the displayed weights sum to exactly 100 whatever
     rubric produced the report. */
  const scaled = raw.map(({ key, weight }) => {
    const exact = weight * scale
    return { key, exact, floor: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  let leftover = 100 - scaled.reduce((sum, b) => sum + b.floor, 0)
  const byRemainder = [...scaled].sort((a, b) => b.remainder - a.remainder)
  const bonus = new Set()
  for (const b of byRemainder) {
    if (leftover <= 0) break
    bonus.add(b.key)
    leftover -= 1
  }

  return scaled.map(({ key, floor }) => {
    const gap = gaps.find((g) => g.check_name === key)
    const fraction = gap ? gapFraction(gap) : 0
    const weight = floor + (bonus.has(key) ? 1 : 0)
    return {
      key,
      gap,
      pass: isPass(gap?.status),
      fraction,
      points: Math.round(fraction * weight * 10) / 10,
      weight,
      meta: checkMeta(key),
    }
  })
}

function bayState(fraction) {
  if (fraction >= 1) return 'lit'
  if (fraction > 0) return 'partial'
  return 'shut'
}

/* Clamps the reading so it stays inside the drawing at both extremes. */
const readingPos = (score) => Math.min(Math.max(score / 2, 13), 87)

export default function FrontageElevation({ report, images = [], onSelectCheck, selectedCheck }) {
  const bays = baysFromReport(report)
  const measured = Boolean(report)
  const score = measured ? Math.max(0, Math.min(100, Number(report.score) || 0)) : 0
  const motionOK = useMotionOK()

  /* The score, the dimension line and the reading all read off ONE animated
     value.

     They used to be three independent things: the number was rendered directly
     from the report so it snapped, while the line ran on its own CSS transition
     — meaning the drawing and the figure printed beside it were briefly telling
     the viewer different numbers. The brief calls the fix-then-remeasure loop
     the product's core feedback loop, so it has to land as one event. */
  const shown = useMotionValue(score)
  const [display, setDisplay] = useState(score)

  useEffect(() => {
    const unsubscribe = shown.on('change', (v) => setDisplay(v))

    if (!motionOK) {
      shown.set(score)
      return unsubscribe
    }

    const controls = animate(shown, score, SPRING.score)
    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [score, motionOK, shown])

  const width = useTransform(shown, (v) => `${v}%`)
  const left = useTransform(shown, (v) => `${readingPos(v)}%`)

  /* Bay width IS the check's weight. Every bay used to be 1fr, so a check worth
     25 points looked exactly as wide as one worth 5 — which quietly hid the
     product's own argument, that fixing the fetchable catalog matters five times
     more than fixing photos. The same track list drives the bays, the pavement
     beneath them and the labels below, so all three stay in register. */
  const columns = bays.map((b) => `${b.weight}fr`).join(' ')

  const summary = measured
    ? `Frontage score ${formatScore(score)} out of 100. ` +
      bays
        .map((b) => `${b.meta.bay}, worth ${formatScore(b.weight)}: ${Math.round(b.fraction * 100)} per cent visible`)
        .join('. ')
    : `Frontage not measured yet. All ${bays.length} bays shuttered.`

  return (
    <figure className="elevation">
      <div className="elevation__measure" aria-hidden="true">
        <motion.div className="elevation__dim" style={{ width }} />
        <motion.span className="elevation__reading" style={{ left }}>
          <span className="num">{measured ? formatScore(display) : '—'}</span>{' '}
          <small>/ 100 visible</small>
        </motion.span>
      </div>

      {/* A live region so a remeasure is announced. The drawing itself is an
          image to AT, so without this the score changed in silence. */}
      <p className="sr-only" role="status" aria-live="polite">
        {measured ? `Frontage score ${formatScore(display)} out of 100.` : ''}
      </p>

      <div
        className="elevation__bays"
        role="img"
        aria-label={summary}
        style={{ '--tracks': columns }}
      >
        {bays.map((bay, i) => {
          /* A bay is the control for its own check when the page can act on the
             selection, and stays inert scenery when it cannot. Rendering a
             <button> that does nothing would promise an interaction the drawing
             does not have -- and a bay with no failing items has nothing to
             show, so it is not clickable either. */
          const selectable = Boolean(onSelectCheck) && (bay.gap?.failing_ids?.length ?? 0) > 0
          const Tag = selectable ? 'button' : 'div'

          return (
          <Tag
            key={bay.key}
            type={selectable ? 'button' : undefined}
            className="elevation__bay"
            data-state={bayState(bay.fraction)}
            data-selected={selectedCheck === bay.key ? 'true' : undefined}
            onClick={selectable ? () => onSelectCheck(bay.key) : undefined}
            aria-pressed={selectable ? selectedCheck === bay.key : undefined}
            title={
              selectable
                ? `Show the ${bay.gap.failing_ids.length} products failing ${bay.meta.bay.toLowerCase()}`
                : undefined
            }
            style={{ '--i': i, '--fill': bay.fraction }}
          >
            <div className="elevation__glass">
              {/* What makes a lit window read as lit is being able to see the
                  goods inside it. When the merchant has photography, each bay
                  shows one of their actual products through the glass — blurred
                  and dimmed, so it gives the drawing its colour without
                  competing with the score sitting above it. */}
              {images.length > 0 && (
                <span
                  className="elevation__goods"
                  style={{ backgroundImage: `url(${images[i % images.length]})` }}
                />
              )}
            </div>
            <div className="elevation__sill" />
          </Tag>
          )
        })}
      </div>

      <div
        className="elevation__pavement"
        aria-hidden="true"
        style={{ '--tracks': columns }}
      >
        {bays.map((bay, i) => (
          <div
            key={bay.key}
            className="elevation__spill"
            data-state={bayState(bay.fraction)}
            style={{ '--i': i, '--fill': bay.fraction }}
          />
        ))}
      </div>

      <figcaption className="elevation__labels" style={{ '--tracks': columns }}>
        {bays.map((bay) => (
          <div key={bay.key} className="elevation__label" data-state={bayState(bay.fraction)}>
            <span className="elevation__label-name">{bay.meta.bay}</span>
            <span className="elevation__label-pts">
              {formatScore(bay.points)} / {formatScore(bay.weight)}
            </span>
          </div>
        ))}
      </figcaption>
    </figure>
  )
}
