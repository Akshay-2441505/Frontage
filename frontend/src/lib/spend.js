/* Spend against a mandate, for the merchant console's budget meter.

   The ceiling caps TOTAL spend under one mandate version, not each individual
   purchase — which is the single most confusing thing about a refusal, because
   an item well under the limit still gets blocked once earlier purchases have
   used the budget up.

   No endpoint returns the running total. But every successful Transact action
   records both the amount it spent and the mandate it was checked against, so it
   is derivable from the audit trail the merchant is already being shown.

   Otto's refusal card used to read from here too. It no longer does: a block now
   carries the numbers the backend decided with (`block_data`), which is the only
   way the two can be guaranteed to agree. This function stays for the console
   meter, where there is no block to read from. */

/* Mirrors WINDOW_DURATIONS in backend/app/agents/transact.py. A rolling window
   counted back from now, not calendar-aligned: "daily" means the last 24 hours.
   `one_time` has no entry, matching the backend's all-time behaviour. */
const WINDOW_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

/* The backend stores naive UTC (`datetime.utcnow()`), so timestamps serialise
   without a zone marker and `Date.parse` would read them as LOCAL time — five and
   a half hours adrift on IST, which is enough to drop a purchase out of a daily
   window that should still hold it. */
function parseUtc(value) {
  if (typeof value !== 'string') return NaN
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  return Date.parse(utc)
}

export function spentUnderMandate(actions, mandate) {
  if (!mandate || !Array.isArray(actions)) return 0

  /* The window has to be applied here as well as in the backend. Without it a
     daily mandate's meter counted purchases from weeks ago, so the console
     showed a budget far more consumed than the one Transact actually checks
     against — and a merchant could see "no headroom" on a budget that had reset. */
  const duration = WINDOW_MS[mandate.window]
  const cutoff = duration ? Date.now() - duration : null

  return actions
    .filter(
      (a) => a.agent_name === 'Transact' && a.result === 'success' && a.mandate_id === mandate.id,
    )
    .filter((a) => {
      if (cutoff === null) return true
      const at = parseUtc(a.timestamp)
      /* An unparseable timestamp counts, rather than silently vanishing from the
         total and understating spend. */
      return Number.isNaN(at) || at >= cutoff
    })
    .reduce((sum, a) => sum + (Number(a.input?.requested_amount) || 0), 0)
}
