import clsx from 'clsx'

/**
 * Full-page loading animation: a rotating ring of ticks (from the Uiverse.io
 * "Nawsome" loader — see styles/index.css for the .pl__* rules) with the
 * centre reworked into an eye instead of the original's two hand ticks.
 * "Netra" is Sanskrit/Hindi for "eye", so this is the one animation that gets
 * to be a little literal about the name.
 *
 * For small inline loading states (a card, a list, a button) use `Spinner`
 * instead — this is sized for a full viewport and would look oversized
 * anywhere smaller.
 */
export function BrandLoader({ label = 'Loading…', size = 150, className }) {
  const outer = 68
  const inner = 56
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 // 0, 45, 90… degrees, in radians
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    const x1 = 80 + outer * sin
    const y1 = 80 - outer * cos
    const x2 = 80 + inner * sin
    const y2 = 80 - inner * cos
    return `${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`
  })

  return (
    <div
      className={clsx('flex flex-col items-center justify-center gap-3', className)}
      role="status" aria-live="polite"
    >
      <svg
        className="pl" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg"
        style={{ width: size, height: size }} aria-hidden="true"
      >
        <defs>
          <linearGradient id="pl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--c-primary-600))' }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--c-secondary-500))' }} />
          </linearGradient>
        </defs>

        {/* Static track */}
        <circle
          cx="80" cy="80" r="72" fill="none"
          stroke="rgb(var(--c-border))" strokeWidth="4"
        />

        {/* Spinning progress arc */}
        <g className="pl__ring-rotate">
          <circle
            className="pl__ring-stroke" cx="80" cy="80" r="72" fill="none"
            stroke="url(#pl-grad)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray="452"
          />
        </g>

        {/* Eight clock-face ticks, lighting up in sequence */}
        <g stroke="rgb(var(--c-ink-faint))" strokeWidth="3" strokeLinecap="round" fill="none">
          {ticks.map((points, i) => (
            <polyline key={i} className="pl__tick" pathLength="12" strokeDasharray="12" points={points} />
          ))}
        </g>

        {/* Centre: an eye styled after the actual Campus Netra logo mark
            (almond outline + pupil, with the logo's little roofline above
            it) rather than a generic eye — "netra" is Sanskrit/Hindi for
            "eye", so this is the one glyph that gets to be literal. */}
        <g transform="translate(80,80)">
          {/* The logo's roofline sits above the eye and doesn't blink with
              it, the way an eyebrow doesn't close with the eye beneath it. */}
          <path d="M-13,-16 V-26 H13 V-16" fill="none" stroke="url(#pl-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <g className="pl__eye-lid">
            <path
              d="M-26,0 C-18,-11 -9,-16 0,-16 S18,-11 26,0 C18,11 9,16 0,16 S-18,11 -26,0 Z"
              fill="none" stroke="url(#pl-grad)" strokeWidth="3"
            />
            <circle r="7.5" fill="url(#pl-grad)" />
            <circle r="2.4" cx="-2.5" cy="-2.5" fill="white" />
          </g>
        </g>
      </svg>

      {label && <span className="text-body-md text-ink-faint">{label}</span>}
    </div>
  )
}
