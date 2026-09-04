/* The Frontage mark: a shopfront elevation in miniature — four bays, two lit.
   Same idea as the score drawing, small enough to sit in a rail. */
export default function BrandMark({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="brandmark__glyph"
    >
      <rect x="1" y="6" width="22" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="9.5" width="3.6" height="8.5" rx="0.5" fill="var(--accent)" />
      <rect x="9" y="9.5" width="3.6" height="8.5" rx="0.5" fill="var(--accent)" opacity="0.45" />
      <rect x="14" y="9.5" width="3.6" height="8.5" rx="0.5" fill="currentColor" opacity="0.2" />
      <path d="M2 6 12 1.6 22 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
