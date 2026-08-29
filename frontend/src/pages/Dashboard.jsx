import { useEffect, useState } from 'react'
import { api } from '../api'

function RevenueOpportunity({ history, catalog }) {
  if (history.length === 0) {
    return <p className="muted">Run the Diagnose Agent to see the before/after story here.</p>
  }

  const first = history[0]
  const latest = history[history.length - 1]
  const delta = Math.round((latest.score - first.score) * 10) / 10
  const readableCount = catalog.filter((i) => i.agent_readable).length

  return (
    <>
      <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>First audit</div>
          <div className="score" style={{ margin: 0 }}>{first.score}</div>
        </div>
        <div style={{ fontSize: '1.4rem' }}>&rarr;</div>
        <div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Latest audit</div>
          <div className="score" style={{ margin: 0 }}>{latest.score}</div>
        </div>
        {history.length > 1 && (
          <div className={delta > 0 ? 'gap-pass-inline' : delta < 0 ? 'gap-fail-inline' : 'muted'} style={{ fontSize: '1.1rem' }}>
            {delta > 0 ? '+' : ''}
            {delta} pts
          </div>
        )}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {readableCount} of {catalog.length} products in this catalog are currently agent-readable
        — visible, understandable, and purchasable by an AI shopping agent without a human
        clicking through a UI. Every point of score above reflects a gap (missing description,
        no manifest, no programmatic checkout) that no longer stands between this merchant and
        an AI buyer.
      </p>
    </>
  )
}

export default function Dashboard({ merchantId }) {
  const [catalog, setCatalog] = useState([])
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  function reload() {
    if (!merchantId) return
    api.getCatalog(merchantId).then(setCatalog).catch(() => setCatalog([]))
    api.getLatestDiagnosis(merchantId).then(setReport).catch(() => setReport(null))
    api.getDiagnosisHistory(merchantId).then(setHistory).catch(() => setHistory([]))
  }

  useEffect(reload, [merchantId])

  async function handleDiagnose() {
    setRunning(true)
    setError(null)
    try {
      await api.runDiagnose(merchantId)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">
        Diagnostic score, generated manifest, and live audit trail for the selected merchant.
      </p>

      <section className="card">
        <h2>Revenue opportunity: before / after</h2>
        <RevenueOpportunity history={history} catalog={catalog} />
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Diagnostic score</h2>
          <button onClick={handleDiagnose} disabled={!merchantId || running}>
            {running ? 'Running…' : 'Run Diagnose Agent'}
          </button>
        </div>
        {error && <p className="banner-error-inline">{error}</p>}
        {report ? (
          <>
            <div className="score">{report.score} / 100</div>
            <ul className="gap-list">
              {report.gaps.map((gap) => (
                <li key={gap.check_name} className={gap.status === 'pass' ? 'gap-pass' : 'gap-fail'}>
                  <strong>{gap.status === 'pass' ? 'OK' : 'GAP'}:</strong> {gap.detail}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">No diagnostic report yet — run the Diagnose Agent.</p>
        )}
      </section>

      <h2>Current catalog ({catalog.length} items)</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Price</th>
            <th>Availability</th>
            <th>Agent readable</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className={item.description ? '' : 'muted'}>
                {item.description || 'missing'}
              </td>
              <td>
                {item.currency} {item.price}
              </td>
              <td className={item.availability ? '' : 'muted'}>
                {item.availability || 'ambiguous'}
              </td>
              <td>{item.agent_readable ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
