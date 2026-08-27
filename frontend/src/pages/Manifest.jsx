import { useEffect, useState } from 'react'
import { api } from '../api'

function itemStatus(item) {
  if (item.agent_readable) return 'ready'
  if (item.source === 'generated') return 'pending review'
  if (!item.description) return 'missing description'
  return 'not yet published'
}

export default function Manifest({ merchantId }) {
  const [catalog, setCatalog] = useState([])
  const [manifest, setManifest] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function reload() {
    if (!merchantId) return
    api.getCatalog(merchantId).then(setCatalog).catch(() => setCatalog([]))
    api
      .getManifestJson(merchantId)
      .then(setManifest)
      .catch(() => setManifest(null))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId])

  async function run(action, fn) {
    setBusy(action)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <h1>Catalog Manifest</h1>
      <p className="muted">
        The Fix Agent fills in missing descriptions with Claude, flagged as generated until
        you approve them, then publishes a structured manifest an AI agent can fetch.
      </p>

      <section className="card">
        <div className="card-header">
          <h2>Fix Agent</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => run('generate', () => api.generateDescriptions(merchantId))}
              disabled={!merchantId || busy !== null}
            >
              {busy === 'generate' ? 'Generating…' : 'Generate missing descriptions'}
            </button>
            <button
              onClick={() => run('publish', () => api.publishManifest(merchantId))}
              disabled={!merchantId || busy !== null}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish manifest'}
            </button>
          </div>
        </div>
        {error && <p className="banner-error-inline">{error}</p>}

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((item) => {
              const status = itemStatus(item)
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className={item.description ? '' : 'muted'}>
                    {item.description || 'missing'}
                    {item.source === 'generated' && <span className="badge-generated"> generated</span>}
                  </td>
                  <td>
                    <span className={status === 'ready' ? 'gap-pass-inline' : 'gap-fail-inline'}>{status}</span>
                  </td>
                  <td>
                    {status === 'pending review' && (
                      <button
                        className="link-button"
                        onClick={() => run(`approve-${item.id}`, () => api.approveItem(item.id))}
                        disabled={busy !== null}
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Published manifest (GET /merchants/{'{id}'}/manifest.json)</h2>
        {manifest ? (
          <pre className="manifest-preview">{JSON.stringify(manifest, null, 2)}</pre>
        ) : (
          <p className="muted">No manifest published yet.</p>
        )}
      </section>
    </div>
  )
}
