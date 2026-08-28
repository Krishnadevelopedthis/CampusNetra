import clsx from 'clsx'

/**
 * Campus Netra mark.
 *
 * PLACEHOLDER — swap the <svg> below for the supplied logo artwork.
 * Drop the file at `public/logo.svg` and replace the inline SVG with:
 *     <img src="/logo.svg" alt="Campus Netra" className="w-full h-full object-contain" />
 * Everything else (sizing, the wordmark, the tagline) stays as-is.
 */
export function LogoMark({ size = 40, className }) {
  return (
    <div
      className={clsx(
        'shrink-0 rounded-lg bg-primary grid place-items-center overflow-hidden',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size * 0.6} height={size * 0.6} fill="none">
        {/* Stylised eye — "netra" — over a building silhouette. */}
        <path d="M4 22c5-7 11-10 16-10s11 3 16 10c-5 7-11 10-16 10S9 29 4 22Z"
              stroke="white" strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="20" cy="22" r="4.5" fill="white" />
        <path d="M12 12V6h16v6" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function Logo({ subtitle = 'Campus Facilities', size = 40, className }) {
  return (
    <div className={clsx('flex items-center gap-3 min-w-0', className)}>
      <LogoMark size={size} />
      <div className="min-w-0">
        <p className="text-headline-md text-primary leading-tight truncate">Campus Netra</p>
        {subtitle && <p className="text-body-sm text-ink-faint truncate">{subtitle}</p>}
      </div>
    </div>
  )
}
