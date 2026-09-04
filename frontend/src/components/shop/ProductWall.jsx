import { useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { formatMoney, initialOf } from '../../lib/format'
import { SPRING, STAGGER, useMotionOK } from '../../lib/motion'

/* The floating product wall.

   Otto's landing used to be an orb, a line of text and three chips — nothing you
   could actually buy, on a page whose entire job is buying. Meanwhile the
   catalog now carries real product photography from the Shopify feed. This puts
   that photography where the reference (shop.app) puts it: floating above the
   greeting, with depth, before you have typed anything.

   Depth is CSS, not WebGL. A `perspective` container plus per-card translateZ
   and rotate does the whole job at zero bundle cost, and the wall tilts toward
   the pointer so it reads as a space rather than a collage. The 3D layer that
   sits on top of this is optional; this is the version that always works. */

/* Fixed scatter rather than random: a seeded shuffle would move cards between
   renders, and truly even spacing reads as a grid, not a drift. These positions
   were placed by eye — x/y are percentages of the container, z in pixels. */
/* y stays between 29% and 66%: a card is centred on its slot and is roughly 27%
   of the stage tall, so anything outside that band hangs off the stage and
   collides with the greeting below it. */
const SLOTS = [
  { x: 10, y: 58, r: -7, z: -70, s: 0.8 },
  { x: 24, y: 31, r: -4, z: 20, s: 0.95 },
  { x: 38, y: 64, r: 3, z: -30, s: 0.86 },
  { x: 52, y: 29, r: -2, z: 45, s: 1 },
  { x: 66, y: 62, r: 6, z: -50, s: 0.83 },
  { x: 80, y: 33, r: 4, z: 5, s: 0.92 },
  { x: 90, y: 60, r: -5, z: -85, s: 0.76 },
]

/* Photo-less stores (the two seeded ones) never get imagery, so the fallback has
   to be a design rather than an apology. A stable hue per product name gives the
   wall the colour that photography would otherwise supply. */
function hueOf(text) {
  let hash = 0
  for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}

/* Prefer products with photos, then spread the selection across the price range
   so the wall shows the shape of the catalog rather than seven near-identical
   colourways of one shoe. */
export function pickProducts(catalog, count) {
  if (!catalog || catalog.length === 0) return []

  const withPhoto = catalog.filter((i) => i.image_url)
  const pool = withPhoto.length >= count ? withPhoto : catalog
  const sorted = [...pool].sort((a, b) => (a.price || 0) - (b.price || 0))

  if (sorted.length <= count) return sorted

  const step = sorted.length / count
  return Array.from({ length: count }, (_, i) => sorted[Math.floor(i * step)])
}

function WallCard({ product, slot, index, onPick, motionOK }) {
  const [failed, setFailed] = useState(false)
  const showImage = product.image_url && !failed
  const hue = hueOf(product.name)

  /* Two nested elements on purpose. Motion owns the `transform` property of any
     element it animates, so a CSS transform on the same node gets overwritten —
     which silently dropped the translate(-50%,-50%) centring and left every card
     hanging half its height too low. The slot holds the static placement, the
     button holds the animation, and the two compose instead of fighting. */
  return (
    <div
      className="wall__slot"
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        '--card-z': `${slot.z}px`,
        '--card-r': `${slot.r}deg`,
        '--card-s': slot.s,
        '--card-hue': hue,
      }}
    >
      <motion.button
        type="button"
        className="wall__card"
        onClick={() => onPick(product)}
        title={`Ask about ${product.name}`}
        initial={motionOK ? { opacity: 0, y: 26, scale: 0.9 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING.soft, delay: index * STAGGER.loose }}
        whileHover={motionOK ? { scale: 1.06 } : undefined}
        whileTap={motionOK ? { scale: 0.98 } : undefined}
      >
        <span className={`wall__media${showImage ? '' : ' wall__media--empty'}`}>
          {showImage ? (
            <img
              className="wall__img"
              src={product.image_url}
              alt=""
              loading="lazy"
              draggable="false"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="wall__initial">{initialOf(product.name)}</span>
          )}
        </span>
        <span className="wall__meta">
          <span className="wall__name">{product.name}</span>
          <span className="wall__price">{formatMoney(product.price, product.currency)}</span>
          {/* The wall samples several stores at once -- that mix is the point of
              it, and without a pin on each card it reads as one shop's window. */}
          {product.merchant_name && (
            <span className="wall__store">{product.merchant_name}</span>
          )}
        </span>
      </motion.button>
    </div>
  )
}

export default function ProductWall({ catalog, onPick, compact = false }) {
  const motionOK = useMotionOK()
  const ref = useRef(null)

  const slots = compact ? SLOTS.slice(1, 5) : SLOTS
  const products = useMemo(() => pickProducts(catalog, slots.length), [catalog, slots.length])

  /* Pointer parallax. The raw pointer position is normalised to -0.5..0.5 and fed
     through a slow spring, so the wall follows the cursor with weight instead of
     snapping to it. */
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-11, 11]), SPRING.float)
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), SPRING.float)

  function handlePointer(e) {
    if (!motionOK || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    px.set((e.clientX - box.left) / box.width - 0.5)
    py.set((e.clientY - box.top) / box.height - 0.5)
  }

  function resetPointer() {
    px.set(0)
    py.set(0)
  }

  if (products.length === 0) return null

  return (
    <div
      className="wall"
      ref={ref}
      onPointerMove={handlePointer}
      onPointerLeave={resetPointer}
      aria-label="Products from this store"
    >
      <motion.div
        className="wall__stage"
        style={motionOK ? { rotateX, rotateY } : undefined}
      >
        {products.map((product, i) => (
          <WallCard
            key={product.id}
            product={product}
            slot={slots[i]}
            index={i}
            onPick={onPick}
            motionOK={motionOK}
          />
        ))}
      </motion.div>
    </div>
  )
}
