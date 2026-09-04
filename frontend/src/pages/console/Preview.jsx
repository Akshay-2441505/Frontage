import { useState } from 'react'
import { api } from '../../api'
import { useMerchants } from '../../context/MerchantContext'
import { formatMoney } from '../../lib/format'

/* Dry-run only, on purpose: this reuses shop() with dry_run=true, which skips
   attempt_purchase() entirely. A merchant testing scenarios against their own
   catalog should never be able to burn through the shared Razorpay test-mode
   order quota that the real Otto demo depends on. */

function ResultCard({ result }) {
  if (result.status === 'would_purchase') {
    const p = result.selected_product
    return (
      <div className="notice notice--ok">
        <div className="notice__body">
          <div className="notice__title">Otto would buy: {p.name}</div>
          <p>{formatMoney(p.price, p.currency)}</p>
          {p.image_url && (
            <img
              src={p.image_url}
              alt={p.name}
              style={{ maxWidth: '10rem', borderRadius: 'var(--radius-s, 8px)', marginBlock: '0.5rem' }}
            />
          )}
          <p className="field__hint">{result.buyer_reasoning}</p>
        </div>
      </div>
    )
  }

  if (result.status === 'ambiguous') {
    return (
      <div className="notice notice--warn">
        <div className="notice__body">
          <div className="notice__title">Ambiguous — {result.candidates.length} equally-plausible matches</div>
          <p className="field__hint">{result.reasoning}</p>
          <ul className="stack" style={{ '--stack-gap': '0.375rem', marginBlockStart: '0.5rem' }}>
            {result.candidates.map((c) => (
              <li key={c.id}>
                {c.name} · {formatMoney(c.price, c.currency)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (result.status === 'need_more_info') {
    return (
      <div className="notice notice--info">
        <div className="notice__body">
          <div className="notice__title">Otto would ask a clarifying question</div>
          <p className="field__hint">{result.reasoning}</p>
        </div>
      </div>
    )
  }

  if (result.status === 'no_manifest') {
    return (
      <div className="notice notice--bad">
        <div className="notice__body">
          <div className="notice__title">No published manifest</div>
          Publish a manifest from the Fix step before testing goals against this store.
        </div>
      </div>
    )
  }

  // no_match, invalid_selection, failed
  return (
    <div className="notice notice--bad">
      <div className="notice__body">
        <div className="notice__title">{result.status === 'no_match' ? 'No match' : result.status}</div>
        {result.reasoning || result.reason || 'Otto could not resolve this goal.'}
      </div>
    </div>
  )
}

export default function Preview() {
  const { merchantId, merchant } = useMerchants()
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function test() {
    if (!merchantId || !goal.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.buyerShop(merchantId, goal.trim(), [], true))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">The loop</p>
        <h1 className="page-head__title">Preview as Otto</h1>
        <p className="page-head__lede">
          Type a goal the way a buyer might phrase it and see exactly what Otto would pick from{' '}
          {merchant?.name || 'this store'}'s catalog, and why — a dry run, so nothing is actually
          purchased and no Razorpay order is created.
        </p>
      </header>

      <section className="card">
        <div className="cluster" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 20rem' }}>
            <span className="field__label">Goal</span>
            <input
              type="text"
              className="field__control"
              value={goal}
              placeholder="e.g. a green striped t-shirt under 2000 rupees"
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && test()}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={test}
            disabled={busy || !merchantId || !goal.trim()}
          >
            {busy ? 'Testing…' : 'Test'}
          </button>
        </div>

        {!merchantId && (
          <p className="field__hint" style={{ marginBlockStart: '0.75rem' }}>
            Pick a store above to test goals against its catalog.
          </p>
        )}
      </section>

      {error && (
        <div className="notice notice--bad">
          <div className="notice__body">
            <div className="notice__title">Request failed</div>
            {error}
          </div>
        </div>
      )}

      {result && <ResultCard result={result} />}
    </div>
  )
}
