import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { IconArrowRight, IconBag, IconCheck, IconChevron, IconClock, IconMapPin, IconMic, IconSend, IconSparkle } from '../../components/Icons'
import HeroWall from '../../components/shop/HeroWall'
import OttoField from '../../components/shop/OttoField'
import { AGENT_NAME } from '../../layouts/OttoLayout'
import { formatMoney, initialOf } from '../../lib/format'
import { useImageAspect } from '../../lib/useImageAspects'
import { EASE, SPRING, STAGGER, fadeRise, useMotionOK } from '../../lib/motion'

/* Otto's job in the demo is to make one thing legible: an outside agent can now
   find this merchant, choose from their catalog, and either buy or be stopped —
   and either way you can see exactly why. Every branch the backend can return
   gets a designed answer, including the two the old form never handled. */

const EXAMPLE_GOALS = [
  'find something under 1000 rupees',
  'I want a striped t-shirt',
  'recommend a good everyday watch',
]

/* Works out what actually separates one candidate from the others.

   With nine colourways called "X Lows <something>", the shared words are noise
   and the one differing word is the whole decision — so the common tokens are
   stripped and only the differing ones are shown.

   That is not always enough. This catalog contains two distinct products with a
   byte-identical name at an identical price, and for those the differing-token
   trick produces identical tags too. So the result is checked pairwise: any row
   whose name, tags and price all match another row is marked and falls back to
   the catalog id, which is the only thing left that differs. */
function differentiators(candidates) {
  const tokenSets = candidates.map(
    (c) => new Set(String(c.name || '').split(/\s+/).filter(Boolean)),
  )
  const first = tokenSets[0] ? [...tokenSets[0]] : []
  const common = new Set(first.filter((t) => tokenSets.every((s) => s.has(t))))

  const unique = candidates.map((c, i) => [...(tokenSets[i] || [])].filter((t) => !common.has(t)))

  const signatures = candidates.map((c, i) => `${c.name}|${unique[i].join(',')}|${c.price}`)
  const counts = new Map()
  for (const sig of signatures) counts.set(sig, (counts.get(sig) || 0) + 1)

  return candidates.map((c, i) => {
    const identical = counts.get(signatures[i]) > 1
    // A same-name-same-price tie across DIFFERENT merchants is common and not
    // confusing -- the merchant name alone tells them apart. A true same-merchant
    // duplicate (e.g. Plum Goodness's exact-duplicate listings) still needs the
    // catalog-id fallback, since two rows from the same store need something finer.
    const identicalWithinSameMerchant =
      identical &&
      candidates.filter((other, j) => signatures[j] === signatures[i] && other.merchant_id === c.merchant_id).length > 1

    return {
      unique: unique[i],
      identical,
      identicalWithinSameMerchant,
    }
  })
}

const HISTORY_TURN_LIMIT = 3

/* Mirrors the backend's own cap (buyer.py's HISTORY_TURN_LIMIT) -- trimming here just
   keeps the request small; the backend enforces its own limit regardless of what's sent.
   Turns still "thinking" (no result yet) are skipped, since there's nothing to tell the
   agent about them. */
function buildHistory(turns) {
  return turns
    .filter((t) => t.result)
    .slice(-HISTORY_TURN_LIMIT)
    .map((t) => ({
      goal: t.goal,
      status: t.result.status,
      reasoning: t.result.reasoning || t.result.buyer_reasoning || '',
    }))
}

const PLACEHOLDER_STREETS = ['12 Residency Road', '48 MG Road', '7 Brigade Avenue', '221 Church Street']
const PLACEHOLDER_CITIES = ['Bengaluru, KA 560001', 'Mumbai, MH 400001', 'Delhi, DL 110001', 'Pune, MH 411001']

/* Nothing here is collected or stored -- it's a deterministic-per-id placeholder purely
   so the checkout beat has an address to confirm, matching the reference flow's shape
   without pretending Frontage has a real delivery address on file. */
function placeholderAddress(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const street = PLACEHOLDER_STREETS[hash % PLACEHOLDER_STREETS.length]
  const city = PLACEHOLDER_CITIES[Math.floor(hash / PLACEHOLDER_STREETS.length) % PLACEHOLDER_CITIES.length]
  return `${street}, ${city}`
}

function AddressConfirm({ candidate, busy, onConfirm }) {
  const address = useMemo(() => placeholderAddress(candidate.id), [candidate.id])

  return (
    <div className="addr-confirm">
      <p className="addr-confirm__label">
        <IconMapPin />
        Confirm delivery address
        <span className="pill pill--warn">simulated</span>
      </p>
      <p className="addr-confirm__address">{address}</p>
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onConfirm}>
        Confirm &amp; pay
        <IconArrowRight />
      </button>
    </div>
  )
}

