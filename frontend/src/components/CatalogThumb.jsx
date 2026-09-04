import { useState } from 'react'
import { initialOf } from '../lib/format'

/* Small product thumbnail shared by the console's catalog cards (Diagnose, Fix).
   Same img-with-fallback shape as Otto's buyer-facing ProductCard, just smaller --
   the merchant already knows what their product looks like, so this is a glance,
   not a gallery. */
export default function CatalogThumb({ item }) {
  const [failed, setFailed] = useState(false)
  const showImage = item.image_url && !failed

  return (
    <div className="cat-thumb">
      {showImage ? (
        <img
          className="cat-thumb__img"
          src={item.image_url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="cat-thumb__initial">{initialOf(item.name)}</span>
      )}
    </div>
  )
}
