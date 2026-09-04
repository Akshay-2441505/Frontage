import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useMerchants } from '../../context/MerchantContext'
import { formatMoney } from '../../lib/format'
import { spentUnderMandate } from '../../lib/spend'

function medianPrice(catalog) {
  if (catalog.length === 0) return null
  const prices = catalog.map((i) => i.price).sort((a, b) => a - b)
  return prices[Math.floor(prices.length / 2)]
}

export default function Settings() {
  const { merchantId, merchant } = useMerchants()

  const [mandate, setMandate] = useState(null)
  const [ceiling, setCeiling] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [actions, setActions] = useState([])

  // Dev-only direct purchase
  const [selectedItem, setSelectedItem] = useState('')
  const [amount, setAmount] = useState('')
  const [devResult, setDevResult] = useState(null)
  const [devBusy, setDevBusy] = useState(false)

  const currency = catalog[0]?.currency || 'INR'

  const reload = useCallback(async () => {
    if (!merchantId) {
      setMandate(null)
      setCatalog([])
      setActions([])
      return
    }
    const [m, items, log] = await Promise.all([
      api.getMandate(merchantId).catch(() => null),
      api.getCatalog(merchantId).catch(() => []),
      api.getAuditLog(merchantId).catch(() => []),
    ])
    setMandate(m)
    if (m) setCeiling(String(m.spend_ceiling))
    setCatalog(Array.isArray(items) ? items : [])
    setActions(Array.isArray(log) ? log : [])
    if (Array.isArray(items) && items.length > 0) {
      setSelectedItem((cur) => cur || items[0].id)
      setAmount((cur) => cur || String(items[0].price))
    }
  }, [merchantId])

  useEffect(() => {
    reload()
    setNotice(null)
    setError(null)
    setDevResult(null)
  }, [reload])

  const spent = useMemo(() => spentUnderMandate(actions, mandate), [actions, mandate])

  const remaining = mandate ? Math.max(0, mandate.spend_ceiling - spent) : 0
  const usedPct = mandate && mandate.spend_ceiling > 0
    ? Math.min(100, (spent / mandate.spend_ceiling) * 100)
    : 0

  async function save() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await api.setMandate({
        merchant_id: merchantId,
        spend_ceiling: Number(ceiling),
        allow_listed_merchants: [merchantId],
        created_by: 'demo-user',
      })
      await reload()
      setNotice(
        `Spending limit set to ${formatMoney(Number(ceiling), currency)}. This starts a fresh budget — anything spent under the old limit no longer counts against this one.`,
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function devPurchase() {
    setDevBusy(true)
    setDevResult(null)
    try {
      setDevResult(await api.purchase(selectedItem, Number(amount)))
    } catch (err) {
      setDevResult({ status: 'failed', reason: err.message })
    } finally {
      setDevBusy(false)
      reload()
    }
  }

  const isSpecific = mandate && mandate.merchant_id === merchantId

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Setup</p>
        <h1 className="page-head__title">Spending limit</h1>
        <p className="page-head__lede">
          The hard boundary an AI buyer cannot cross. Frontage checks every purchase against this
          before it touches Razorpay, and refuses anything over it — that refusal is the point, not
          an error.
        </p>
      </header>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Budget for {merchant?.name || 'this store'}</h2>
          {mandate && (
            <span className="pill pill--neutral">
              {isSpecific ? 'set for this store' : 'shared default'}
            </span>
          )}
        </div>

        {mandate ? (
          <div className="meter">
            <div className="meter__track">
              <div
                className="meter__fill"
                style={{ width: `${usedPct}%` }}
                data-level={usedPct >= 100 ? 'over' : usedPct >= 80 ? 'low' : 'ok'}
              />
            </div>
            <div className="meter__legend">
              <span>{formatMoney(spent, currency)} spent</span>
              <span className={usedPct >= 80 ? 'meter__warn' : undefined}>
                {formatMoney(remaining, currency)} left of{' '}
                {formatMoney(mandate.spend_ceiling, currency)}
              </span>
            </div>
            {usedPct >= 80 && (
              <p className="field__hint">
                Almost spent. The next purchase over {formatMoney(remaining, currency)} gets
                refused — raise the limit here if that isn't what you want.
              </p>
            )}
          </div>
        ) : (
          <div className="empty">
            <p className="empty__title">No limit set</p>
            <p className="empty__body">
              Without one, Frontage refuses to transact at all. Set an amount below.
            </p>
          </div>
        )}

        <div className="cluster" style={{ marginBlockStart: '1.125rem', alignItems: 'flex-end' }}>
          <label className="field" style={{ maxWidth: '12rem' }}>
            <span className="field__label">Total an agent may spend</span>
            <input
              type="number"
              className="field__control"
              value={ceiling}
              min="1"
              onChange={(e) => setCeiling(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={saving || !merchantId || !(Number(ceiling) > 0)}
          >
            {saving ? 'Saving…' : 'Save limit'}
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            disabled={catalog.length === 0}
            onClick={() => setCeiling(String(medianPrice(catalog)))}
          >
            Use this store's middle price
          </button>
        </div>

        <p className="field__hint" style={{ marginBlockStart: '0.75rem', maxWidth: '68ch' }}>
          The middle price puts roughly half this store's products under the limit and half over,
          so both a successful purchase and a refused one are reachable without hunting for the
          right product. It only fills the field — nothing changes until you save.
        </p>

        {notice && (
          <div className="notice notice--ok" style={{ marginBlockStart: '0.875rem' }}>
            <div className="notice__body">{notice}</div>
          </div>
        )}
        {error && (
          <div className="notice notice--bad" style={{ marginBlockStart: '0.875rem' }}>
            <div className="notice__body">
              <div className="notice__title">Couldn't save the limit</div>
              {error}
            </div>
          </div>
        )}
      </section>

      {/* Quarantined on purpose: this calls the Transact agent directly and skips
          the buyer agent entirely. It is a developer shortcut for testing the
          gates, not something a merchant would ever use. */}
      <details className="devbox">
        <summary>Developer tool — call the Transact agent directly</summary>
        <div className="devbox__body stack" style={{ '--stack-gap': '0.75rem' }}>
          <p className="field__hint" style={{ maxWidth: '68ch' }}>
            This skips Otto and the manifest, and asks the Transact agent to buy a specific item
            for a specific amount. Useful for firing a gate on demand — set an amount that differs
            from the listed price to trigger the price-drift refusal.
          </p>

          <div className="cluster" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ maxWidth: '22rem', flex: '1 1 16rem' }}>
              <span className="field__label">Product</span>
              <select
                className="field__control"
                value={selectedItem}
                onChange={(e) => {
                  setSelectedItem(e.target.value)
                  const item = catalog.find((c) => c.id === e.target.value)
                  if (item) setAmount(String(item.price))
                }}
              >
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatMoney(item.price, item.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ maxWidth: '9rem' }}>
              <span className="field__label">Amount</span>
              <input
                type="number"
                className="field__control"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={devPurchase}
              disabled={devBusy || !selectedItem}
            >
              {devBusy ? 'Requesting…' : 'Attempt purchase'}
            </button>
          </div>

          {devResult && (
            <div className={`notice notice--${devResult.status === 'success' ? 'ok' : 'bad'}`}>
              <div className="notice__body">
                <div className="notice__title">{devResult.status}</div>
                {devResult.status === 'success'
                  ? `Razorpay order ${devResult.razorpay_order_id} created.`
                  : devResult.reason}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
