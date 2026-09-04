import { useEffect, useRef, useState } from 'react'

/* Measures the real aspect ratio of product images.

   Stores photograph their products completely differently — 5feet11 and Comet
   shoot portrait on a model (0.75), Neemans shoots landscape studio (1.60),
   Bombay Shaving and Jaipur shoot square (1.00), and Plum mixes. Any fixed
   frame therefore crops somebody badly: a portrait model shot forced into a
   landscape plane loses the head and the feet, which is the entire subject.

   The DOM can size an <img> from its own intrinsic ratio for free, so this hook
   exists only for WebGL, where a plane needs explicit geometry before anything
   can be drawn on it. */
export function useImageAspects(products) {
  const [aspects, setAspects] = useState({})
  const seen = useRef(new Set())

  useEffect(() => {
    let cancelled = false

    for (const product of products) {
      if (!product?.image_url || seen.current.has(product.id)) continue
      seen.current.add(product.id)

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled || !img.naturalHeight) return
        setAspects((prev) => ({ ...prev, [product.id]: img.naturalWidth / img.naturalHeight }))
      }
      img.src = product.image_url
    }

    return () => {
      cancelled = true
    }
  }, [products])

  return aspects
}

/* Single-image variant, for a card that needs to take one photo's shape.

   Measuring rather than assuming matters here because the alternative — a fixed
   frame with object-fit: cover — crops a portrait model shot down to a band
   across the torso, losing both the head and the product. */
export function useImageAspect(url) {
  const [aspect, setAspect] = useState(null)

  useEffect(() => {
    if (!url) {
      setAspect(null)
      return undefined
    }

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!cancelled && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
    }
    img.src = url

    return () => {
      cancelled = true
    }
  }, [url])

  return aspect
}

/* Fits an aspect ratio inside a bounding box without cropping or distorting —
   the same maths as `object-fit: contain`, in world units. */
export function fitWithin(aspect, maxW, maxH) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  return a >= maxW / maxH ? [maxW, maxW / a] : [maxH * a, maxH]
}
