import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { IconPlug } from '../../components/Icons'
import { useMerchants } from '../../context/MerchantContext'
import { formatMoney } from '../../lib/format'

const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD']

export default function Connect() {
  const { reloadMerchants } = useMerchants()
  const [storeUrl, setStoreUrl] = useState('neemans.com')
  const [name, setName] = useState('Neemans')
  const [currency, setCurrency] = useState('INR')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.importStore(storeUrl, name, currency)
      setResult(data)
      reloadMerchants(data.merchant_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Setup</p>
        <h1 className="page-head__title">Connect a real store</h1>
        <p className="page-head__lede">
          Frontage reads the product feed every Shopify storefront publishes by default. Nothing is
          scraped and no login is needed — the same feed anyone can open in a browser. The store
          then runs through the identical measure, fix, and sell path as the demo ones.
        </p>
      </header>

      <section className="card">
        <form className="stack" style={{ '--stack-gap': '1.125rem' }} onSubmit={submit}>
          <label className="field">
            <span className="field__label">Store address</span>
            <input
              className="field__control"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="neemans.com"
              required
            />
            <span className="field__hint">
              A Shopify storefront domain. Stores that have switched their public product feed off
              can't be read this way.
            </span>
          </label>

          <label className="field">
            <span className="field__label">Show it as</span>
            <input
              className="field__control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Neemans"
              required
            />
          </label>

          <label className="field" style={{ maxWidth: '12rem' }}>
            <span className="field__label">Prices are in</span>
            <select
              className="field__control"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="field__hint">
              Shopify's public feed doesn't say which currency its prices are in, so you have to.
              Get this wrong and the spending limit compares the wrong numbers — amounts are never
              converted.
            </span>
          </label>

          <div>
            <button type="submit" className="btn btn--primary" disabled={busy || !storeUrl || !name}>
              <IconPlug />
              {busy ? 'Reading the catalog…' : 'Connect this store'}
            </button>
          </div>
        </form>

        {error && (
          <div className="notice notice--bad" style={{ marginBlockStart: '1rem' }}>
            <div className="notice__body">
              <div className="notice__title">Couldn't read that store</div>
              {error}
            </div>
          </div>
        )}

        {result && (
          <div className="notice notice--ok" style={{ marginBlockStart: '1rem' }}>
            <div className="notice__body">
              <div className="notice__title">
                {result.status === 'created' && `${result.merchant_name} is connected`}
                {result.status === 'refreshed' && `${result.merchant_name}'s catalog was refreshed`}
                {result.status === 'unchanged' && `${result.merchant_name} is already up to date`}
                {' — '}
                {result.item_count} {result.item_count === 1 ? 'product' : 'products'}
              </div>
              {result.status === 'created' && (
                <>
                  It's already allowed to sell to an agent, with a starting limit of{' '}
                  {formatMoney(result.mandate_spend_ceiling, currency)}.{' '}
                </>
              )}
              {result.status === 'refreshed' && (
                <>
                  The live store had changed since this was last connected, so its catalog was
                  replaced with the fresh pull — any Fix work on the old items will need
                  re-approving. Its spending limit was left exactly as set.{' '}
                </>
              )}
              {result.status === 'unchanged' && (
                <>Nothing on the live store has changed since it was last connected. </>
              )}
              <Link to="/merchant" style={{ color: 'inherit' }}>
                Measure its frontage →
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Stores this has been tried on</h2>
        </div>
        <div className="stack" style={{ '--stack-gap': '0.625rem' }}>
          <p className="field__hint" style={{ maxWidth: '70ch' }}>
            <strong style={{ color: 'var(--text)' }}>neemans.com</strong> — 12 products. Scored 75
            on the first measurement with clean descriptions already in place; the only gap was
            having no fetchable catalog. Publishing one took it to 100.
          </p>
          <p className="field__hint" style={{ maxWidth: '70ch' }}>
            <strong style={{ color: 'var(--text)' }}>bombayshavingcompany.com</strong> — 25
            products, imported end to end, confirming this isn't tuned to one store.
          </p>
        </div>
      </section>
    </div>
  )
}
