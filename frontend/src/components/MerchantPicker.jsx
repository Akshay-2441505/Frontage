import { useEffect, useRef, useState } from 'react'
import { useMerchants } from '../context/MerchantContext'
import { formatScore } from '../lib/format'
import { IconChevron, IconStore } from './Icons'

/* Replaces the unlabelled <select> in the old top bar. With nine merchants and
   names like "Terracotta & Co (Home Goods)", the two things that actually help
   you know where you are are the full name and whether this is seeded demo data
   or a real store someone imported. Both are on every row. */
export default function MerchantPicker({ score }) {
  const { merchants, merchantId, merchant, setMerchantId } = useMerchants()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (merchants.length === 0) {
    return (
      <div className="picker">
        <div className="picker__button">
          <IconStore />
          <span className="picker__name dim">No stores yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className="picker" ref={rootRef}>
      <span className="rail-group__label" id="picker-label">
        Working on
      </span>
      <button
        type="button"
        className="picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="picker-label"
        onClick={() => setOpen((v) => !v)}
      >
        <IconStore />
        <span className="picker__name">{merchant?.name || 'Select a store'}</span>
        {typeof score === 'number' && (
          <span className="picker__score num" title="Frontage score">
            {formatScore(score)}
          </span>
        )}
        <IconChevron style={{ transform: open ? 'rotate(90deg)' : 'none', flex: 'none' }} />
      </button>

      {open && (
        <ul className="picker__menu" role="listbox" aria-labelledby="picker-label">
          {merchants.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={String(m.id) === String(merchantId)}
                className="picker__option"
                onClick={() => {
                  setMerchantId(m.id)
                  setOpen(false)
                }}
              >
                <span className="grow truncate">{m.name}</span>
                <span className="pill pill--plain pill--neutral">
                  {m.catalog_source === 'seed' ? 'demo' : m.catalog_source}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
