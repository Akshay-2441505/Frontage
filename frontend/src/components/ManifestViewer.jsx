import { useState } from 'react'
import { manifestUrl } from '../api'
import { formatDateTime, formatMoney } from '../lib/format'
import { IconCheck, IconCopy } from './Icons'
import JsonBlock from './JsonBlock'

/* Replaces the raw <pre> dump the old Manifest page led with.

   The manifest is the thing this product is proudest of, so it gets shown as
   what it is: a reachable address, and a per-product view of exactly the fields
   an agent reads. The raw JSON is still here — it is the real artifact — but it
   sits behind a disclosure instead of being the headline. */

const FIELDS = [
  ['name', 'Name'],
  ['description', 'Description'],
  ['price', 'Price'],
  ['availability', 'Availability'],
  ['variant_info', 'Options'],
]

function renderValue(key, product) {
  const value = product[key]

  if (key === 'price') {
    return formatMoney(value, product.currency)
  }

  if (key === 'variant_info') {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      return <span className="manifest-field__val--empty">none listed</span>
    }
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' · ')
  }

  if (value === null || value === undefined || String(value).trim() === '') {
    return <span className="manifest-field__val--empty">empty — an agent sees nothing here</span>
  }

  if (key === 'availability') return String(value).replace(/_/g, ' ')

  return String(value)
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked (insecure context or denied permission) — the address
      // is on screen and selectable, so this is a convenience, not the only path.
      setCopied(false)
    }
  }

  return (
    <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function ManifestViewer({ manifest, merchantId }) {
  const [showAll, setShowAll] = useState(false)

  if (!manifest) {
    return (
      <div className="empty">
        <p className="empty__title">Nothing published yet</p>
        <p className="empty__body">
          Until you publish, there is no address for an agent to fetch — which is one of the four
          things the measurement checks for. Approve any generated descriptions above, then
          publish.
        </p>
      </div>
    )
  }

  const products = manifest.products || []
  const shown = showAll ? products : products.slice(0, 3)
  const url = manifestUrl(merchantId)

  return (
    <div className="stack" style={{ '--stack-gap': '1rem' }}>
      <div className="manifest-url">
        <span className="eyebrow">Agents fetch</span>
        <span className="manifest-url__path">{url}</span>
        <CopyButton text={url} />
        <a href={url} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
          Open
        </a>
      </div>

      <div className="cluster">
        <span className="pill pill--ok">version {manifest.manifest_version}</span>
        <span className="pill pill--neutral">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </span>
        <span className="dim" style={{ fontSize: '0.75rem' }}>
          published {formatDateTime(manifest.generated_at)}
        </span>
      </div>

      <div className="stack" style={{ '--stack-gap': '0.625rem' }}>
        <p className="eyebrow">What an agent reads, product by product</p>
        {shown.map((product) => (
          <div key={product.id} className="cat-item">
            <div className="manifest-fields">
              {FIELDS.map(([key, label]) => (
                <div key={key} className="manifest-field">
                  <span className="manifest-field__key">{key}</span>
                  <span className="manifest-field__val">
                    <span className="sr-only">{label}: </span>
                    {renderValue(key, product)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {products.length > 3 && (
          <button type="button" className="btn btn--quiet" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show first three only' : `Show all ${products.length} products`}
          </button>
        )}
      </div>

      <details className="disclosure">
        <summary>The raw file an agent downloads</summary>
        <div style={{ marginBlockStart: '0.625rem' }}>
          <JsonBlock value={manifest} />
        </div>
      </details>
    </div>
  )
}
