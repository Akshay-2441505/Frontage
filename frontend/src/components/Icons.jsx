/* Inline 16px stroke icons. No icon library — these are the only glyphs the
   product actually needs, and hand-rolling them keeps both zones free to style
   them with currentColor. */

function Svg({ children, size = 16, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3.1" />
    <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1" />
  </Svg>
)

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M13.5 9.4A5.8 5.8 0 0 1 6.6 2.5a5.8 5.8 0 1 0 6.9 6.9Z" />
  </Svg>
)

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M3 8.5 6.3 12 13 4.5" />
  </Svg>
)

export const IconX = (p) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
)

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M2.5 8h11M9.5 4l4 4-4 4" />
  </Svg>
)

export const IconArrowUp = (p) => (
  <Svg {...p}>
    <path d="M8 13.5v-11M4 6.5l4-4 4 4" />
  </Svg>
)

export const IconChevron = (p) => (
  <Svg {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
)

export const IconCopy = (p) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 5.5v-1a1.6 1.6 0 0 0-1.6-1.6H4.1A1.6 1.6 0 0 0 2.5 4.5v4.8a1.6 1.6 0 0 0 1.6 1.6h1" />
  </Svg>
)

export const IconStore = (p) => (
  <Svg {...p}>
    <path d="M2.4 6.2 3.5 2.7h9l1.1 3.5a2.1 2.1 0 0 1-4 1.2 2.1 2.1 0 0 1-4 0 2.1 2.1 0 0 1-3.2-1.2Z" />
    <path d="M3.2 8.2v5.1h9.6V8.2" />
  </Svg>
)

export const IconGauge = (p) => (
  <Svg {...p}>
    <path d="M2.2 12a6.2 6.2 0 1 1 11.6 0" />
    <path d="M8 12 11 6.6" />
  </Svg>
)

/* Panels on a page: what an overview is. */
export const IconLayout = (p) => (
  <Svg {...p}>
    <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1.6" />
    <path d="M2.2 6.4h11.6" />
    <path d="M6.6 6.4v7" />
  </Svg>
)

export const IconWrench = (p) => (
  <Svg {...p}>
    <path d="M10.4 2.4a3.6 3.6 0 0 0-3.2 5.2l-4.6 4.6a1.3 1.3 0 0 0 1.9 1.9l4.6-4.6a3.6 3.6 0 0 0 4.5-4.7l-2 2-1.9-.5-.5-1.9 2-2a3.6 3.6 0 0 0-.8-.1Z" />
  </Svg>
)

export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M8 1.8 13.2 3.6v4.1c0 3.1-2.1 5.6-5.2 6.5-3.1-.9-5.2-3.4-5.2-6.5V3.6Z" />
    <path d="M5.8 8 7.4 9.6l3-3.2" />
  </Svg>
)

export const IconSliders = (p) => (
  <Svg {...p}>
    <path d="M2.5 5h11M2.5 11h11" />
    <circle cx="6" cy="5" r="1.6" />
    <circle cx="10.5" cy="11" r="1.6" />
  </Svg>
)

export const IconPlug = (p) => (
  <Svg {...p}>
    <path d="M6 2.2v3.4M10 2.2v3.4M4.2 5.6h7.6v2.6a3.8 3.8 0 0 1-7.6 0Z" />
    <path d="M8 12v2" />
  </Svg>
)

export const IconSend = (p) => (
  <Svg {...p}>
    <path d="M8 13V3M4.2 6.8 8 3l3.8 3.8" />
  </Svg>
)

export const IconBag = (p) => (
  <Svg {...p}>
    <path d="M3.4 5.4h9.2l-.7 7.6a1.3 1.3 0 0 1-1.3 1.2H5.4a1.3 1.3 0 0 1-1.3-1.2Z" />
    <path d="M5.9 7V4.6a2.1 2.1 0 0 1 4.2 0V7" />
  </Svg>
)

export const IconSparkle = (p) => (
  <Svg {...p}>
    <path d="M8 2.2 9.3 6l3.8 1.3L9.3 8.6 8 12.4 6.7 8.6 2.9 7.3 6.7 6Z" />
  </Svg>
)

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.6V8l2.3 1.6" />
  </Svg>
)

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="7.2" cy="7.2" r="4.4" />
    <path d="M10.5 10.5 13.6 13.6" />
  </Svg>
)

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
)

export const IconHistory = (p) => (
  <Svg {...p}>
    <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
    <path d="M2.3 2.6v2.8h2.8" />
    <path d="M8 5.2V8l2 1.4" />
  </Svg>
)

export const IconMapPin = (p) => (
  <Svg {...p}>
    <path d="M8 15S3 10.2 3 6.5a5 5 0 0 1 10 0C13 10.2 8 15 8 15Z" />
    <circle cx="8" cy="6.5" r="1.6" />
  </Svg>
)

export const IconMic = (p) => (
  <Svg {...p}>
    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
    <path d="M4 7.5a4 4 0 0 0 8 0" />
    <path d="M8 11.5v2.5M6 14h4" />
  </Svg>
)
