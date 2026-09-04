import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { AreaChart, Donut, RankedBars, Sparkline } from '../../components/Charts'
import { baysFromReport } from '../../components/FrontageElevation'
import {
  IconArrowRight,
  IconArrowUp,
  IconGauge,
  IconShield,
  IconStore,
  IconWrench,
} from '../../components/Icons'
import { useMerchants } from '../../context/MerchantContext'
import { useConsole } from '../../layouts/ConsoleLayout'
import { formatScore } from '../../lib/format'

/* The console's overview.

   Everything here is measured, not estimated. Frontage has no revenue, no
   customers and no orders-over-time, and inventing a chart of any of them would
   make the dashboard a mockup. What it does have turned out to be plenty and
   was going unused: fifteen scored measurements per merchant reduced to a single
   "+35" badge, seventy-six timestamped agent actions with their outcomes, and
   eleven stores whose scores span 75 to 100 that were never shown together.

   The order is an argument, not a layout: where you stand, how you got here,
   what it is costing you, what the agents actually did, and how you compare. */

function StatCard({ label, value, sub, spark, tone, to, cta }) {
  return (
    <article className="stat">
      <p className="stat__label">{label}</p>
      <div className="stat__row">
        <span className="stat__value">{value}</span>
        {spark && spark.length > 1 && <Sparkline values={spark} tone={tone} />}
      </div>
      {sub && <p className={`stat__sub${tone ? ` stat__sub--${tone}` : ''}`}>{sub}</p>}
      {to && (
        <Link to={to} className="stat__cta">
          {cta}
          <IconArrowRight />
        </Link>
      )}
    </article>
  )
}

/* Scores for every merchant, for the comparison panel. Fetched here rather than
   added to /merchants, because it is one page's view and the endpoint is used
   by both zones. Failures are dropped rather than shown as zero -- a store whose
   report will not load has not scored nothing. */
function useAllScores(merchants) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!merchants || merchants.length === 0) {
      setRows([])
      return undefined
    }
    let cancelled = false

    Promise.all(
      merchants.map((m) =>
        api
          .getLatestDiagnosis(m.id)
          .then((r) => (r ? { key: m.id, label: m.name, value: Math.round(r.score) } : null))
          .catch(() => null),
      ),
    ).then((all) => {
      if (cancelled) return
      setRows(all.filter(Boolean).sort((a, b) => b.value - a.value))
    })

    return () => {
      cancelled = true
    }
  }, [merchants])

  return rows
}

