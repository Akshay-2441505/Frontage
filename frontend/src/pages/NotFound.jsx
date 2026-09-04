import { Link } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'

export default function NotFound() {
  return (
    <ThemeProvider zone="console" defaultTheme="dark">
      <div className="nf">
          <div className="stack" style={{ '--stack-gap': '1rem' }}>
            <p className="eyebrow">No such page</p>
            <h1 className="page-head__title">This address isn't part of Frontage.</h1>
            <div className="cluster" style={{ justifyContent: 'center' }}>
              <Link to="/merchant" className="btn btn--primary">
                Merchant console
              </Link>
              <Link to="/shop" className="btn btn--ghost">
                Otto
              </Link>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
