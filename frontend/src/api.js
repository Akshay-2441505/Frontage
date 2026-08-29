const BASE_URL = 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

export const api = {
  listMerchants: () => request('/merchants'),
  getMerchant: (id) => request(`/merchants/${id}`),
  getCatalog: (id) => request(`/merchants/${id}/catalog`),
  runDiagnose: (id) => request(`/merchants/${id}/diagnose`, { method: 'POST' }),
  getLatestDiagnosis: (id) => request(`/merchants/${id}/diagnose/latest`),
  getDiagnosisHistory: (id) => request(`/merchants/${id}/diagnose/history`),
  generateDescriptions: (id) => request(`/merchants/${id}/fix/generate-descriptions`, { method: 'POST' }),
  approveItem: (itemId) => request(`/catalog-items/${itemId}/approve`, { method: 'POST' }),
  publishManifest: (id) => request(`/merchants/${id}/fix/publish`, { method: 'POST' }),
  getManifestJson: (id) => request(`/merchants/${id}/manifest.json`),
  getMandate: () => request('/mandate'),
  setMandate: (body) => request('/mandate', { method: 'PUT', body: JSON.stringify(body) }),
  purchase: (catalogItemId, requestedAmount) =>
    request('/transact/purchase', {
      method: 'POST',
      body: JSON.stringify({ catalog_item_id: catalogItemId, requested_amount: requestedAmount }),
    }),
  getAuditLog: (merchantId) =>
    request(merchantId ? `/audit-log?merchant_id=${merchantId}` : '/audit-log'),
  buyerShop: (merchantId, goal) =>
    request('/buyer-agent/shop', {
      method: 'POST',
      body: JSON.stringify({ merchant_id: merchantId, goal }),
    }),
}
