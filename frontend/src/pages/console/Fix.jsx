import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import CatalogThumb from '../../components/CatalogThumb'
import { IconArrowRight, IconCheck, IconSparkle } from '../../components/Icons'
import ManifestViewer from '../../components/ManifestViewer'
import { useMerchants } from '../../context/MerchantContext'
import { useConsole } from '../../layouts/ConsoleLayout'
import { formatMoney } from '../../lib/format'

function itemStatus(item) {
  if (item.agent_readable) return 'ready'
  if (item.source === 'generated') return 'pending'
  if (!item.description) return 'missing'
  return 'unpublished'
}

const STATUS_LABEL = {
  ready: 'ready',
  pending: 'needs your ok',
  missing: 'no description',
  unpublished: 'not published',
}

export default function Fix() {
  const { merchantId, merchant } = useMerchants()
  const { report, runDiagnose, running } = useConsole()

  const [catalog, setCatalog] = useState([])
  const [manifest, setManifest] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [priceEdits, setPriceEdits] = useState({})
  const [rescored, setRescored] = useState(null)

  const reload = useCallback(async () => {
    if (!merchantId) {
      setCatalog([])
      setManifest(null)
      return
    }
    const [items, published] = await Promise.all([
      api.getCatalog(merchantId).catch(() => []),
      api.getManifestJson(merchantId).catch(() => null),
    ])
    setCatalog(Array.isArray(items) ? items : [])
    setManifest(published)
  }, [merchantId])

  useEffect(() => {
    reload()
    setNotice(null)
    setError(null)
    setRescored(null)
    setPriceEdits({})
  }, [reload])

  async function run(action, fn, onSuccess) {
    setBusy(action)
    setError(null)
    setNotice(null)
    try {
      const result = await fn()
      await reload()
      if (onSuccess) setNotice(onSuccess(result))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  function priceValue(item) {
    return priceEdits[item.id] ?? String(item.price)
  }

  async function savePrice(item) {
    const next = Number(priceValue(item))
    await run(`price-${item.id}`, () => api.updateItemPrice(item.id, next), () =>
      `${item.name} is now ${formatMoney(next, item.currency)}. Any manifest published before this now quotes a stale price.`,
    )
    setPriceEdits((prev) => {
      const copy = { ...prev }
      delete copy[item.id]
      return copy
    })
  }

  async function rescore() {
    const before = report ? Math.round(report.score) : null
    const fresh = await runDiagnose()
    if (fresh) setRescored({ before, after: Math.round(fresh.score) })
  }

  const missing = catalog.filter((i) => itemStatus(i) === 'missing')
  const pending = catalog.filter((i) => itemStatus(i) === 'pending')
  const ready = catalog.filter((i) => itemStatus(i) === 'ready')

  const stepState = {
    generate: missing.length > 0 ? 'active' : 'done',
    approve: pending.length > 0 ? 'active' : missing.length > 0 ? 'idle' : 'done',
    publish: manifest && pending.length === 0 && missing.length === 0 ? 'done' : 'idle',
  }

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Step 2 · Fix</p>
        <h1 className="page-head__title">Make {merchant?.name || 'this catalog'} readable</h1>
        <p className="page-head__lede">
          Fix writes the descriptions that are missing, you approve what it wrote, and publishing
          puts the whole catalog at one address an agent can fetch. Fix never invents stock levels
          or options — only words.
        </p>
      </header>

      <div className="steps">
        <div className="step" data-state={stepState.generate}>
          <span className="step__n">01</span>
          <span className="step__title">Write what's missing</span>
          <span className="step__body">
            {missing.length === 0
              ? 'Every product has a description.'
              : `${missing.length} ${missing.length === 1 ? 'product has' : 'products have'} no description.`}
          </span>
        </div>
        <div className="step" data-state={stepState.approve}>
          <span className="step__n">02</span>
          <span className="step__title">Approve what Fix wrote</span>
          <span className="step__body">
            {pending.length === 0
              ? 'Nothing waiting on you.'
              : `${pending.length} generated ${pending.length === 1 ? 'description is' : 'descriptions are'} waiting for your ok.`}
          </span>
        </div>
        <div className="step" data-state={stepState.publish}>
          <span className="step__n">03</span>
          <span className="step__title">Publish</span>
          <span className="step__body">
            {manifest
              ? `Version ${manifest.manifest_version} is live with ${(manifest.products || []).length} products.`
              : 'Nothing published yet — agents can’t see anything.'}
          </span>
        </div>
      </div>

      <div className="cluster">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!merchantId || busy !== null || missing.length === 0}
          onClick={() =>
            run(
              'generate',
              () => api.generateDescriptions(merchantId),
              (result) =>
                `Fix wrote ${result.generated.length} ${result.generated.length === 1 ? 'description' : 'descriptions'}` +
                (result.failed.length ? `, and couldn’t write ${result.failed.length}.` : '.') +
                ' Read them below and approve the ones you’re happy with.',
            )
          }
        >
          <IconSparkle />
          {busy === 'generate' ? 'Writing…' : `Write ${missing.length || ''} missing`.trim()}
        </button>

        <button
          type="button"
          className="btn btn--primary"
          disabled={!merchantId || busy !== null}
          onClick={() =>
            run(
              'publish',
              () => api.publishManifest(merchantId),
              (result) =>
                `Published version ${result.version} with ${result.item_ids.length} ${result.item_ids.length === 1 ? 'product' : 'products'}. Measure again to see it counted.`,
            )
          }
        >
          {busy === 'publish' ? 'Publishing…' : 'Publish catalog'}
        </button>

        <button type="button" className="btn btn--ghost" onClick={rescore} disabled={running || !merchantId}>
          {running ? 'Measuring…' : 'Measure again'}
          <IconArrowRight />
        </button>
      </div>

      {rescored && (
        <div className="notice notice--ok">
          <div className="notice__body">
            <div className="notice__title">
              {rescored.before === null
                ? `Your frontage measures ${rescored.after} / 100.`
                : rescored.after > rescored.before
                  ? `Your frontage went from ${rescored.before} to ${rescored.after} out of 100.`
                  : `Still ${rescored.after} / 100 — publishing didn't close a gap this time.`}
            </div>
            <Link to="/merchant" style={{ color: 'inherit' }}>
              See the drawing →
            </Link>
          </div>
        </div>
      )}

      {notice && (
        <div className="notice notice--ok">
          <div className="notice__body">{notice}</div>
        </div>
      )}

      {error && (
        <div className="notice notice--bad">
          <div className="notice__body">
            <div className="notice__title">That didn't go through</div>
            {error}
          </div>
        </div>
      )}

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Your products</h2>
          <span className="cluster">
            <span className="pill pill--ok">{ready.length} ready</span>
            {pending.length > 0 && <span className="pill pill--warn">{pending.length} to approve</span>}
            {missing.length > 0 && <span className="pill pill--bad">{missing.length} missing</span>}
          </span>
        </div>

        {catalog.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No products to fix</p>
            <p className="empty__body">Connect a store first and its catalog will land here.</p>
          </div>
        ) : (
          <div className="stack" style={{ '--stack-gap': '0.625rem' }}>
            {catalog.map((item) => {
              const status = itemStatus(item)
              const edited = Number(priceValue(item)) !== item.price
              return (
                <article key={item.id} className="cat-item">
                  <div className="cat-item__head">
                    <CatalogThumb item={item} />
                    <div className="spread grow" style={{ gap: '0.5rem' }}>
                      <h3 className="cat-item__name grow">{item.name}</h3>
                      <span className={`pill pill--${status === 'ready' ? 'ok' : status === 'pending' ? 'warn' : 'bad'}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                  </div>

                  {item.description ? (
                    <p className="cat-item__desc">{item.description}</p>
                  ) : (
                    <p className="cat-item__desc" style={{ color: 'var(--bad)' }}>
                      No description yet.
                    </p>
                  )}

                  <div className="cluster" style={{ marginBlockStart: 'auto', paddingBlockStart: '0.5rem' }}>
                    <label className="cluster" style={{ '--cluster-gap': '0.375rem' }}>
                      <span className="eyebrow">Price</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: '7.5rem' }}
                        value={priceValue(item)}
                        min="0"
                        onChange={(e) => setPriceEdits((p) => ({ ...p, [item.id]: e.target.value }))}
                      />
                    </label>
                    {edited && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => savePrice(item)}
                        disabled={busy !== null || !(Number(priceValue(item)) > 0)}
                      >
                        Save price
                      </button>
                    )}
                    {status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`approve-${item.id}`, () => api.approveItem(item.id), () => `Approved “${item.name}”.`)
                        }
                      >
                        <IconCheck />
                        Approve this
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p className="field__hint" style={{ marginBlockStart: '0.875rem' }}>
          Changing a price after publishing is how you can watch the price-drift block: the
          published catalog still quotes the old price, and the Transact agent refuses to charge
          the difference.
        </p>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">What agents can see</h2>
        </div>
        <ManifestViewer manifest={manifest} merchantId={merchantId} />
      </section>
    </div>
  )
}
