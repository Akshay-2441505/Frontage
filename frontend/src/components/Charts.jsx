import { useId, useMemo, useState } from 'react'

/* Charts, hand-rolled in SVG.

   No chart library. The rest of this frontend is hand-rolled against a token
   system with two zones that assign the same names to opposed values, and every
   charting library wants to own its own colours, fonts and theming. Four shapes
   is less code than the adapter layer would be, and these inherit the zone's
   tokens for free because they are just elements.

   Every one of them draws real data or renders nothing. There is no placeholder
   series anywhere in this file. */

/* Turns a series into a path. Shared by the sparkline and the area chart so a
   number and its enlargement can never trace different curves. */
function pathFor(values, w, h, pad = 2) {
  if (values.length === 0) return { line: '', area: '', points: [] }
  const min = Math.min(...values)
  const max = Math.max(...values)
  /* A flat series has no range to scale against; without this it divides by
     zero and every point lands on NaN. Draw it as a level line instead. */
  const span = max - min || 1
  const innerH = h - pad * 2
  const step = values.length > 1 ? w / (values.length - 1) : 0

  const points = values.map((v, i) => ({
    x: values.length > 1 ? i * step : w / 2,
    y: pad + innerH - ((v - min) / span) * innerH,
    v,
  }))

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return { line, area, points }
}

/* A number's own history, sized to sit beside it. */
export function Sparkline({ values, width = 96, height = 30, tone = 'accent' }) {
  const { line } = useMemo(() => pathFor(values, width, height, 3), [values, width, height])
  if (values.length < 2) return null

  return (
    <svg
      className={`spark spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path d={line} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* The same series, given room, with a readout that follows the pointer. */
export function AreaChart({ values, labels = [], height = 190, format = (v) => v, caption }) {
  const gradientId = useId()
  const [hover, setHover] = useState(null)
  const W = 600
  const { line, area, points } = useMemo(() => pathFor(values, W, height, 12), [values, height])

  if (values.length < 2) {
    return (
      <p className="chart__none">
        One measurement so far — the line appears once there are two to draw between.
      </p>
    )
  }

  const active = hover === null ? null : points[hover]

  /* Gridlines and a scale. Without them a line chart is a shape: you can see
     that it went up, but not from what to what, and every point is unreadable
     in absolute terms. Four rules across the actual range of the data, not a
     rounded axis -- the range here is a score out of 100 and inventing tidy
     bounds would flatten a real 50-to-88 climb into nothing. */
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const rules = [0, 1, 2, 3].map((i) => {
    const t = i / 3
    return { y: 12 + (height - 24) * t, value: hi - (hi - lo) * t }
  })

  return (
    <figure className="chart">
      <div className="chart__scale" aria-hidden="true">
        {rules.map((r) => (
          <span key={r.y} style={{ top: `${(r.y / height) * 100}%` }}>
            {format(r.value)}
          </span>
        ))}
      </div>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={caption}
        preserveAspectRatio="none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - box.left) / box.width
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="chart__stop-a" />
            <stop offset="100%" className="chart__stop-b" />
          </linearGradient>
        </defs>

        {rules.map((r) => (
          <line
            key={r.y}
            x1="0"
            y1={r.y}
            x2={W}
            y2={r.y}
            className="chart__rule"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          className="chart__line"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <>
            {/* non-scaling-stroke everywhere: the viewBox is stretched to the
                panel width, so a plain stroke would render thicker vertically
                than horizontally. */}
            <line
              x1={active.x}
              y1="0"
              x2={active.x}
              y2={height}
              className="chart__cursor"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={active.x} cy={active.y} r="4" className="chart__dot" />
          </>
        )}
      </svg>

      {labels.length > 1 && (
        <div className="chart__axis" aria-hidden="true">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}

      {/* The readout, like the scale and axis, sits outside the SVG: text inside
          a stretched viewBox is distorted with it and cannot opt out. */}
      <figcaption className="chart__readout" aria-hidden="true">
        {active ? (
          <>
            <span className="chart__readout-val">{format(active.v)}</span>
            {labels[hover] && <span className="chart__readout-at">{labels[hover]}</span>}
          </>
        ) : (
          <span className="chart__readout-hint">{caption}</span>
        )}
      </figcaption>
    </figure>
  )
}

/* A ranked list where the bar IS the quantity. Used for the checks costing the
   most points and for stores by score. */
export function RankedBars({ rows, format = (v) => v, emptyLabel = 'Nothing to rank' }) {
  if (!rows || rows.length === 0) return <p className="chart__none">{emptyLabel}</p>

  const max = Math.max(...rows.map((r) => r.value)) || 1

  return (
    <ul className="ranked">
      {rows.map((row) => (
        <li key={row.key} className="ranked__row" data-tone={row.tone}>
          <span className="ranked__label" title={row.label}>
            {row.label}
          </span>
          <span className="ranked__track">
            <span className="ranked__fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="ranked__val">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/* Parts of a whole, for outcomes that are counts rather than a series. */
export function Donut({ slices, total, centreLabel, size = 132 }) {
  const sum = slices.reduce((a, s) => a + s.value, 0)
  if (sum === 0) return <p className="chart__none">No agent activity yet</p>

  const r = size / 2 - 11
  const circumference = 2 * Math.PI * r

  /* Each arc starts where the previous one ended. Computed up front rather than
     accumulated inside the map: mutating a variable while rendering is exactly
     the pattern that misbehaves when React re-runs a render, and the offsets are
     a pure function of the slices anyway. */
  const arcs = []
  let start = 0
  for (const s of slices) {
    const len = (s.value / sum) * circumference
    arcs.push({ ...s, len, start })
    start += len
  }

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth="11"
              className={`donut__arc donut__arc--${a.tone}`}
              strokeDasharray={`${a.len} ${circumference - a.len}`}
              strokeDashoffset={-a.start}
            />
          ))}
        </g>
      </svg>

      <div className="donut__centre">
        <span className="donut__total">{total ?? sum}</span>
        <span className="donut__label">{centreLabel}</span>
      </div>
    </div>
  )
}
