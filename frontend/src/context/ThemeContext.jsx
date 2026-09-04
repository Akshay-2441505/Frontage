import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/* Theme is per zone, not global.

   The console defaults dark and the shop defaults light on purpose: the two
   zones are meant to read as different products at a glance, and that contrast
   is what the demo video records. A viewer can still override either one, and
   the override is remembered per zone. */

const ThemeContext = createContext(null)

const STORAGE_PREFIX = 'frontage.theme.'

function readStored(zone) {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + zone)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function ThemeProvider({ zone, defaultTheme, children }) {
  /* Each zone mounts its own provider and unmounts on the way out, so the
     initialiser is the only place this needs to read storage — re-syncing in an
     effect would just cost an extra render on every mount. */
  const [theme, setTheme] = useState(() => readStored(zone) || defaultTheme)

  const applyTheme = useCallback(
    (next) => {
      setTheme(next)
      try {
        localStorage.setItem(STORAGE_PREFIX + zone, next)
      } catch {
        // Private mode or blocked storage — the toggle still works for this visit.
      }
    },
    [zone],
  )

  const toggle = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, applyTheme])

  /* The zone class goes on <body>, not on a wrapper div, so the page ground is
     painted by the same tokens as the app. A wrapper div leaves the document
     background unset, which shows through as a black band the moment anything
     overscrolls or the content is shorter than the viewport. */
  useEffect(() => {
    const zoneClass = `zone-${zone}`
    document.body.classList.add(zoneClass)
    document.body.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme

    return () => {
      document.body.classList.remove(zoneClass)
      document.body.removeAttribute('data-theme')
      document.documentElement.style.colorScheme = ''
    }
  }, [zone, theme])

  const value = useMemo(() => ({ theme, setTheme: applyTheme, toggle, zone }), [theme, applyTheme, toggle, zone])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
