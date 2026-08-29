import { useState } from 'react'
import { api } from '../api'

export default function ImportStore({ onImported }) {
  const [storeUrl, setStoreUrl] = useState('neemans.com')
  const [merchantName, setMerchantName] = useState('Neemans')
  const [currency, setCurrency] = useState('INR')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleImport() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.importStore(storeUrl, merchantName, currency)
      setResult(data)
      onImported(data.merchant_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Import a real store</h1>
      <p className="muted">
        Pulls a real merchant's live product catalog from their public storefront feed and runs
        it through the same Diagnose → Fix → Transact pipeline as the demo merchants. Currently
        supports Shopify stores (any store that exposes a public <code>/products.json</code> feed
        — this is a standard Shopify storefront feature, not scraping).
      </p>

      <section className="card">
        <h2>Store details</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <label>
            Store domain
            <input
              type="text"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="e.g. neemans.com"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d3d8', marginTop: 4 }}
            />
          </label>
          <label>
            Merchant name (for display)
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d3d8', marginTop: 4 }}
            />
          </label>
          <label>
            Currency
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ width: 100, padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d3d8', marginTop: 4 }}
            />
          </label>
          <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
            Currency isn't published in the public product feed, so set it to match the store's
            actual pricing — the demo mandate compares amounts directly with no currency
            conversion, so this matters for the Transact step to make sense.
          </p>
          <button onClick={handleImport} disabled={busy || !storeUrl || !merchantName} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Importing…' : 'Import store'}
          </button>
        </div>
        {error && <p className="banner-error-inline">{error}</p>}
        {result && (
          <p className="gap-pass-inline" style={{ marginTop: 10 }}>
            Imported {result.item_count} products as "{result.merchant_name}". Created a spend
            mandate for it at ₹{result.mandate_spend_ceiling} (this store's median price, so
            roughly half its catalog is purchasable and half will hit the spend ceiling — adjust
            it any time on the Audit Log page). Select it from the merchant dropdown above to
            explore.
          </p>
        )}
      </section>
    </div>
  )
}
