import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small tab on the bottom-right edge that explains the human check.
 *
 * Collapsed, only a round check mark peeks in from the edge. Pointing at it,
 * focusing it, or tapping it on a touch screen slides it open; moving away
 * slides it shut again, after a short pause so it never flickers. It says only
 * what is true: this captcha is drawn by Campus Netra's own server.
 *
 * Sizing and placement are all relative, so it fits every screen:
 *  - the open width is capped at the viewport width minus a margin;
 *  - the offset from the bottom grows a little with the screen height and also
 *    clears a phone's home-bar (safe-area inset);
 *  - it sits at the right edge, a place the sign-in pages leave empty (the
 *    assistant and scan buttons only exist once you are signed in).
 *
 * Rendered into <body> so no animated ancestor can break `position: fixed`.
 */
// Visible strip when collapsed: smaller on phones so it covers as little of the form as possible.
const TAB = 'clamp(38px, 10vw, 46px)'
const CLOSE_DELAY = 220 // ms to wait before sliding shut

export function CaptchaBadge() {
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (typeof document === 'undefined') return null

  const show = () => { clearTimeout(timer.current); setOpen(true) }
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY) }

  return createPortal(
    <div
      className="fixed right-0 z-40 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(12px, 3.2vh, 32px))' }}
    >
      <button
        type="button"
        onClick={() => (open ? hide() : show())}
        onMouseEnter={show} onMouseLeave={hide}
        onFocus={show} onBlur={hide}
        aria-expanded={open} aria-label="About the human check"
        style={{
          width: 'min(250px, calc(100vw - 16px))',
          // Slide by the part that is hidden: the badge's own width minus the visible tab.
          transform: open ? 'translateX(0)' : `translateX(calc(100% - ${TAB}))`,
          transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 300ms ease',
        }}
        className="pointer-events-auto flex items-center gap-3 overflow-hidden rounded-l-xl border
                   border-r-0 border-border bg-surface py-1.5 pl-1.5 pr-3 text-left sm:pl-2 shadow-level2
                   hover:shadow-level3 motion-reduce:!transition-none"
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2
                     border-secondary text-secondary"
          aria-hidden="true"
        >
          <Check size={16} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-4 text-ink">
            Made by Campus Netra
          </span>
          <span className="block text-[11px] leading-4 text-ink-muted">
            No Google or any other company
          </span>
        </span>
      </button>
    </div>,
    document.body,
  )
}
