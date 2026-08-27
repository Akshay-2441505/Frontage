import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Dashboard({ merchantId }) {
  const [catalog, setCatalog] = useState([])
  const [report, setReport] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!merchantId) return
    api.getCatalog(merchantId).then(setCatalog).catch(() => setCatalog([]))
    api
      .getLatestDiagnosis(merchantId)
      .then(setReport)
      .catch(() => setReport(null))
  }, [merchantId])

  async function handleDiagnose() {
    setRunning(true)
    setError(null)
    try {
      const result = await api.runDiagnose(merchantId)
      setReport(result)
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
