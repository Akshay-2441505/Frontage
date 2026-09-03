import { motion } from 'motion/react'
import { Link, Outlet } from 'react-router-dom'
import { IconBag, IconHistory, IconSearch, IconSparkle, IconStore } from '../components/Icons'
import ThemeToggle from '../components/ThemeToggle'
import { useMerchants } from '../context/MerchantContext'
import { ThemeProvider } from '../context/ThemeContext'
import { EASE, useMotionOK } from '../lib/motion'

/* Otto is the third-party shopping agent standing in for ChatGPT or Gemini
   (PROJECT_SPEC §4, §8). It is deliberately not Frontage: different ground,
   different type, different shape language. The only thing tying the two zones
   together is the small "via Frontage" line back to the console. */

export const AGENT_NAME = 'Otto'

function Rail() {
  return (
    <nav className="otto__rail" aria-label="Otto">
      <span className="orb orb--sm" aria-hidden="true" />
      <button type="button" className="otto__icon" title="Search">
        <IconSearch />
      </button>
      <button type="button" className="otto__icon" title="Saved">
        <IconBag />
      </button>
      <button type="button" className="otto__icon" title="History">
        <IconHistory />
      </button>
      <span className="otto__rail-spacer" />
      <Link to="/" className="otto__icon" title="Back to Frontage">
        <IconStore />
      </Link>
    </nav>
  )
}

export default function OttoLayout() {
  const { error } = useMerchants()
  const motionOK = useMotionOK()

  return (
    <ThemeProvider zone="shop" defaultTheme="light">
      <motion.div
        className="otto"
        initial={motionOK ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.34, ease: EASE.out }}
      >
          <Rail />

          <div className="otto__main">
            <header className="otto__top">
              <span className="otto-mark">
                <IconSparkle />
                {AGENT_NAME}
                <span className="otto-mark__tag">shopping agent</span>
              </span>

              <div className="cluster otto__tools">
                <ThemeToggle />
              </div>
            </header>

            {error && (
              <div className="otto__body">
                <div className="notice notice--bad">
                  <div className="notice__body">
                    <div className="notice__title">Can't reach any catalogs</div>
                    The Frontage backend isn't responding. Start it with{' '}
                    <span className="mono">uvicorn app.main:app --port 8000</span> and reload.
                  </div>
                </div>
              </div>
            )}

          <Outlet />
        </div>
      </motion.div>
    </ThemeProvider>
  )
}
