import { Suspense, lazy, useMemo } from 'react'
import ProductWall, { pickProducts } from './ProductWall'
import { useMotionOK } from '../../lib/motion'

/* Chooses which product wall to render.

   The CSS wall is the guaranteed path: it always works, needs no GPU, and is
   what ships if anything about the 3D layer misbehaves. The WebGL wall is an
   upgrade layered on top, loaded lazily so its ~200KB never blocks the page and
   a failed chunk degrades to the CSS version rather than to nothing.

   Four things all have to be true before any of that loads. Any one of them
   failing quietly falls back — none of this should ever be a visible error. */

const WALL_SLOTS = 7

/* Off only when explicitly disabled, so a fresh clone gets the good version and
   a bad recording day is one env var away from the safe one:
       VITE_OTTO_3D=false */
const ENABLED = import.meta.env.VITE_OTTO_3D !== 'false'

const ProductWall3D = lazy(() => import('./ProductWall3D'))

/* Probed once per session rather than per render — creating throwaway canvases
   on every render is exactly the kind of thing that shows up as jank later. */
let webglCache = null
function hasWebGL() {
  if (webglCache !== null) return webglCache
  try {
    const canvas = document.createElement('canvas')
    webglCache = Boolean(
      window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    )
  } catch {
    webglCache = false
  }
  return webglCache
}

export default function HeroWall({ catalog, onPick }) {
  const motionOK = useMotionOK()
  const products = useMemo(() => pickProducts(catalog, WALL_SLOTS), [catalog])

  /* A textured plane with no texture is a black rectangle, so the 3D wall only
     runs when every card it would draw actually has a photo. Photo-less stores
     get the CSS wall's typographic treatment instead, which is designed for it. */
  const everyCardHasPhoto =
    products.length === WALL_SLOTS && products.every((p) => Boolean(p.image_url))

  const use3D = ENABLED && motionOK && everyCardHasPhoto && hasWebGL()

  if (!use3D) return <ProductWall catalog={catalog} onPick={onPick} />

  return (
    <Suspense fallback={<ProductWall catalog={catalog} onPick={onPick} />}>
      <ProductWall3D products={products} onPick={onPick} />
    </Suspense>
  )
}
