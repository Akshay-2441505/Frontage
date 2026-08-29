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
  const [notice, setNotice] = useState(null)

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
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId])

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

  const missingCount = catalog.filter((i) => itemStatus(i) === 'missing description').length
  const pendingCount = catalog.filter((i) => itemStatus(i) === 'pending review').length
  const readyCount = catalog.filter((i) => itemStatus(i) === 'ready').length

  return (
    <div className="page">
      <h1>Catalog Manifest</h1>
      <p className="muted">
        The Fix Agent fills in missing descriptions with an LLM, flagged as generated until
        you approve them, then publishes a structured manifest an AI agent can fetch.
      </p>

      <section className="card">
        <div className="card-header">
          <h2>Fix Agent</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() =>
                run('generate', () => api.generateDescriptions(merchantId), (result) =>
                  `Generated ${result.generated.length} description(s)${
                    result.failed.length ? `, ${result.failed.length} failed` : ''
                  }. Review and approve them below before publishing.`
                )
              }
              disabled={!merchantId || busy !== null}
            >
              {busy === 'generate' ? 'Generating…' : 'Generate missing descriptions'}
            </button>
            <button
              onClick={() =>
                run('publish', () => api.publishManifest(merchantId), (result) =>
                  `Manifest v${result.version} published with ${result.item_ids.length} product(s).`
                )
              }
              disabled={!merchantId || busy !== null}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish manifest'}
            </button>
          </div>
        </div>

        <p className="muted" style={{ fontSize: '0.85rem' }}>
          {catalog.length} products — <strong className="gap-pass-inline">{readyCount} ready</strong>,{' '}
          <strong className="gap-fail-inline">{missingCount} missing description</strong>,{' '}
          <strong className="gap-fail-inline">{pendingCount} pending review</strong>
        </p>

        {notice && <p className="gap-pass-inline">{notice}</p>}
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
