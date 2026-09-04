import { Route, Routes } from 'react-router-dom'
import { MerchantProvider } from './context/MerchantContext'
import ConsoleLayout from './layouts/ConsoleLayout'
import OttoLayout from './layouts/OttoLayout'
import ZoneChooser from './pages/ZoneChooser'
import NotFound from './pages/NotFound'
import Diagnose from './pages/console/Diagnose'
import Overview from './pages/console/Overview'
import Fix from './pages/console/Fix'
import Trail from './pages/console/Trail'
import Preview from './pages/console/Preview'
import Settings from './pages/console/Settings'
import Connect from './pages/console/Connect'
import OttoChat from './pages/shop/OttoChat'

export default function App() {
  return (
    <MerchantProvider>
      <Routes>
        <Route path="/" element={<ZoneChooser />} />

        <Route path="/merchant" element={<ConsoleLayout />}>
          <Route index element={<Overview />} />
          <Route path="diagnose" element={<Diagnose />} />
          <Route path="fix" element={<Fix />} />
          <Route path="trail" element={<Trail />} />
          <Route path="preview" element={<Preview />} />
          <Route path="settings" element={<Settings />} />
          <Route path="connect" element={<Connect />} />
        </Route>

        <Route path="/shop" element={<OttoLayout />}>
          <Route index element={<OttoChat />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </MerchantProvider>
  )
}
