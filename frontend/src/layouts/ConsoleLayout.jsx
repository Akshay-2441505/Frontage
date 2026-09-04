import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api } from '../api'
import BrandMark from '../components/BrandMark'
import {
  IconArrowRight,
  IconGauge,
  IconPlug,
  IconSearch,
  IconShield,
  IconSliders,
  IconWrench,
} from '../components/Icons'
import MerchantPicker from '../components/MerchantPicker'
import ThemeToggle from '../components/ThemeToggle'
import { useMerchants } from '../context/MerchantContext'
import { ThemeProvider } from '../context/ThemeContext'
import { EASE, useMotionOK } from '../lib/motion'

/* The console owns the latest diagnostic report for the selected merchant.
   Three places need it — the rail shows the score beside the store name,
   Diagnose draws it, and Fix reports the movement after a publish — so it is
   fetched once here and shared, keeping all three honest to the same run. */

const ConsoleContext = createContext(null)

export function useConsole() {
  const ctx = useContext(ConsoleContext)
  if (!ctx) throw new Error('useConsole must be used inside the console layout')
  return ctx
}

function Rail() {
  const { error } = useMerchants()
  const { report } = useConsole()

  return (
    <aside className="console__rail">
      <Link to="/" className="brandmark">
        <BrandMark />
        <span>
          <span className="brandmark__word">Frontage</span>
          <span className="brandmark__sub">Merchant console</span>
        </span>
      </Link>

      <MerchantPicker score={report ? report.score : undefined} />

      <nav className="rail-group">
        <span className="rail-group__label">The loop</span>
        <NavLink to="/merchant" end className="rail-link">
          <span className="rail-link__step">1</span>
          <IconGauge />
          Diagnose
        </NavLink>
        <NavLink to="/merchant/fix" className="rail-link">
          <span className="rail-link__step">2</span>
          <IconWrench />
          Fix
        </NavLink>
        <NavLink to="/merchant/trail" className="rail-link">
          <span className="rail-link__step">3</span>
          <IconShield />
          Agent trail
        </NavLink>
        <NavLink to="/merchant/preview" className="rail-link">
          <IconSearch />
          Preview as Otto
        </NavLink>
      </nav>

      <nav className="rail-group">
        <span className="rail-group__label">Setup</span>
        <NavLink to="/merchant/settings" className="rail-link">
          <IconSliders />
          Spending limit
        </NavLink>
        <NavLink to="/merchant/connect" className="rail-link">
          <IconPlug />
          Connect a store
        </NavLink>
      </nav>

      <div className="rail-foot stack" style={{ '--stack-gap': '0.75rem' }}>
        {error && (
          <div className="notice notice--bad">
            <div className="notice__body">
              <div className="notice__title">Backend unreachable</div>
              Start it with <span className="mono">uvicorn app.main:app --port 8000</span>, then
              reload this page.
            </div>
          </div>
        )}
        <Link to="/shop" className="btn btn--ghost btn--block">
          Open Otto
          <IconArrowRight />
        </Link>
        <div className="spread">
          <span className="eyebrow rail-foot__note">Razorpay test mode</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}

export default function ConsoleLayout() {
  const { merchantId } = useMerchants()
  const motionOK = useMotionOK()
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const reloadReport = useCallback(async (id) => {
    if (!id) {
      setReport(null)
      setHistory([])
      return
    }
    const [latest, hist] = await Promise.all([
      api.getLatestDiagnosis(id).catch(() => null),
      api.getDiagnosisHistory(id).catch(() => []),
    ])
    setReport(latest)
    setHistory(Array.isArray(hist) ? hist : [])
  }, [])

  useEffect(() => {
    reloadReport(merchantId)
  }, [merchantId, reloadReport])

  const runDiagnose = useCallback(async () => {
    if (!merchantId) return null
    setRunning(true)
    setError(null)
    try {
      const fresh = await api.runDiagnose(merchantId)
      setReport(fresh)
      const hist = await api.getDiagnosisHistory(merchantId).catch(() => [])
      setHistory(Array.isArray(hist) ? hist : [])
      return fresh
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setRunning(false)
    }
  }, [merchantId])

  const value = useMemo(
    () => ({ report, history, running, error, runDiagnose, reloadReport }),
    [report, history, running, error, runDiagnose, reloadReport],
  )

  return (
    <ThemeProvider zone="console" defaultTheme="dark">
      <ConsoleContext.Provider value={value}>
        <motion.div
          className="console"
          initial={motionOK ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.34, ease: EASE.out }}
        >
          <Rail />
          <main className="console__main">
            <div className="console__inner">
              <Outlet />
            </div>
          </main>
        </motion.div>
      </ConsoleContext.Provider>
    </ThemeProvider>
  )
}
