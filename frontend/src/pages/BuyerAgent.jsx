import { useState } from 'react'
import { api } from '../api'

const EXAMPLE_GOALS = [
  'find a blue cotton shirt under 1500 rupees',
  'I want the Premium Wool-Blend Jacket',
  'find a pair of socks',
]

export default function BuyerAgent({ merchantId }) {
  const [goal, setGoal] = useState(EXAMPLE_GOALS[0])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleShop() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.buyerShop(merchantId, goal)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const purchase = result?.purchase_result

  return (
    <div className="page">
      <h1>Simulated Buyer Agent</h1>
      <p className="muted">
        Stands in for a real third-party shopping agent (ChatGPT, Gemini, etc). Give it a
        natural-language shopping goal — it fetches the published manifest, picks a match with
        Claude, then hands off to the mandate-gated Transact Agent.
      </p>

      <section className="card">
        <h2>Shopping goal</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {EXAMPLE_GOALS.map((g) => (
            <button key={g} className="link-button" onClick={() => setGoal(g)} disabled={busy}>
              {g}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d3d8' }}
          />
          <button onClick={handleShop} disabled={busy || !merchantId || !goal}>
            {busy ? 'Shopping…' : 'Shop'}
          </button>
        </div>
        {error && <p className="banner-error-inline">{error}</p>}
      </section>

      {result && (
        <section className="card">
          <h2>Result</h2>

          {result.status === 'no_manifest' && (
            <p className="gap-fail-inline">
              No manifest published for this merchant yet — go publish one on the Manifest page first.
            </p>
          )}

          {result.status === 'failed' && <p className="gap-fail-inline">Failed: {result.reason}</p>}

          {result.status === 'no_match' && (
            <p className="gap-fail-inline">No match found: {result.reasoning}</p>
          )}

          {result.status === 'purchase_attempted' && (
            <>
              <p>
                <strong>Selected:</strong> {result.selected_product.name} (₹
                {result.selected_product.price})
              </p>
              <p className="muted">{result.buyer_reasoning}</p>

              <div className={purchase.status === 'success' ? 'gap-pass' : 'gap-fail'} style={{ padding: 12, borderRadius: 6, marginTop: 10 }}>
                <strong>Transact Agent — {purchase.status.toUpperCase()}</strong>
                <p style={{ margin: '6px 0 0' }}>
                  {purchase.status === 'success'
                    ? `Order ${purchase.razorpay_order_id} created.`
                    : purchase.reason}
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
