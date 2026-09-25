import clsx from 'clsx'

const DOT_COLORS = ['#f4602a', '#f5a623', '#f7d038']

/**
 * Full-page loading indicator: three bouncing dots in the brand's
 * orange-to-yellow gradient. Renders with plain divs + background-color
 * (not SVG stroke) — a previous SVG-ring version rendered its colored
 * strokes as fully invisible on at least one real device while an
 * identical black stroke rendered fine, root cause never pinned down.
 * This sidesteps that rendering path entirely.
 */
export function RingLoader({ label, size, className }) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center gap-4', className)}
      role="status" aria-live="polite"
    >
      <div
        className="flex items-end gap-2"
        style={size ? { '--loader-dot-size': typeof size === 'number' ? `${size / 4}px` : size } : undefined}
        aria-hidden="true"
      >
        {DOT_COLORS.map((color, i) => (
          <span
            key={color}
            className="loader-dot"
            style={{ backgroundColor: color, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      {label && <span className="text-body-md text-ink-faint">{label}</span>}
    </div>
  )
}
