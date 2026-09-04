import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import CatalogThumb from '../../components/CatalogThumb'
import FrontageElevation, { baysFromReport } from '../../components/FrontageElevation'
import { IconArrowRight, IconArrowUp, IconCheck, IconGauge, IconX } from '../../components/Icons'
import { useMerchants } from '../../context/MerchantContext'
import { useConsole } from '../../layouts/ConsoleLayout'
import { countWord, formatMoney } from '../../lib/format'

function variantSummary(variantInfo) {
  if (!variantInfo || typeof variantInfo !== 'object') return null
  const parts = Object.entries(variantInfo)
    .filter(([, v]) => v !== null && v !== undefined && String(v).length > 0)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
  return parts.length ? parts.join(' · ') : null
}

function CatalogItem({ item }) {
  const [open, setOpen] = useState(false)
  const variants = variantSummary(item.variant_info)
  const hasDescription = Boolean(item.description && item.description.trim())
  const long = hasDescription && item.description.length > 220

  return (
    <article className="cat-item">
      <div className="cat-item__head">
        <CatalogThumb item={item} />
        <div className="spread grow" style={{ gap: '0.5rem' }}>
          <h3 className="cat-item__name grow">{item.name}</h3>
          <span className="cat-item__price">{formatMoney(item.price, item.currency)}</span>
        </div>
      </div>

      {hasDescription ? (
        <>
          <p className={`cat-item__desc${open || !long ? '' : ' clamp-3'}`}>{item.description}</p>
          {long && (
            <button type="button" className="btn btn--quiet" onClick={() => setOpen((v) => !v)}>
              {open ? 'Show less' : `Show all ${item.description.length} characters`}
            </button>
          )}
        </>
      ) : (
        <p className="cat-item__desc" style={{ color: 'var(--bad)' }}>
          No description — an agent has nothing to match this against.
        </p>
      )}

      <div className="cat-item__meta">
        <span className={`pill ${item.agent_readable ? 'pill--ok' : 'pill--bad'}`}>
          {item.agent_readable ? 'agent ready' : 'not ready'}
        </span>
        {item.availability && (
          <span className={`pill ${item.availability === 'in_stock' ? 'pill--neutral' : 'pill--warn'}`}>
            {String(item.availability).replace(/_/g, ' ')}
          </span>
        )}
        {item.source === 'generated' && <span className="pill pill--info">written by Fix</span>}
        {variants && (
          <span className="pill pill--plain pill--neutral" title={variants}>
            {variants.length > 40 ? `${variants.slice(0, 40)}…` : variants}
          </span>
        )}
      </div>
    </article>
  )
}