function ProductCard({ product, chosen }) {
  const images =
    Array.isArray(product.image_urls) && product.image_urls.length > 0
      ? product.image_urls
      : product.image_url
        ? [product.image_url]
        : []
  const hasMultiple = images.length > 1

  const [index, setIndex] = useState(0)
  const [imgFailed, setImgFailed] = useState(false)
  const current = images[index]
  const showImage = Boolean(current) && !imgFailed

  /* The card takes the shape of the product's first photo. Measured from the
     first rather than the current one so paging through a carousel never makes
     the card jump height; any later photo shot at a different ratio letterboxes
     into the same frame instead. */
  const aspect = useImageAspect(images[0])

  function goTo(next) {
    setImgFailed(false)
    setIndex(next)
  }

  return (
    <div className={`prod${chosen ? ' prod--chosen' : ''}`}>
      <div
        className={`prod__thumb${showImage ? '' : ' prod__thumb--empty'}`}
        style={showImage && aspect ? { aspectRatio: aspect } : undefined}
      >
        {showImage ? (
          <img
            className="prod__img"
            src={current}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="prod__initial">{initialOf(product.name)}</span>
        )}
        {hasMultiple && (
          <>
            <button
              type="button"
              className="prod__nav prod__nav--prev"
              aria-label="Previous photo"
              onClick={() => goTo((index - 1 + images.length) % images.length)}
            >
              <IconChevron style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button
              type="button"
              className="prod__nav prod__nav--next"
              aria-label="Next photo"
              onClick={() => goTo((index + 1) % images.length)}
            >
              <IconChevron />
            </button>
            <div className="prod__dots" aria-hidden="true">
              {images.map((_, i) => (
                <span key={i} className={`prod__dot${i === index ? ' prod__dot--active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>
      <p className="prod__name">{product.name}</p>
      {product.description && <p className="prod__note clamp-2">{product.description}</p>}
      <div className="prod__foot">
        <span className="prod__price">{formatMoney(product.price, product.currency)}</span>
        {product.merchant_name && <span className="prod__merchant">{product.merchant_name}</span>}
        {product.availability && product.availability !== 'in_stock' && (
          <span className="pill pill--warn">{String(product.availability).replace(/_/g, ' ')}</span>
        )}
      </div>
    </div>
  )
}

function Attribution({ merchantName }) {
  return (
    <div className="attrib">
      <span className="attrib__store">
        <span className="attrib__dot" />
        {merchantName}
      </span>
      <span className="attrib__sep">·</span>
      <span>Catalog published for agents</span>
      <span className="attrib__sep">·</span>
      <span>Checkout available here</span>
    </div>
  )
}

const PAYMENT_POLL_INTERVAL_MS = 3000

/* The order is created synchronously, but paying happens on Razorpay's hosted page in
   another tab -- there is no webhook wired into this demo, so the only way Otto learns
   the payment actually went through is to ask. Polls until the payment link reaches a
   terminal state (paid, or cancelled/expired), then stops; a failed poll is retried
   rather than treated as the final answer, since it's usually just a network blip. */
function usePaymentStatus(purchase) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!purchase || purchase.status !== 'success' || !purchase.transaction_id) return undefined

    let cancelled = false
    let timer

    async function poll() {
      try {
        const result = await api.getTransactionStatus(purchase.transaction_id)
        if (cancelled) return
        setStatus(result.status)
        if (result.status === 'created') {
          timer = setTimeout(poll, PAYMENT_POLL_INTERVAL_MS)
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, PAYMENT_POLL_INTERVAL_MS)
      }
    }

    poll()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [purchase?.transaction_id, purchase?.status])

  return status
}

/* The typed-goal (send()) path can't honestly gate on address confirmation the way
   pick() does -- attempt_purchase() already ran server-side by the time this result
   reaches the frontend, so there's nothing left to wait on. Showing the same
   placeholder as a plain, already-past-tense line here keeps the beat present in that
   flow without pretending it gated anything. Skipped when addressAlreadyConfirmed is
   true, since that means the pick() flow's real confirm card already showed it. */
function DeliveryAddress({ product, addressAlreadyConfirmed }) {
  const address = useMemo(
    () => (product?.id ? placeholderAddress(product.id) : null),
    [product?.id],
  )
  if (addressAlreadyConfirmed || !address) return null
  return (
    <p className="outcome__delivery">
      Delivering to: {address} <span className="pill pill--warn">simulated</span>
    </p>
  )
}

function Outcome({ purchase, product, merchantName, addressAlreadyConfirmed, onAsk, busy }) {
  const liveStatus = usePaymentStatus(purchase)

  if (!purchase) {
    return (
      <div className="outcome outcome--blocked">
        <p className="outcome__title">No answer came back</p>
        <p className="outcome__body">
          {merchantName} picked the product but the checkout step returned nothing. Nothing was
          charged.
        </p>
      </div>
    )
  }

  if (purchase.status === 'success') {
    if (liveStatus === 'paid') {
      return (
        <div className="outcome outcome--ok">
          <p className="outcome__title">
            <IconCheck />
            Payment received by {merchantName}
          </p>
          <p className="outcome__body">
            {product?.name} for {formatMoney(product?.price, product?.currency)}. Razorpay
            confirmed payment on order <span className="mono">{purchase.razorpay_order_id}</span>.
          </p>
          {purchase.estimated_delivery && (
            <p className="outcome__delivery">Estimated delivery: {purchase.estimated_delivery}</p>
          )}
          <DeliveryAddress product={product} addressAlreadyConfirmed={addressAlreadyConfirmed} />
        </div>
      )
    }

    if (liveStatus === 'failed') {
      return (
        <div className="outcome outcome--blocked">
          <p className="outcome__title">Payment not completed</p>
          <p className="outcome__body">
            The order for {product?.name} was created, but its payment link was cancelled or
            expired before paying. Nothing was charged.
          </p>
        </div>
      )
    }

    return (
      <div className="outcome outcome--ok">
        <p className="outcome__title">
          <IconBag />
          Order placed with {merchantName}
        </p>
        <p className="outcome__body">
          {product?.name} for {formatMoney(product?.price, product?.currency)}. Razorpay test-mode
          order <span className="mono">{purchase.razorpay_order_id}</span> is created and waiting
          for payment.
        </p>
        {purchase.estimated_delivery && (
          <p className="outcome__delivery">Estimated delivery: {purchase.estimated_delivery}</p>
        )}
        <DeliveryAddress product={product} addressAlreadyConfirmed={addressAlreadyConfirmed} />
        {purchase.payment_link_url && (
          <p style={{ marginBlockStart: '0.875rem' }}>
            <a
              className="btn btn--primary btn--sm"
              href={purchase.payment_link_url}
              target="_blank"
              rel="noreferrer"
            >
              Open the payment link
              <IconArrowRight />
            </a>
          </p>
        )}
        {purchase.transaction_id && (
          <p className="outcome__pending">
            <IconClock />
            Watching for payment — this updates on its own once it's paid.
          </p>
        )}
        {purchase.payment_link_error && (
          <p className="ledger__row" style={{ marginBlockStart: '0.75rem' }}>
            No payment link ({purchase.payment_link_error}) — the order itself is unaffected.
          </p>
        )}
      </div>
    )
  }

  const blocked = purchase.status === 'blocked'

  if (!blocked) {
    return (
      <div className="outcome outcome--blocked">
        <p className="outcome__title">Checkout failed</p>
        <p className="outcome__body">{purchase.reason}</p>
        <div className="ledger">
          <div className="ledger__row">
            <span>What I tried to buy</span>
            <span>{formatMoney(product?.price, product?.currency)}</span>
          </div>
          <div className="ledger__row ledger__row--total ledger__row--breach">
            <span>Nothing charged</span>
            <span>{formatMoney(0, product?.currency)} charged</span>
          </div>
        </div>
      </div>
    )
  }

  const refusal = refusalCopy(purchase, product, merchantName)
  const d = purchase.block_data || {}

  return (
    <div className="outcome outcome--blocked">
      <p className="outcome__title">Stopped before paying</p>
      <p className="outcome__body">{refusal.body}</p>

      {refusal.meter && (
        <BudgetBreach
          requested={Number(d.requested) || 0}
          alreadySpent={Number(d.already_spent) || 0}
          ceiling={Number(d.spend_ceiling) || 0}
          remaining={Number(d.remaining) || 0}
          currency={product?.currency}
        />
      )}

      {/* GOV.UK's design system draws the line this screen kept crossing: an
          error message tells someone their input was wrong, but being refused
          permission is not that, and the guidance is to explain the problem and
          give a way forward. The explanation was here; the way forward was not.
          One button, and only where there is a real next step -- there is nothing
          Otto can offer when no limit has been set at all. */}
      {/* Scoped to the store, not just the amount. A bare "under ₹50,000" gave the
          agent no category to search and it came back asking what kind of product
          you wanted -- a next step that asks another question is not a next step.
          The budget is this store's budget, so its catalog is the honest scope. */}
      {refusal.ask && onAsk && (
        <p className="outcome__next">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onAsk(refusal.ask)}
            disabled={busy}
          >
            {refusal.ask}
            <IconArrowRight />
          </button>
        </p>
      )}

      <div className="ledger">
        <div className="ledger__row">
          <span>What I tried to buy</span>
          <span>{formatMoney(product?.price, product?.currency)}</span>
        </div>
        <div className="ledger__row ledger__row--total ledger__row--breach">
          <span>{refusal.byRule ? 'Refused by your spending rules' : 'Nothing charged'}</span>
          <span>{formatMoney(0, product?.currency)} charged</span>
        </div>
      </div>
    </div>
  )
}

/* Otto's own words for a refusal.

   `purchase.reason` is written for the merchant console's audit trail, where
   "mandate" is exactly the right word. DESIGN_BRIEF §9 forbids that vocabulary in
   the buyer surface, and this screen rendered it verbatim -- saying "mandate"
   twice, with an unformatted ₹4999 sitting directly above a correctly formatted
   ₹4,999.

   It could not be rewritten client-side while every refusal arrived as one opaque
   string: SIX different rules produce `status: "blocked"`, and only one of them is
   a budget breach. So the backend now sends `block_code` plus the numbers that
   rule decided with, and the copy is composed here per code, in Otto's voice.

   An unrecognised code -- an older response, a rule added later -- falls back to a
   sentence that is true but vague, never to `reason`. Vague in the buyer's voice
   is a smaller failure than precise in the operator's. */
const WINDOW_PHRASE = { daily: ' today', weekly: ' this week', monthly: ' this month' }

function refusalCopy(purchase, product, merchantName) {
  const data = purchase?.block_data || {}
  const currency = product?.currency
  const money = (v) => formatMoney(Number(v) || 0, currency)
  const store = merchantName || 'that store'
  const item = data.item_name || product?.name || 'it'

  /* Whether the block came from a rule the shopper set, or from the world moving
     underneath the purchase. The ledger's closing line says which. */
  const byRule = true

  switch (purchase?.block_code) {
    case 'spend_ceiling': {
      const when = WINDOW_PHRASE[data.window] || ''
      const left = Number(data.remaining) || 0
      return {
        byRule,
        meter: true,
        body:
          left > 0
            ? `That's ${money(data.requested)}, and the spending limit for ${store} has ${money(left)} left${when}. I stopped before paying.`
            : `That's ${money(data.requested)}, and the spending limit for ${store} is already used up${when}. I stopped before paying.`,
        ask: left > 0 ? `Show me what's under ${money(left)} at ${store}` : null,
      }
    }

    case 'per_transaction_cap': {
      const cap = Number(data.per_transaction_cap) || 0
      return {
        byRule,
        body: `That's ${money(data.requested)}, above the ${money(cap)} you allow ${store} to charge in one go. I stopped before paying.`,
        ask: cap > 0 ? `Show me what's under ${money(cap)} at ${store}` : null,
      }
    }

    case 'no_mandate':
      return {
        byRule,
        body: `No spending limit is set for ${store} yet, so I won't pay on your behalf there.`,
      }

    case 'merchant_not_allowed':
      return {
        byRule,
        body: `${store} isn't on your list of approved stores, so I won't pay there.`,
      }

    case 'price_mismatch':
      return {
        byRule: false,
        body: `The price moved while I was checking out — ${item} is ${money(data.actual)} now, not ${money(data.expected)}. I stopped rather than pay a price you hadn't seen.`,
      }

    case 'out_of_stock':
      return {
        byRule: false,
        body: `${item} sold out while I was checking out, so there was nothing left to buy.`,
        ask: `Find me something like ${item} at ${store}`,
      }

    default:
      return {
        byRule,
        body: "Something about this purchase didn't check out, so I stopped before paying.",
      }
  }
}

/* The spending limit, drawn at the moment it bites.

   The refusal is the thing the track brief actually grades ("one failure handled
   gracefully"), and the reason it confuses people is that the limit caps TOTAL
   spend over a window, not each purchase — so an item comfortably under the limit
   still gets refused once earlier buys have eaten the budget. Prose says that; a
   bar crossing a line shows it.

   The track spans everything this purchase would have totalled, with the limit
   marked partway along, so the request visibly runs past it.

   This used to fetch the mandate and the audit log and re-derive the spend itself,
   which was wrong twice over: it ignored the mandate's rolling window, so a daily
   budget showed weeks of purchases against it, and it drew a meter under all six
   kinds of block, including "out of stock". It now renders only for a real breach,
   from the numbers the backend refused with. */
function BudgetBreach({ requested, alreadySpent, ceiling, remaining, currency }) {
  const motionOK = useMotionOK()

  const total = alreadySpent + requested
  if (!(ceiling > 0) || requested <= 0 || total <= 0) return null

  const spentPct = (alreadySpent / total) * 100
  const requestedPct = (requested / total) * 100
  const ceilingPct = Math.min((ceiling / total) * 100, 100)
  const over = Math.max(total - ceiling, 0)

  return (
    <div className="breach">
      {/* The label lives outside the track: the track clips its children so the
          rounded fills stay inside its corners, which was silently cutting the
          label off too. */}
      <div className="breach__meter">
        <div className="breach__track">
          <div className="breach__spent" style={{ width: `${spentPct}%` }} />
          <motion.div
            className="breach__requested"
            initial={motionOK ? { width: 0 } : false}
            animate={{ width: `${requestedPct}%` }}
            transition={{ ...SPRING.score, delay: motionOK ? 0.25 : 0 }}
            style={{ left: `${spentPct}%` }}
          />
          <div className="breach__limit" style={{ left: `${ceilingPct}%` }} />
        </div>
        <span className="breach__limit-label" style={{ left: `${ceilingPct}%` }}>
          limit {formatMoney(ceiling, currency)}
        </span>
      </div>

      <div className="breach__legend">
        <span>
          <i className="breach__key breach__key--spent" />
          {formatMoney(alreadySpent, currency)} already spent
        </span>
        <span>
          <i className="breach__key breach__key--requested" />
          {formatMoney(requested, currency)} this request
        </span>
        {/* The headroom is the only number here anyone can act on, and it was the
            one number the card left out. */}
        <span className="breach__left">{formatMoney(remaining, currency)} left</span>
        <span className="breach__over">{formatMoney(over, currency)} over</span>
      </div>
    </div>
  )
}

function Turn({ turn, index, onPick, onConfirmPurchase, onAsk, busy }) {
  const turnMotionOK = useMotionOK()

  const { goal, result } = turn

  /* The three beats of a settled turn, named so the order can change with the
     outcome without duplicating any of them. */
  const productNode = (
    <motion.div className="prod-rail" variants={fadeRise}>
      <ProductCard product={result?.selected_product} chosen />
    </motion.div>
  )
  const attributionNode = (
    <motion.div variants={fadeRise}>
      <Attribution merchantName={result?.selected_product?.merchant_name} />
    </motion.div>
  )
  const outcomeNode = (
    <motion.div variants={fadeRise}>
      <Outcome
        purchase={result?.purchase_result}
        product={result?.selected_product}
        merchantName={result?.selected_product?.merchant_name}
        addressAlreadyConfirmed={result?.addressAlreadyConfirmed}
        onAsk={onAsk}
        busy={busy}
      />
    </motion.div>
  )

  return (
    <>
      <div className="msg--user">
        <p>{goal}</p>
      </div>

      <div className="msg--agent">
        <span className="orb orb--sm" aria-hidden="true" />
        <div className="msg__said stack" style={{ '--stack-gap': '0.875rem' }}>
          {!result && (
            <span className="msg__thinking" aria-label="Thinking">
              <span />
              <span />
              <span />
            </span>
          )}

          {result?.status === 'no_merchants' && (
            <>
              <p>
                No store has published a catalog I can read yet, so there's nothing here for me
                to shop at all.
              </p>
              <p>
                <Link to="/merchant/fix" className="btn btn--ghost btn--sm">
                  Publish one in Frontage
                  <IconArrowRight />
                </Link>
              </p>
            </>
          )}

          {result?.status === 'need_more_info' && <p>{result.reasoning}</p>}

          {result?.status === 'no_match' && (
            <p>
              {result.reasoning ||
                "I read every store's published catalog and nothing matches that. Try naming a product, or give me a budget."}
            </p>
          )}

          {result?.status === 'invalid_selection' && (
            <p>
              I picked something that turned out not to be in any published catalog, so I stopped
              rather than order a product that may not exist. Ask me again and I'll re-read the
              catalogs.
            </p>
          )}

          {result?.status === 'failed' && (
            <>
              <p>I couldn't finish reading the catalogs, so I haven't bought anything.</p>
              {result.reason && <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{result.reason}</p>}
            </>
          )}

          {result?.status === 'ambiguous' && (
            <Ambiguous result={result} onPick={onPick} busy={busy} />
          )}

          {result?.status === 'address_confirm' && (
            <AddressConfirm
              candidate={result.candidate}
              busy={busy}
              onConfirm={() => onConfirmPurchase(index, result.candidate)}
            />
          )}

          {/* The payoff of the whole demo — and, when the mandate blocks it, the
              graded failure case. It arrives as a sequence rather than a block:
              what Otto reasoned, then what it picked, then who it is buying from,
              then the verdict. Each beat gets its own moment to land. */}
          {result?.status === 'purchase_attempted' && (
            <motion.div
              className="stack"
              style={{ '--stack-gap': '0.875rem' }}
              initial={turnMotionOK ? 'hidden' : false}
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: STAGGER.loose } } }}
            >
              <motion.p variants={fadeRise}>
                {result.buyer_reasoning ||
                  `Here's what I found at ${result.selected_product?.merchant_name || 'that store'}.`}
              </motion.p>
              {/* A bought turn ends on the order; a refused one ends on the way
                  forward. The refusal used to sit last, under a 293px photograph
                  of the thing you had just been denied — the most prominent
                  element on the screen, and the last thing you were left with. */}
              {result.purchase_result?.status === 'success' ? (
                <>
                  {productNode}
                  {attributionNode}
                  {outcomeNode}
                </>
              ) : (
                <>
                  {outcomeNode}
                  {productNode}
                  {attributionNode}
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </>
  )
}

/* Every variant_info key any candidate declares, in first-seen order -- a merchant's
   options vocabulary (size/color/etc) varies store to store, so this can't be a fixed
   list. */
function variantKeys(candidates) {
  const keys = []
  for (const c of candidates) {
    if (!c.variant_info || typeof c.variant_info !== 'object') continue
    for (const key of Object.keys(c.variant_info)) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

/* A row-per-attribute comparison instead of a card list -- close enough in count (2-4)
   that seeing them side by side beats scanning cards one at a time. Above 4 it stops
   being legible as a table, so Ambiguous falls back to the existing card list. */
function SpecCompare({ candidates, diffs, onPick, busy }) {
  const keys = variantKeys(candidates)

  return (
    <div className="speccompare">
      <table className="speccompare__table">
        <thead>
          <tr>
            <th scope="col" />
            {candidates.map((c) => (
              <th scope="col" key={c.id}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Store</th>
            {candidates.map((c) => (
              <td key={c.id}>{c.merchant_name || '—'}</td>
            ))}
          </tr>
          {/* Choosing between two near-identical products off attribute rows alone is
              hard work when a photo settles it instantly. Only rendered when at least
              one candidate has an image, so photo-less stores keep a tight table. */}
          {candidates.some((c) => c.image_url) && (
            <tr>
              <th scope="row" />
              {candidates.map((c) => (
                <td key={c.id}>
                  {c.image_url ? (
                    <img className="speccompare__img" src={c.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="speccompare__noimg">no photo</span>
                  )}
                </td>
              ))}
            </tr>
          )}
          <tr>
            <th scope="row">Price</th>
            {candidates.map((c) => (
              <td key={c.id}>{formatMoney(c.price, c.currency)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Availability</th>
            {candidates.map((c) => (
              <td key={c.id}>
                {c.availability ? String(c.availability).replace(/_/g, ' ') : '—'}
              </td>
            ))}
          </tr>
          {keys.map((key) => (
            <tr key={key}>
              <th scope="row" className="speccompare__key">
                {key}
              </th>
              {candidates.map((c) => {
                const value = c.variant_info?.[key]
                return (
                  <td key={c.id}>{Array.isArray(value) ? value.join(', ') : value || '—'}</td>
                )
              })}
            </tr>
          ))}
          <tr>
            <th scope="row">What's different</th>
            {candidates.map((c, i) => (
              <td key={c.id}>
                {diffs[i].unique.length > 0
                  ? diffs[i].unique.join(', ')
                  : diffs[i].identical
                    ? (diffs[i].identicalWithinSameMerchant
                        ? `catalog id …${String(c.id).slice(-6)}`
                        : c.merchant_name || `catalog id …${String(c.id).slice(-6)}`)
                    : '—'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" />
            {candidates.map((c) => (
              <td key={c.id}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={() => onPick(c)}
                >
                  Choose
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Ambiguous({ result, onPick, busy }) {
  const candidates = result.candidates || []
  const diffs = differentiators(candidates)
  const anyIdentical = diffs.some((d) => d.identical)
  const compact = candidates.length >= 2 && candidates.length <= 4

  return (
    <>
      <p>
        {result.reasoning ||
          "Multiple products fit that. I'm not going to guess which one you meant."}
      </p>
      {anyIdentical && (
        <p className="prod__note">
          Two of these are listed under exactly the same name at the same price, so the only thing
          telling them apart is their catalog id.
        </p>
      )}

      {compact ? (
        <SpecCompare candidates={candidates} diffs={diffs} onPick={onPick} busy={busy} />
      ) : (
        <div className="disambig">
          {candidates.map((candidate, i) => {
            const diff = diffs[i]
            return (
              <button
                key={candidate.id}
                type="button"
                className="disambig__opt"
                disabled={busy}
                onClick={() => onPick(candidate)}
              >
                {/* Five near-identical shirts differing only by colour is a
                    choice a thumbnail makes instantly and a word does not —
                    "Sky Blue" and "Sage Green" are the whole decision. */}
                {candidate.image_url && (
                  <img className="disambig__thumb" src={candidate.image_url} alt="" loading="lazy" />
                )}
                <span className="disambig__main">
                  <span className="disambig__name">{candidate.name}</span>
                  {candidate.merchant_name && (
                    <span className="disambig__merchant">{candidate.merchant_name}</span>
                  )}
                  <span className="disambig__diff">
                    {diff.unique.map((token) => (
                      <span key={token} className="disambig__tag">
                        {token}
                      </span>
                    ))}
                    {diff.identical && (
                      <span className="disambig__tag disambig__tag--same">
                        {diff.identicalWithinSameMerchant
                          ? `catalog id …${String(candidate.id).slice(-6)}`
                          : candidate.merchant_name || `catalog id …${String(candidate.id).slice(-6)}`}
                      </span>
                    )}
                    {candidate.availability && candidate.availability !== 'in_stock' && (
                      <span className="disambig__tag disambig__tag--same">
                        {String(candidate.availability).replace(/_/g, ' ')}
                      </span>
                    )}
                  </span>
                </span>
                <span className="disambig__price">
                  {formatMoney(candidate.price, candidate.currency)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

/* Mic-to-text for the composer, via the browser's own SpeechRecognition --
   no server round-trip, no key, no new dependency. Feature-detected on mount:
   Safari/Firefox don't (fully) support this, so callers must treat isSupported
   as the signal for whether to render a mic button at all, rather than showing
   one that silently does nothing. Fills the input live as words are heard;
   never submits on its own -- the buyer still reviews/edits before sending,
   same trust model as typing. */
function useSpeechToText(onResult) {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return undefined

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onResultRef.current(transcript)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    setIsSupported(true)

    return () => recognition.stop()
  }, [])

  function start() {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      // start() throws if already running -- isListening already guards this,
      // but browsers disagree on timing, so failing silently is safer than a crash
    }
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  return { isSupported, isListening, start, stop }
}

/* Matches WALL_SLOTS in HeroWall: one product per slot, one store per product.

   The two editorial choices below are about the shopfront, not the catalog, so
   they live here rather than in the endpoint. MS Retro's catalog is licensed
   sports jerseys, which read as a different shop from everything beside them.
   5feet11 takes two slots because it is the only clothing store left once that
   one is out, and a single garment among six watches, shoes and grooming bottles
   does not read as "this agent can buy you clothes". */
const WALL_SAMPLE_COUNT = 7
const WALL_EXCLUDE = 'MS Retro Store'
const WALL_FEATURE = '5feet11'

/* The hero wall's products.

   This used to fetch the first five merchants' catalogs and flatten them. Two of
   those five publish no photography at all, so they occupied slots and
   contributed nothing, and six of the eleven stores -- including both clothing
   stores -- could never appear however good their catalogs were. A wall whose
   entire point is "one agent reads every store" was drawing from three.

   The backend now picks one photographed product per store, spread across the
   whole list, in a single request. */
function useShowcase() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    let cancelled = false
    api
      .getShowcase({ count: WALL_SAMPLE_COUNT, exclude: WALL_EXCLUDE, feature: WALL_FEATURE })
      .then((r) => {
        if (!cancelled && Array.isArray(r?.products)) setProducts(r.products)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return products
}

/* The reach line under the greeting. Otto's whole claim is breadth -- one agent
   across every store that publishes a readable catalog -- and the hero asserted
   it in prose ("every agent-ready store") without ever saying how many. A number
   is the difference between a claim and a demonstration. Fetched rather than
   derived from the merchant list, because a store that has connected but not
   published is not reachable and must not be counted. */
function useReach() {
  const [reach, setReach] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getReach()
      .then((r) => {
        if (!cancelled && r?.products) setReach(r)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return reach
}

export default function OttoChat() {
  const catalog = useShowcase()
  const reach = useReach()
  const [goal, setGoal] = useState('')
  const [turns, setTurns] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const convoRef = useRef(null)
  const innerRef = useRef(null)
  const composerRef = useRef(null)
  const speech = useSpeechToText((text) => setGoal(text))

  const hasTurns = turns.length > 0
  const motionOK = useMotionOK()

  /* Stay pinned to the newest message.

     An answer arrives in pieces — reasoning, then a product card, then the
     outcome — so scrolling once when state changes measures the container
     before it has finished growing and leaves the conclusion below the fold.
     Watching the content's size instead follows it all the way down, and
     un-pins the moment the reader scrolls up to re-read something. */
  useEffect(() => {
    const el = convoRef.current
    const inner = innerRef.current
    if (!el || !inner) return undefined

    let pinned = true

    const onScroll = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }

    const observer = new ResizeObserver(() => {
      if (pinned) el.scrollTop = el.scrollHeight
    })

    el.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(inner)

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [hasTurns])

  const goals = EXAMPLE_GOALS

  async function send(text) {
    const asked = (text ?? goal).trim()
    if (!asked) return

    setGoal('')
    setError(null)
    setBusy(true)
    setTurns((prev) => [...prev, { goal: asked, result: null }])

    try {
      const data = await api.discover(asked, buildHistory(turns))
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, result: data } : t)))
    } catch (err) {
      setError(err.message)
      setTurns((prev) => prev.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }

  /* Buying the exact row the human clicked, by id, rather than re-running the
     name search — two products here can share a byte-identical name, and
     re-searching would just return "ambiguous" forever.

     Picking a candidate doesn't buy it yet — it surfaces an address-confirm step
     first (see confirmPurchase below), since this is the one checkout path where
     the frontend controls the moment of purchase and can genuinely gate it. */
  function pick(candidate) {
    setError(null)
    setTurns((prev) => [
      ...prev,
      { goal: `That one — ${candidate.name}`, result: { status: 'address_confirm', candidate } },
    ])
  }

  async function confirmPurchase(turnIndex, candidate) {
    setBusy(true)
    setError(null)

    try {
      const purchase = await api.purchase(candidate.id, candidate.price)
      const result = {
        status: 'purchase_attempted',
        selected_product: candidate,
        buyer_reasoning: 'You picked that one, so I went straight to checkout for it.',
        purchase_result: purchase,
        addressAlreadyConfirmed: true,
      }
      setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, result } : t)))
    } catch (err) {
      setError(err.message)
      setTurns((prev) => prev.slice(0, turnIndex))
    } finally {
      setBusy(false)
    }
  }

  const composer = (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <input
        className="composer__input"
        ref={composerRef}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder={speech.isListening ? 'Listening…' : 'What are you looking for?'}
        aria-label="What are you looking for?"
      />
      {speech.isSupported && (
        <button
          type="button"
          className={`composer__mic${speech.isListening ? ' composer__mic--active' : ''}`}
          onClick={() => (speech.isListening ? speech.stop() : speech.start())}
          title={speech.isListening ? 'Stop listening' : 'Speak your goal'}
          aria-pressed={speech.isListening}
        >
          <IconMic />
          <span className="sr-only">{speech.isListening ? 'Stop listening' : 'Speak your goal'}</span>
        </button>
      )}
      <button
        type="submit"
        className="composer__send"
        disabled={busy || !goal.trim()}
        title="Send"
      >
        <IconSend />
        <span className="sr-only">Send</span>
      </button>
    </form>
  )

  const chips = goals.length > 0 && (
    <div className="chips">
      {goals.map((g) => (
        <button key={g} type="button" className="chip" disabled={busy} onClick={() => send(g)}>
          {g}
        </button>
      ))}
    </div>
  )

  /* Clicking a product writes the goal rather than sending it. The wall is a way
     into the conversation, not a buy button — one stray click should never start
     a checkout, even a test-mode one. */
  function askAbout(product) {
    setGoal(`I want the ${product.name}`)
    composerRef.current?.focus()
  }

  if (turns.length === 0) {
    return (
      <div className="otto__body">
        <motion.div
          className="otto-hero"
          initial={motionOK ? 'hidden' : false}
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: STAGGER.normal, delayChildren: 0.15 } } }}
        >
          <HeroWall catalog={catalog} onPick={askAbout} />

          <motion.h1 className="otto-hero__greet" variants={fadeRise}>
            Hey there,
            <em>what are you after?</em>
          </motion.h1>

          <motion.p className="otto-hero__sub" variants={fadeRise}>
            I can read every agent-ready store's catalog the way a machine reads it, pick what
            fits, and check out — as long as it's inside the limit each store set.
          </motion.p>

          {/* Rendered only once the number is real. A skeleton "— stores" would be
              a worse claim than none. */}
          {reach && (
            <motion.p className="otto-hero__reach" variants={fadeRise}>
              <span className="otto-hero__reach-n">{reach.products}</span> products
              <span className="otto-hero__reach-dot" aria-hidden="true" />
              <span className="otto-hero__reach-n">{reach.stores}</span> stores
              <span className="otto-hero__reach-dot" aria-hidden="true" />
              readable right now
            </motion.p>
          )}

          <motion.div variants={fadeRise} style={{ width: '100%' }}>
            {composer}
          </motion.div>

          <motion.div variants={fadeRise}>{chips}</motion.div>

          {error && (
            <div className="notice notice--bad" style={{ maxWidth: '38rem' }}>
              <div className="notice__body">{error}</div>
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  /* The field follows the most recent turn that actually reported a funnel, not
     the last turn outright: while a follow-up is in flight the previous answer
     stays on screen rather than the whole right-hand side blanking. */
  const fieldResult = [...turns].reverse().find((t) => t.result?.considered_count)?.result || null

  /* The conversation holds the middle of the page until there is actually a
     field to make room for. It used to move the moment you sent anything: the
     grid was permanently two columns, so a question with no answer yet sat
     squeezed into the left third beside an empty void. */
  const hasField = Boolean(fieldResult)

  return (
    <>
      <div className="otto__body">
        <div className="otto__work" data-field={hasField ? 'true' : undefined}>
        <div className="convo" ref={convoRef}>
          <div className="convo__inner" ref={innerRef}>
            <AnimatePresence initial={false}>
              {turns.map((turn, i) => (
                <motion.div
                  key={i}
                  layout={motionOK ? 'position' : false}
                  initial={motionOK ? { opacity: 0, y: 18 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={SPRING.soft}
                  className="convo__turn"
                >
                  <Turn
                    index={i}
                    turn={turn}
                    onPick={pick}
                    onConfirmPurchase={confirmPurchase}
                    onAsk={send}
                    busy={busy}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {error && (
              <div className="notice notice--bad">
                <div className="notice__body">
                  <div className="notice__title">That didn't reach the store</div>
                  {error}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The field arrives after the room does: the column opens over 620ms and
            this fades in from the right behind it, so the catalog appears to
            occupy space that was already there rather than shoving the
            conversation aside. */}
        <AnimatePresence>
          {hasField && (
            <motion.div
              key="field"
              className="otto__field-slot"
              initial={motionOK ? { opacity: 0, x: 28 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: motionOK ? 0.5 : 0, ease: EASE.out, delay: motionOK ? 0.22 : 0 }}
            >
              <OttoField result={fieldResult} onPick={askAbout} busy={busy} />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <div className="otto__foot stack" style={{ '--stack-gap': '0.75rem' }}>
        {composer}
        <p className="eyebrow" style={{ textAlign: 'center' }}>
          <IconSparkle style={{ display: 'inline', verticalAlign: '-2px' }} /> {AGENT_NAME} is a
          stand-in for a real shopping agent · Razorpay test mode
        </p>
      </div>
    </>
  )
}
