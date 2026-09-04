import { useEffect, useState } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'
import { formatMoney } from '../../lib/format'
import { SPRING, STAGGER, fadeRise, useMotionOK } from '../../lib/motion'

/* The field.

   A chat column shows you a conclusion. It cannot show you the work, and the
   work is the entire claim this project makes: that a catalog written for
   machines can be read by one, across every store at once. Two hundred and
   twenty-two products became nineteen became one, and none of that was visible
   anywhere in the interface -- the answer arrived as a sentence, exactly like
   every other chatbot's.

   So once you have asked something, the conversation moves to a rail and this
   takes the room: the funnel as three numbers, and the shortlist as the products
   it actually holds, with the chosen one marked among them. The narrowing
   becomes a place rather than a claim. */

/* The numbers count rather than appear. The funnel is a sequence -- 222, then 19,
   then 1 -- and three figures snapping into place simultaneously reads as three
   unrelated statistics instead of one narrowing. */
function Count({ value, delay = 0 }) {
  const motionOK = useMotionOK()
  const shown = useMotionValue(motionOK ? 0 : value)
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const unsubscribe = shown.on('change', (v) => setDisplay(Math.round(v)))
    if (!motionOK) {
      shown.set(value)
      return unsubscribe
    }
    const controls = animate(shown, value, { ...SPRING.score, delay })
    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [value, delay, motionOK, shown])

  return <span className="funnel__num">{display}</span>
}

function Step({ value, label, delay, muted }) {
  return (
    <span className={`funnel__step${muted ? ' funnel__step--muted' : ''}`}>
      {value === null ? <span className="funnel__num">—</span> : <Count value={value} delay={delay} />}
      <span className="funnel__label">{label}</span>
    </span>
  )
}

function Tile({ product, chosen, onPick, busy }) {
  const photo = product.image_url

  return (
    <motion.button
      type="button"
      variants={fadeRise}
      className={`fieldtile${chosen ? ' fieldtile--chosen' : ''}`}
      onClick={() => onPick?.(product)}
      disabled={busy}
      /* The chosen one is announced rather than only outlined -- the mark is the
         whole point of showing the shortlist, and a border says nothing to a
         screen reader. */
      aria-label={`${product.name}, ${formatMoney(product.price, product.currency)}, ${
        product.merchant_name || 'unknown store'
      }${chosen ? '. Otto chose this one.' : ''}`}
    >
      <span className="fieldtile__frame">
        {photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          /* Photo-less stores are the norm on an imported catalog, not an edge
             case, so the fallback is a designed state: the name set large, which
             is the only thing the store actually gave us. */
          <span className="fieldtile__nophoto">{product.name}</span>
        )}
        {chosen && <span className="fieldtile__mark">Otto picked this</span>}
      </span>
      <span className="fieldtile__name">{product.name}</span>
      <span className="fieldtile__meta">
        <span className="fieldtile__price">{formatMoney(product.price, product.currency)}</span>
        {/* Store attribution belongs on every tile now that one agent reads
            eleven catalogs. Without it a mixed grid looks like one shop. */}
        <span className="fieldtile__store">{product.merchant_name}</span>
      </span>
    </motion.button>
  )
}

export default function OttoField({ result, onPick, busy }) {
  const motionOK = useMotionOK()

  const considered = Number(result?.considered_count) || 0
  const shortlist = Array.isArray(result?.shortlist) ? result.shortlist : null
  const chosenId = result?.selected_product?.id
  const candidates = Array.isArray(result?.candidates) ? result.candidates : []

  if (!considered) return null

  /* What the last step of the funnel actually is depends on how the turn ended:
     one product when Otto committed, a handful when it could not tell them apart,
     and nothing when it found no match at all. Reporting "1 chosen" on an
     ambiguous turn would claim a decision that was never made. */
  const settled = Boolean(chosenId)
  const endValue = settled ? 1 : candidates.length
  const endLabel = settled ? 'chosen' : candidates.length ? 'too close to call' : 'no match'

  /* What the field shows, in order of how much it can say:
     the shortlist when there was one; the candidates when Otto could not choose
     between them; and failing both, the single product it settled on. That last
     case is not a nicety -- when the two-phase narrowing declines, the funnel
     still ends on "1 chosen", and a field that then shows nothing leaves that
     number pointing at empty space. */
  const tiles =
    shortlist ||
    (candidates.length ? candidates : result?.selected_product ? [result.selected_product] : [])

  return (
    <section className="otto-field" aria-label="How Otto narrowed the catalog">
      <header className="otto-field__head">
        <div className="funnel">
          <Step value={considered} label="products read" delay={0} />
          <span className="funnel__arrow" aria-hidden="true" />
          {/* A null shortlist is not zero. The two-phase narrowing declined or
              failed, so the whole catalog went to the picker -- printing 0 would
              read as "nothing matched", the opposite of what happened. */}
          <Step
            value={shortlist ? shortlist.length : null}
            label={shortlist ? 'shortlisted' : 'no narrowing'}
            delay={0.18}
            muted={!shortlist}
          />
          <span className="funnel__arrow" aria-hidden="true" />
          <Step value={endValue} label={endLabel} delay={0.36} />
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {shortlist
            ? `Read ${considered} products, shortlisted ${shortlist.length}, ${endLabel} ${endValue}.`
            : `Read ${considered} products without narrowing first.`}
        </p>
      </header>

      {tiles.length > 0 ? (
        <motion.div
          className="otto-field__grid"
          initial={motionOK ? 'hidden' : false}
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: STAGGER.tight } } }}
        >
          {tiles.map((p) => (
            <Tile
              key={p.id}
              product={p}
              chosen={p.id === chosenId}
              onPick={onPick}
              busy={busy}
            />
          ))}
        </motion.div>
      ) : (
        <p className="otto-field__none">
          Otto read all {considered} products without narrowing them down first, and nothing
          matched — the conversation has the rest.
        </p>
      )}
    </section>
  )
}
