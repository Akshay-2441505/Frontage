import { useTheme } from '../context/ThemeContext'
import { IconMoon, IconSun } from './Icons'

export default function ThemeToggle({ className = 'btn btn--quiet' }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button type="button" className={className} onClick={toggle} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
      <span className="sr-only">Switch to {next} mode</span>
    </button>
  )
}
