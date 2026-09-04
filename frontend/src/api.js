export const BASE_URL = 'http://127.0.0.1:8000'

/* The address an agent would actually fetch. Shown in the console so the
   manifest reads as a real, reachable artifact rather than a blob of JSON. */
export const manifestUrl = (merchantId) => `${BASE_URL}/merchants/${merchantId}/manifest.json`

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

  /* How many products, across how many stores, Otto can actually read right now.
     Counted server-side from the same set discover() searches, so the hero's
     claim and the funnel's first number cannot drift apart. */
  getReach: () => request('/buyer-agent/reach'),

  /* One photographed product from each of `count` different stores, for the
     hero wall. Server-side so the page costs one request rather than one per
     store -- a cost that would grow with the very breadth the wall advertises. */
  getShowcase: ({ count = 7, exclude = '', feature = '' } = {}) =>
    request(
      `/buyer-agent/showcase?count=${count}` +
        (exclude ? `&exclude=${encodeURIComponent(exclude)}` : '') +
        (feature ? `&feature=${encodeURIComponent(feature)}` : ''),
    ),
  runDiagnose: (id) => request(`/merchants/${id}/diagnose`, { method: 'POST' }),
  getLatestDiagnosis: (id) => request(`/merchants/${id}/diagnose/latest`),
  getDiagnosisHistory: (id) => request(`/merchants/${id}/diagnose/history`),
  generateDescriptions: (id) => request(`/merchants/${id}/fix/generate-descriptions`, { method: 'POST' }),
  approveItem: (itemId) => request(`/catalog-items/${itemId}/approve`, { method: 'POST' }),
  updateItemPrice: (itemId, price) =>
    request(`/catalog-items/${itemId}/price`, { method: 'PUT', body: JSON.stringify({ price }) }),
  publishManifest: (id) => request(`/merchants/${id}/fix/publish`, { method: 'POST' }),
  getManifestJson: (id) => request(`/merchants/${id}/manifest.json`),
  getMandate: (merchantId) => request(merchantId ? `/mandate?merchant_id=${merchantId}` : '/mandate'),
  setMandate: (body) => request('/mandate', { method: 'PUT', body: JSON.stringify(body) }),
  purchase: (catalogItemId, requestedAmount) =>
    request('/transact/purchase', {
      method: 'POST',
      body: JSON.stringify({ catalog_item_id: catalogItemId, requested_amount: requestedAmount }),
    }),
  getTransactionStatus: (transactionId) => request(`/transact/${transactionId}/status`),
  getAuditLog: (merchantId) =>
    request(merchantId ? `/audit-log?merchant_id=${merchantId}` : '/audit-log'),
  buyerShop: (merchantId, goal, history = [], dryRun = false) =>
    request('/buyer-agent/shop', {
      method: 'POST',
      body: JSON.stringify({ merchant_id: merchantId, goal, history, dry_run: dryRun }),
    }),
  discover: (goal, history = []) =>
    request('/buyer-agent/discover', {
      method: 'POST',
      body: JSON.stringify({ goal, history }),
    }),
  importStore: (storeUrl, merchantName, currency) =>
    request('/import', {
      method: 'POST',
      body: JSON.stringify({ store_url: storeUrl, merchant_name: merchantName, currency }),
    }),
}
