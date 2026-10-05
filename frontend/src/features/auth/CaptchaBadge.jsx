import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small tab fixed to the left edge that explains the human check.
 *
 * Collapsed it shows only the shield; hovering it (or focusing it, or tapping it
 * on a touch screen) slides it open, and it slides back when the pointer leaves.
 * It says only what is true: the captcha is drawn by Campus Netra's own server,
 * so nothing is sent to a third-party service.
 *
 * Rendered into <body> so no animated ancestor can break `position: fixed`.
 */
const TAB = 46      // px of the badge that stays visible when collapsed
const WIDTH = 288   // px when open

export function CaptchaBadge() {
  const [open, setOpen] = useState(false)
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed left-0 bottom-24 z-40"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-label="About the human check"
        style={{ width: WIDTH, transform: `translateX(${open ? 0 : TAB - WIDTH}px)` }}
        className="flex items-center overflow-hidden rounded-r-xl border border-l-0 border-border
                   bg-surface text-left shadow-level2 transition-transform duration-300
                   ease-out motion-reduce:transition-none"
      >
        <span className="flex-1 min-w-0 py-2.5 pl-4 pr-2">
          <span className="block text-body-sm font-semibold text-ink">Human check</span>
          <span className="block text-body-xs text-ink-muted leading-snug">
            Image captcha made by Campus Netra itself. Nothing is sent to a third-party service.
          </span>
        </span>
        <span className="grid place-items-center shrink-0 self-stretch bg-secondary text-on-secondary"
              style={{ width: TAB }}>
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
      </button>
    </div>,
    document.body,
  )
}
