import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { Donut } from '../../components/Charts'
import { useMerchants } from '../../context/MerchantContext'
import { formatDateTime, formatTime } from '../../lib/format'

const POLL_MS = 2000

/* Actions arrive newest-first with no run id, so a run is inferred from time
   proximity: a buyer goal and the Transact decision it triggers land within a
   second or two of each other, while separate runs are seconds or minutes
   apart. This groups what actually happened together without inventing a link
   the backend never recorded. */
const RUN_GAP_MS = 20000

const AGENTS = ['Diagnose', 'Fix', 'BuyerAgent', 'Transact']
const RESULTS = ['success', 'blocked', 'failed']

function runTitle(actions) {
  const names = new Set(actions.map((a) => a.agent_name))
  if (names.has('Transact')) return 'Purchase attempt'
  if (names.has('BuyerAgent')) return 'Shopping goal'
  if (names.has('Fix')) return 'Fix run'
  if (names.has('Diagnose')) return 'Measurement'
  return 'Activity'
}

function runResult(actions) {
  if (actions.some((a) => a.result === 'blocked')) return 'blocked'
  if (actions.some((a) => a.result === 'failed')) return 'failed'
  return 'success'
}

function groupIntoRuns(actions) {
  const runs = []
  let current = null

  for (const action of actions) {
    const t = new Date(action.timestamp).getTime()
    if (!current || Math.abs(current.lastAt - t) > RUN_GAP_MS) {
      current = { id: action.id, actions: [action], lastAt: t, startedAt: action.timestamp }
      runs.push(current)
    } else {
      current.actions.push(action)
      current.lastAt = t
      current.startedAt = action.timestamp
    }
  }

  return runs
}

function outputSummary(action) {
  const out = action.output
  if (!out || typeof out !== 'object') return null
  if (out.order_id) {
    return out.payment_link_url
      ? `order ${out.order_id} · payment link ready`
      : `order ${out.order_id}`
  }
  if (Array.isArray(out.candidate_ids)) return `${out.candidate_ids.length} candidates surfaced`
  return null
}

export default function Trail() {
  const { merchantId, merchant } = useMerchants()
  const [actions, setActions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [agentFilter, setAgentFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('all')

  useEffect(() => {
    if (!merchantId) {
      setActions([])
      setLoaded(true)
      return undefined
    }

    let cancelled = false
    setLoaded(false)

    const poll = () => {
      api
        .getAuditLog(merchantId)
        .then((data) => {
          if (cancelled) return
          setActions(Array.isArray(data) ? data : [])
          setLoaded(true)
        })
        .catch(() => {
          if (!cancelled) setLoaded(true)
        })
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [merchantId])

  const filtered = useMemo(
    () =>
      actions.filter(
        (a) =>
          (agentFilter === 'all' || a.agent_name === agentFilter) &&
          (resultFilter === 'all' || a.result === resultFilter),
      ),
    [actions, agentFilter, resultFilter],
  )

  const runs = useMemo(() => groupIntoRuns(filtered), [filtered])

  const counts = useMemo(
    () => ({
      blocked: actions.filter((a) => a.result === 'blocked').length,
      failed: actions.filter((a) => a.result === 'failed').length,
      success: actions.filter((a) => a.result === 'success').length,
    }),
    [actions],
  )

  /* Counted from every action on record, not from the filtered view: the
     summary describes the trail, and it should not change when you narrow the
     list underneath it. */
  const outcomes = useMemo(() => {
    const counts = { success: 0, blocked: 0, failed: 0 }
    for (const a of actions) if (a.result in counts) counts[a.result] += 1
    return counts
  }, [actions])

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Step 3 · The record</p>
        <h1 className="page-head__title">Everything an agent did here</h1>
        <p className="page-head__lede">
          Every decision {merchant?.name || 'this store'}'s agents made — what they were trying to
          do, why they did or didn't do it, and what came back. Written as it happens, in plain
          language. Nothing here is editable.
        </p>
      </header>

      {/* The shape of the record, before the record itself.

         This came from a deleted Overview page, and it belongs here: the trail
         owns agent actions and had every one of them without ever saying how
         they turned out. Counts come from the same `actions` the list below
         renders, so the summary cannot disagree with what you scroll through. */}
      {actions.length > 0 && (
        <section className="card trail__summary">
          <Donut
            total={actions.length}
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
      )}

      <div className="spread">
        <div className="cluster">
          <label className="cluster" style={{ '--cluster-gap': '0.4375rem' }}>
            <span className="eyebrow">Agent</span>
            <select
              className="field__control"
              style={{ width: 'auto', paddingBlock: '0.375rem' }}
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="all">All</option>
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a === 'BuyerAgent' ? 'Buyer agent' : a}
                </option>
              ))}
            </select>
          </label>

          <label className="cluster" style={{ '--cluster-gap': '0.4375rem' }}>
            <span className="eyebrow">Outcome</span>
            <select
              className="field__control"
              style={{ width: 'auto', paddingBlock: '0.375rem' }}
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
            >
              <option value="all">All</option>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="cluster">
          {counts.success > 0 && <span className="pill pill--ok">{counts.success} went through</span>}
          {counts.blocked > 0 && <span className="pill pill--bad">{counts.blocked} refused</span>}
          {counts.failed > 0 && <span className="pill pill--warn">{counts.failed} failed</span>}
        </div>
      </div>

      {!loaded && (
        <div className="card stack" style={{ '--stack-gap': '0.75rem' }}>
          <span className="skeleton" style={{ height: '1rem', width: '40%' }} />
          <span className="skeleton" style={{ height: '3rem' }} />
        </div>
      )}

      {loaded && runs.length === 0 && (
        <div className="empty">
          <p className="empty__title">
            {actions.length === 0 ? 'Nothing has happened yet' : 'Nothing matches those filters'}
          </p>
          <p className="empty__body">
            {actions.length === 0
              ? 'Measure this store, publish a catalog, or send Otto shopping — every step lands here as it happens.'
              : 'Widen the agent or outcome filter to see the rest of the record.'}
          </p>
        </div>
      )}

      {runs.map((run) => (
        <section key={run.id} className="card">
          <div className="card__head">
            <h2 className="card__title">{runTitle(run.actions)}</h2>
            <div className="cluster">
              <span
                className={`pill pill--${
                  runResult(run.actions) === 'success'
                    ? 'ok'
                    : runResult(run.actions) === 'blocked'
                      ? 'bad'
                      : 'warn'
                }`}
              >
                {runResult(run.actions) === 'blocked' ? 'refused' : runResult(run.actions)}
              </span>
              <span className="dim" style={{ fontSize: '0.75rem' }}>
                {formatDateTime(run.startedAt)}
              </span>
            </div>
          </div>

          <div className="thread">
            {[...run.actions].reverse().map((action) => {
              const summary = outputSummary(action)
              return (
                <div key={action.id} className="thread__step" data-result={action.result}>
                  <div className="thread__head">
                    <span className="thread__agent">
                      {action.agent_name === 'BuyerAgent' ? 'Buyer agent' : action.agent_name}
                    </span>
                    <span
                      className={`pill pill--${
                        action.result === 'success'
                          ? 'ok'
                          : action.result === 'blocked'
                            ? 'bad'
                            : 'warn'
                      }`}
                    >
                      {action.result === 'blocked' ? 'refused' : action.result}
                    </span>
                    <span className="thread__time">{formatTime(action.timestamp)}</span>
                  </div>
                  <p className="thread__reason">{action.reasoning}</p>
                  <p className="thread__action">
                    {action.action_taken}
                    {summary ? ` — ${summary}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