export default function Diagnose() {
  const { merchantId, merchant } = useMerchants()
  const { report, history, running, error, runDiagnose } = useConsole()
  const [catalog, setCatalog] = useState([])
  const [catalogError, setCatalogError] = useState(null)
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  useEffect(() => {
    if (!merchantId) {
      setCatalog([])
      setLoadingCatalog(false)
      return
    }
    setLoadingCatalog(true)
    api
      .getCatalog(merchantId)
      .then((data) => {
        setCatalog(data)
        setCatalogError(null)
      })
      .catch((err) => {
        setCatalog([])
        setCatalogError(err.message)
      })
      .finally(() => setLoadingCatalog(false))
  }, [merchantId])

  const bays = baysFromReport(report)

  /* One photo per bay, in catalog order, so a merchant recognises their own
     stock in their own windows. Empty for the seeded stores, which the drawing
     handles by falling back to plain warm light. */
  const shopfrontImages = useMemo(
    () => catalog.map((i) => i.image_url).filter(Boolean).slice(0, 6),
    [catalog],
  )
  const openGaps = bays.filter((b) => !b.pass)

  /* The history endpoint returns oldest-first, so the first measurement is at
     index 0. This read the LAST element for three phases — which is the newest
     run, and therefore equal to `report.score` by construction, so `gained` was
     always exactly 0 and this badge never rendered once. The brief calls the
     fix-then-remeasure loop the product's core feedback loop; it has been
     invisible the whole time. */
  const first = history.length > 0 ? history[0] : null
  const gained = report && first ? Math.round(report.score - first.score) : 0

  return (
    <div className="stack" style={{ '--stack-gap': '1.5rem' }}>
      <header className="page-head">
        <p className="eyebrow">Step 1 · Diagnose</p>
        <h1 className="page-head__title">
          {merchant ? `How much of ${merchant.name} an agent can see` : 'Your frontage'}
        </h1>
        {/* Counted from the report, not written down. Older reports were scored
            against a four-check rubric and are still stored, so a hardcoded
            "Six things" was wrong on five of eleven merchants. */}
        <p className="page-head__lede">
          {bays.length === 1 ? 'One thing decides' : `${countWord(bays.length)} things decide`}{' '}
          whether an AI shopping agent can find and buy from you, and they don't count equally —
          each bay is as wide as that check is worth. A bay lights up as far as your catalog
          carries it, so the lit width across the whole shopfront is your score.
        </p>
      </header>

      <FrontageElevation report={report} images={shopfrontImages} />

      <div className="spread">
        <div className="cluster">
          <button
            type="button"
            className="btn btn--primary"
            onClick={runDiagnose}
            disabled={running || !merchantId}
          >
            <IconGauge />
            {running ? 'Measuring…' : report ? 'Measure again' : 'Measure my frontage'}
          </button>
          {openGaps.length > 0 && report && (
            <Link to="/merchant/fix" className="btn btn--ghost">
              Fix {openGaps.length} {openGaps.length === 1 ? 'gap' : 'gaps'}
              <IconArrowRight />
            </Link>
          )}
        </div>

        {gained > 0 && (
          <span className="delta__gain">
            <IconArrowUp />+{gained} since your first measurement
          </span>
        )}
      </div>

      {error && (
        <div className="notice notice--bad">
          <div className="notice__body">
            <div className="notice__title">Couldn't run the measurement</div>
            {error}
          </div>
        </div>
      )}

      {!report && !running && (
        <div className="empty">
          <p className="empty__title">Nothing measured yet</p>
          <p className="empty__body">
            Measure your frontage to see which checks this catalog passes today, and
            what each failing one is costing.
          </p>
        </div>
      )}

      {report && (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">
              {openGaps.length === 0
                ? 'Nothing left to fix'
                : `${openGaps.length} ${openGaps.length === 1 ? 'gap' : 'gaps'} between you and an agent`}
            </h2>
            <span className="eyebrow">{bays.length - openGaps.length} of {bays.length} passing</span>
          </div>

          <div>
            {bays.map((bay) => (
              <details key={bay.key} className="gap-row" open={!bay.pass}>
                <summary>
                  <span className={`pill ${bay.pass ? 'pill--ok' : 'pill--bad'} pill--plain`}>
                    {bay.pass ? <IconCheck /> : <IconX />}
                  </span>
                  <span className="gap-row__name">{bay.meta.name}</span>
                  <span className="gap-row__pts">{bay.pass ? 'passing' : 'open'}</span>
                </summary>
                <div className="gap-row__detail">
                  <p>{bay.gap?.detail || bay.meta.why}</p>
                  {!bay.pass && bay.gap?.detail && bay.meta.why && <p style={{ marginBlockStart: '0.5rem' }}>{bay.meta.why}</p>}
                  {bay.meta.jargon && <p className="gap-row__jargon">{bay.meta.jargon}</p>}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="stack" style={{ '--stack-gap': '0.875rem' }}>
        <div className="spread">
          <h2 className="card__title">
            What you sell{' '}
            <span className="dim num" style={{ fontWeight: 400 }}>
              {catalog.length}
            </span>
          </h2>
        </div>

        {catalogError && (
          <div className="notice notice--bad">
            <div className="notice__body">{catalogError}</div>
          </div>
        )}

        {loadingCatalog && (
          <div className="cat-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cat-item">
                <span className="skeleton" style={{ height: '1rem', width: '70%' }} />
                <span className="skeleton" style={{ height: '3rem' }} />
              </div>
            ))}
          </div>
        )}

        {!loadingCatalog && catalog.length === 0 && !catalogError && (
          <div className="empty">
            <p className="empty__title">No products here yet</p>
            <p className="empty__body">
              Connect a real Shopify store and Frontage will pull its catalog in and measure it.
            </p>
            <Link to="/merchant/connect" className="btn btn--ghost btn--sm">
              Connect a store
              <IconArrowRight />
            </Link>
          </div>
        )}

        {!loadingCatalog && catalog.length > 0 && (
          <div className="cat-grid">
            {catalog.map((item) => (
              <CatalogItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
