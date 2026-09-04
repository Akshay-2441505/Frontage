import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const MerchantContext = createContext(null)

export function MerchantProvider({ children }) {
  const [merchants, setMerchants] = useState([])
  const [merchantId, setMerchantId] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  /* Selects `selectId` when given (the import flow depends on this to jump
     straight to the store it just created), otherwise falls back to the first
     merchant only when nothing is selected yet. */
  const reloadMerchants = useCallback((selectId) => {
    return api
      .listMerchants()
      .then((data) => {
        setMerchants(data)
        setError(null)
        setMerchantId((current) => {
          if (selectId) return selectId
          if (current) return current
          return data.length > 0 ? data[0].id : ''
        })
        return data
      })
      .catch((err) => {
        setError(err.message)
        return []
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reloadMerchants()
  }, [reloadMerchants])

  const merchant = useMemo(
    () => merchants.find((m) => String(m.id) === String(merchantId)) || null,
    [merchants, merchantId],
  )

  const value = useMemo(
    () => ({ merchants, merchantId, merchant, setMerchantId, reloadMerchants, error, loading }),
    [merchants, merchantId, merchant, reloadMerchants, error, loading],
  )

  return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>
}

export function useMerchants() {
  const ctx = useContext(MerchantContext)
  if (!ctx) throw new Error('useMerchants must be used inside <MerchantProvider>')
  return ctx
}
