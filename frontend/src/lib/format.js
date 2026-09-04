/* Formatting and vocabulary helpers.

   Money uses Intl directly — no library. `en-IN` is what produces Indian digit
   grouping (₹1,75,000 rather than ₹175,000), which the Jaipur Watch Company
   catalog needs and which a plain toLocaleString would get wrong. */

const moneyCache = new Map()

function formatter(currency) {
  const code = (currency || 'INR').toUpperCase()
  if (!moneyCache.has(code)) {
    let fmt
    try {
      fmt = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      })
    } catch {
      // Unknown currency code from an imported store — fall back to plain digits.
      fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
    }
    moneyCache.set(code, fmt)
  }
  return moneyCache.get(code)
}

export function formatMoney(amount, currency) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return formatter(currency).format(n)
}

export function formatTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* The six rubric checks, in merchant language.

   `bay` is the short label under the elevation drawing (a narrow column, so it
   has to be short). `name` and `why` are the expanded gap row. `jargon` defines
   the internal term in place the first time a merchant meets it, per the brief's
   vocabulary rule. */
export const CHECKS = {
  product_descriptions: {
    bay: 'Descriptions',
    name: 'Every product describes itself',
    why: 'An agent reads words, not pictures. A product with only a name and a price gives it nothing to match a shopper against.',
  },
  agent_readable_feed: {
    bay: 'Fetchable catalog',
    name: 'A catalog agents can fetch',
    why: 'Agents do not browse your site. They fetch one structured file listing everything you sell. Without it you are not in their results at all.',
    jargon: 'Called a manifest elsewhere in this console — it is the file at your catalog address.',
  },
  price_availability_clarity: {
    bay: 'Prices & stock',
    name: 'Prices and stock are unambiguous',
    why: 'An agent will not guess. If price, currency, or availability is missing or contradictory, it skips the product rather than risk getting it wrong.',
  },
  programmatic_checkout: {
    bay: 'Agent checkout',
    name: 'Checkout an agent can call',
    why: 'Finding your product is only half of it. If buying needs a human clicking through a page, the sale stops here.',
  },
  name_disambiguation: {
    bay: 'Distinct names',
    name: 'No two products share a name',
    why: 'An agent tells products apart by name. Two identical names look like one listing to it, so it cannot say which one it means.',
  },
  product_imagery: {
    bay: 'Product photos',
    name: 'Every product has a photo',
    why: 'A shopper wants to see what they are buying before they commit. No photo means an agent has nothing to show them.',
  },
}

export function checkMeta(checkName) {
  return (
    CHECKS[checkName] || {
      bay: checkName,
      name: checkName,
      why: '',
    }
  )
}

/* Gap status strings vary ('pass' / 'fail' / 'ok'); treat anything that is not
   an explicit pass as a gap so a new backend status never renders as a pass. */
export function isPass(status) {
  return status === 'pass' || status === 'ok' || status === true
}

/* Four of the six checks are scored as a FRACTION of products passing, but their
   status only says "pass" when every product does. So a failing check can still
   be earning most of its points, and a purely pass/fail drawing would
   contradict the score printed beside it.

   The fractional checks state their shortfall the same way — "3 of 25
   products have…" — so the fraction is recoverable from the detail line. Binary
   checks (a manifest exists, checkout is configured) never match that shape and
   fall through to 1 or 0, which is correct for them. */
export function gapFraction(gap) {
  if (!gap) return 0
  if (isPass(gap.status)) return 1

  const match = /^(\d+)\s+of\s+(\d+)\b/.exec(String(gap.detail || '').trim())
  if (!match) return 0

  const failed = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(failed) || !Number.isFinite(total) || total <= 0) return 0

  return Math.max(0, Math.min(1, (total - failed) / total))
}

/* Scores come back rounded to one decimal. Keep the decimal when it carries
   information (87.5) and drop it when it doesn't (100.0). */
export function formatScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/* Small counts read better as words in a sentence. Anything past ten falls back
   to digits rather than inventing awkward spellings. */
export function countWord(n) {
  const i = Number(n)
  if (!Number.isInteger(i) || i < 0 || i >= NUMBER_WORDS.length) return String(n)
  const word = NUMBER_WORDS[i]
  return word[0].toUpperCase() + word.slice(1)
}

export function initialOf(text) {
  const cleaned = String(text || '').replace(/[^\p{L}\p{N}]/gu, '')
  return cleaned ? cleaned[0].toUpperCase() : '·'
}
