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
}
