import { useEffect, useState } from 'react'
import { api } from '../api'

const POLL_MS = 2000

function resultClass(result) {
  if (result === 'success') return 'gap-pass'
  if (result === 'blocked') return 'gap-fail'
  return 'gap-fail'
}

export default function AuditLog({ merchantId }) {
  const [actions, setActions] = useState([])
  const [mandate, setMandate] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [selectedItem, setSelectedItem] = useState('')
  const [amount, setAmount] = useState('')
  const [purchaseResult, setPurchaseResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!merchantId) return
    api.getCatalog(merchantId).then((items) => {
      setCatalog(items)
      if (items.length > 0) {
        setSelectedItem(items[0].id)
        setAmount(String(items[0].price))
      }
    })
    api.getMandate().then(setMandate).catch(() => setMandate(null))
  }, [merchantId])

  useEffect(() => {
    if (!merchantId) return
    let cancelled = false
    const poll = () => {
      api.getAuditLog(merchantId).then((data) => {
        if (!cancelled) setActions(data)
      })
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [merchantId])

  function onSelectItem(id) {
    setSelectedItem(id)
    const item = catalog.find((c) => c.id === id)
    if (item) setAmount(String(item.price))
  }

  async function handlePurchase() {
    setBusy(true)
    setPurchaseResult(null)
    try {
      const result = await api.purchase(selectedItem, Number(amount))
      setPurchaseResult(result)
    } catch (err) {
      setPurchaseResult({ status: 'error', reason: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Audit Log</h1>
      <p className="muted">
        Every Diagnose / Fix / Transact action — reasoning, action taken, result — in plain
        language. Updates automatically.
      </p>

      <section className="card">
        <h2>Mandate (human-set boundary)</h2>
        {mandate ? (
          <p>
            Spend ceiling: <strong>₹{mandate.spend_ceiling}</strong> · Allow-listed merchants:{' '}
            {mandate.allow_listed_merchants.length}
          </p>
        ) : (
          <p className="muted">No mandate configured.</p>
        )}
      </section>

      <section className="card">
        <h2>Try a purchase (Transact Agent)</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selectedItem} onChange={(e) => onSelectItem(e.target.value)}>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (₹{item.price})
              </option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 100 }}
          />
          <button onClick={handlePurchase} disabled={busy || !selectedItem}>
            {busy ? 'Requesting…' : 'Attempt purchase'}
          </button>
        </div>
        {purchaseResult && (
          <p className={purchaseResult.status === 'success' ? 'gap-pass-inline' : 'gap-fail-inline'} style={{ marginTop: 10 }}>
            {purchaseResult.status.toUpperCase()}: {purchaseResult.reason || 'order created'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Actions</h2>
        <ul className="audit-list">
          {actions.map((a) => (
            <li key={a.id} className={resultClass(a.result)}>
              <div className="audit-head">
                <strong>{a.agent_name}</strong>
                <span className="audit-result">{a.result}</span>
                <span className="muted audit-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
              <div>{a.reasoning}</div>
            </li>
          ))}
          {actions.length === 0 && <p className="muted">No actions yet.</p>}
        </ul>
      </section>
    </div>
  )
}
