import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMerchants } from '../context/MerchantContext'
import { formatScore } from '../lib/format'
import { IconChevron, IconStore } from './Icons'

/* Replaces the unlabelled <select> in the old top bar. With eleven merchants and
   names like "Terracotta & Co (Home Goods)", the two things that actually help
   you know where you are are the full name and whether this is seeded demo data
   or a real store someone imported. Both are on every row.

   The ARIA here follows the APG listbox pattern properly, which the first
   version did not. It put role="listbox" on a <ul> whose <li> wrapped
   role="option" buttons: the intervening implicit `listitem` breaks the required
   parent/child relationship, so assistive tech sees a listbox containing no
   options at all. There was also no arrow-key navigation, no
   aria-activedescendant, and no focus movement on open -- so the menu could be
   opened from the keyboard and then not used from it.

   Focus stays on the listbox itself and aria-activedescendant names the active
   option, rather than moving DOM focus between options. That is the pattern for
   a list whose items are choices rather than controls, and it keeps Escape and
   Tab behaving the way people expect from a <select>. */
export default function MerchantPicker({ score }) {
  const { merchants, merchantId, merchant, setMerchantId } = useMerchants()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const buttonRef = useRef(null)
  const baseId = useId()

  const optionId = (i) => `${baseId}-opt-${i}`
  const selectedIndex = merchants.findIndex((m) => String(m.id) === String(merchantId))

  const close = useCallback((returnFocus) => {
    setOpen(false)
    setActiveIndex(-1)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  /* Opening lands on the current store, not the top of the list: it is where
     you already are, and it makes the arrow keys a relative move. */
  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    listRef.current?.focus()

    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  /* Keeping the active option in view matters at eleven stores: the menu scrolls
     at 19rem, so arrowing past the fold otherwise moves a highlight nobody can
     see. */
  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' })
  })

  function commit(index) {
    const m = merchants[index]
    if (m) setMerchantId(m.id)
    close(true)
  }

  function onListKeyDown(e) {
    const last = merchants.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => (i >= last ? 0 : i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => (i <= 0 ? last : i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(last)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        commit(activeIndex)
        break
      case 'Escape':
        e.preventDefault()
        close(true)
        break
      case 'Tab':
        /* Tabbing away commits nothing and closes, matching a native select.
           No preventDefault: the focus move itself should still happen. */
        close(false)
        break
      default:
        break
    }
  }

  function onButtonKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openList()
    }
  }

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
      <span className="rail-group__label" id={`${baseId}-label`}>
        Working on
      </span>
      <button
        ref={buttonRef}
        type="button"
        className="picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-list` : undefined}
        aria-labelledby={`${baseId}-label ${baseId}-value`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onButtonKeyDown}
      >
        <IconStore />
        <span className="picker__name" id={`${baseId}-value`}>
          {merchant?.name || 'Select a store'}
        </span>
        {typeof score === 'number' && (
          <span className="picker__score num" title="Frontage score">
            {formatScore(score)}
          </span>
        )}
        <IconChevron style={{ transform: open ? 'rotate(90deg)' : 'none', flex: 'none' }} />
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${baseId}-list`}
          className="picker__menu"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${baseId}-label`}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          onKeyDown={onListKeyDown}
        >
          {merchants.map((m, i) => (
            /* A div, not a button. role="option" on a <button> makes assistive
               tech announce a control inside a list of choices, and the options
               must be direct children of the listbox for the roles to hold. */
            <div
              key={m.id}
              id={optionId(i)}
              role="option"
              aria-selected={String(m.id) === String(merchantId)}
              data-active={i === activeIndex ? 'true' : undefined}
              className="picker__option"
              onClick={() => commit(i)}
              onPointerEnter={() => setActiveIndex(i)}
            >
              <span className="grow truncate">{m.name}</span>
              <span className="pill pill--plain pill--neutral">
                {m.catalog_source === 'seed' ? 'demo' : m.catalog_source}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
