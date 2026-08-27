import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Dashboard({ merchantId }) {
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    if (!merchantId) return
    api.getCatalog(merchantId).then(setCatalog).catch(() => setCatalog([]))
  }, [merchantId])

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">
        Diagnostic score, before/after revenue framing, and the current catalog land here.
        Diagnose Agent scoring is not wired up yet (Day 2).
      </p>

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