function useAuditLog(merchantId) {
  const [log, setLog] = useState([])

  useEffect(() => {
    if (!merchantId) {
      setLog([])
      return undefined
    }
    let cancelled = false
    api
      .getAuditLog(merchantId)
      .then((entries) => {
        if (!cancelled) setLog(Array.isArray(entries) ? entries : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [merchantId])

  return log
}

const RESULT_TONE = { success: 'ok', blocked: 'warn', failed: 'bad' }

/* The backend stores naive UTC, so a timestamp arrives with no zone marker and
   Date.parse would read it as local time. Same fix as lib/spend.js. */
function parseUtc(value) {
  if (typeof value !== 'string') return NaN
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
}

function whenLabel(value) {
  const t = parseUtc(value)
  if (Number.isNaN(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function Overview() {
  const { merchantId, merchants, merchant } = useMerchants()
  const { report, history, running, runDiagnose } = useConsole()
  const [catalog, setCatalog] = useState([])

  const allScores = useAllScores(merchants)
  const log = useAuditLog(merchantId)

  useEffect(() => {
    if (!merchantId) {
      setCatalog([])
      return undefined
    }
    let cancelled = false
    api
      .getCatalog(merchantId)
      .then((items) => {
        if (!cancelled) setCatalog(Array.isArray(items) ? items : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [merchantId])

  const bays = useMemo(() => baysFromReport(report), [report])
  const series = useMemo(() => history.map((h) => h.score), [history])
  const seriesLabels = useMemo(
    () => history.map((h, i) => (i === 0 ? 'first measurement' : `run ${i + 1}`)),
    [history],
  )

  const score = report ? Math.round(report.score) : null
  const first = history.length > 0 ? history[0] : null
  const gained = report && first ? Math.round(report.score - first.score) : 0

  /* Points lost per check, which is the product's own argument made visible:
     the checks are weighted, so a half-failed heavy check costs more than a
     wholly failed light one. Ranked by cost rather than by rubric order. */
  const losses = useMemo(
    () =>
      bays
        .map((b) => ({
          key: b.key,
          label: b.meta.bay,
          value: Math.round((b.weight - b.points) * 10) / 10,
          tone: b.pass ? 'ok' : 'bad',
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [bays],
  )

  /* Every distinct product failing at least one check. */
  const needsWork = useMemo(() => {
    const ids = new Set()
    for (const bay of bays) {
      if (!Array.isArray(bay.gap?.failing_ids)) continue
      for (const id of bay.gap.failing_ids) ids.add(id)
    }
    return ids.size
  }, [bays])

  const outcomes = useMemo(() => {
    const counts = { success: 0, blocked: 0, failed: 0 }
    for (const a of log) if (a.result in counts) counts[a.result] += 1
    return counts
  }, [log])

  const recent = useMemo(
    () => [...log].sort((a, b) => parseUtc(b.timestamp) - parseUtc(a.timestamp)).slice(0, 6),
    [log],
  )

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Overview</p>
        <h1 className="page-head__title">
          {merchant ? merchant.name : 'Your storefront'}
        </h1>
        <p className="page-head__lede">
          What an AI shopping agent can see of this store, how that has moved, and what the
          agents have actually done here.
        </p>
      </header>

      <div className="statgrid">
        <StatCard
          label="Frontage score"
          value={score === null ? '—' : score}
          spark={series}
          tone="accent"
          sub={
            gained > 0 ? (
              <>
                <IconArrowUp />+{gained} since your first measurement
              </>
            ) : history.length > 1 ? (
              `${history.length} measurements`
            ) : null
          }
        />
        <StatCard
          label="Products readable"
          value={catalog.length}
          sub={needsWork > 0 ? `${needsWork} need work` : catalog.length ? 'all clean' : null}
          tone={needsWork > 0 ? 'bad' : 'ok'}
          to={needsWork > 0 ? '/merchant/diagnose' : undefined}
          cta="See which"
        />
        <StatCard
          label="Agent actions"
          value={log.length}
          sub={outcomes.blocked > 0 ? `${outcomes.blocked} refused by your rules` : 'none refused'}
          tone={outcomes.blocked > 0 ? 'warn' : 'ok'}
          to="/merchant/trail"
          cta="Open the trail"
        />
        <StatCard
          label="Stores connected"
          value={merchants?.length ?? 0}
          sub={allScores.length > 0 ? `${allScores.filter((s) => s.value === 100).length} at 100` : null}
          tone="ok"
        />
      </div>

      <div className="dash">
        <section className="card dash__wide">
          <div className="card__head">
            <h2 className="card__title">Score over time</h2>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={runDiagnose}
              disabled={running || !merchantId}
            >
              <IconGauge />
              {running ? 'Measuring…' : 'Measure again'}
            </button>
          </div>
          <AreaChart
            values={series}
            labels={seriesLabels}
            format={(v) => `${formatScore(v)} / 100`}
            caption={
              history.length > 1
                ? `${history.length} measurements, ${formatScore(history[0].score)} to ${formatScore(history[history.length - 1].score)}`
                : 'Not measured yet'
            }
          />
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="card__title">What agents did here</h2>
          </div>
          <Donut
            total={log.length}
            centreLabel="actions"
            slices={[
              { key: 'success', value: outcomes.success, tone: 'ok' },
              { key: 'blocked', value: outcomes.blocked, tone: 'warn' },
              { key: 'failed', value: outcomes.failed, tone: 'bad' },
            ]}
          />
          <ul className="legend">
            <li>
              <i className="legend__key legend__key--ok" />
              {outcomes.success} completed
            </li>
            <li>
              <i className="legend__key legend__key--warn" />
              {outcomes.blocked} refused by your spending rules
            </li>
            <li>
              <i className="legend__key legend__key--bad" />
              {outcomes.failed} failed
            </li>
          </ul>
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="card__title">What it's costing you</h2>
            <Link to="/merchant/fix" className="btn btn--quiet btn--sm">
              <IconWrench />
              Fix
            </Link>
          </div>
          {losses.length === 0 ? (
            <p className="chart__none">Nothing lost — this catalog passes every check.</p>
          ) : (
            <>
              <p className="card__note">
                Points below 100, by the check losing them. The checks aren't weighted equally,
                so this is ranked by cost rather than by how many products are involved.
              </p>
              <RankedBars rows={losses} format={(v) => `−${formatScore(v)}`} />
            </>
          )}
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="card__title">Across your stores</h2>
            <Link to="/merchant/connect" className="btn btn--quiet btn--sm">
              <IconStore />
              Connect
            </Link>
          </div>
          <RankedBars
            rows={allScores.map((r) => ({
              ...r,
              tone: r.value === 100 ? 'ok' : r.value >= 85 ? 'warn' : 'bad',
            }))}
            emptyLabel="No stores measured yet"
          />
        </section>

        <section className="card dash__wide">
          <div className="card__head">
            <h2 className="card__title">Recent agent activity</h2>
            <Link to="/merchant/trail" className="btn btn--quiet btn--sm">
              <IconShield />
              Full trail
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="chart__none">No agent has touched this store yet.</p>
          ) : (
            <ul className="feed">
              {recent.map((a) => (
                <li key={a.id} className="feed__row">
                  <span className={`pill pill--${RESULT_TONE[a.result] || 'neutral'} pill--plain`}>
                    {a.agent_name}
                  </span>
                  <span className="feed__what">{a.action_taken}</span>
                  <span className="feed__when">{whenLabel(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
