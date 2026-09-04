import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { IconArrowRight, IconGauge, IconSparkle } from '../components/Icons'
import { ThemeProvider } from '../context/ThemeContext'
import { useMerchants } from '../context/MerchantContext'

/* Beat zero of the demo. A street where almost every shopfront is dark: that is
   what the agent-readable web looks like today. Two doors from here — the
   merchant fixing their own frontage, and the agent out shopping it. */

const STREET = [false, false, true, false, false, false, false, true, false, false, false, false, false, false]

export default function ZoneChooser() {
  const { merchants, loading } = useMerchants()

  return (
    <ThemeProvider zone="console" defaultTheme="dark">
      <div className="gate">
          <div className="gate__inner stack" style={{ '--stack-gap': '1.75rem' }}>
            <div className="stack" style={{ '--stack-gap': '1rem' }}>
              <span className="brandmark">
                <BrandMark size={24} />
                <span>
                  <span className="brandmark__word">Frontage</span>
                  <span className="brandmark__sub">Razorpay AI Buildathon · Track 01</span>
                </span>
              </span>

              <h1 className="gate__thesis">
                Most shops are <em>dark</em> to an AI buyer.
              </h1>

              <p className="page-head__lede" style={{ marginBlockStart: 0 }}>
                An AI shopping agent can't read a storefront built for human eyes. Frontage scores
                what a merchant's catalog is missing, fixes it, and publishes a catalog agents can
                actually fetch — then lets one shop it, under a spending limit the merchant sets.
              </p>
            </div>

            <div className="gate__street" aria-hidden="true">
              {STREET.map((lit, i) => (
                <span key={i} className="gate__unit" data-lit={String(lit)} />
              ))}
            </div>

            <div className="gate__doors">
              <Link to="/merchant" className="gate__door">
                <span className="gate__door-title">
                  <IconGauge />I run a shop
                </span>
                <span className="gate__door-body">
                  See how much of your catalog an agent can read today, fix the gaps, and publish.
                </span>
                <span className="gate__door-go">
                  Open the console
                  <IconArrowRight />
                </span>
              </Link>

              <Link to="/shop" className="gate__door">
                <span className="gate__door-title">
                  <IconSparkle />
                  I'm shopping
                </span>
                <span className="gate__door-body">
                  Otto is a stand-in for ChatGPT or Gemini. Give it a goal and watch it buy from a
                  Frontage-enabled catalog.
                </span>
                <span className="gate__door-go">
                  Open Otto
                  <IconArrowRight />
                </span>
              </Link>
            </div>

            <p className="eyebrow">
              {loading
                ? 'Loading catalogs…'
                : `${merchants.length} ${merchants.length === 1 ? 'store' : 'stores'} connected · Razorpay test mode`}
          </p>
        </div>
      </div>
    </ThemeProvider>
  )
}
