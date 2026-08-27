import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api } from './api'
import Dashboard from './pages/Dashboard'
import Manifest from './pages/Manifest'
import AuditLog from './pages/AuditLog'
import './index.css'

export default function App() {
  const [merchants, setMerchants] = useState([])
  const [merchantId, setMerchantId] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .listMerchants()
      .then((data) => {
        setMerchants(data)
        if (data.length > 0) setMerchantId(data[0].id)
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Frontage</div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/manifest">Manifest</NavLink>
          <NavLink to="/audit-log">Audit Log</NavLink>
        </nav>
        <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </header>

      {error && (
        <div className="banner-error">
          Could not reach backend at http://127.0.0.1:8000 — is it running? ({error})
        </div>
      )}

      <main>
        <Routes>
          <Route path="/" element={<Dashboard merchantId={merchantId} />} />
          <Route path="/manifest" element={<Manifest merchantId={merchantId} />} />
          <Route path="/audit-log" element={<AuditLog merchantId={merchantId} />} />
        </Routes>
      </main>
    </div>
  )
}
