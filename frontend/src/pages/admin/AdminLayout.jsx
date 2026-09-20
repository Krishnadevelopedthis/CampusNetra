import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { ADMIN_NAV } from '@/layouts/nav'

// How far one click of the arrow moves the strip — enough to reveal a
// couple more tabs without jumping so far it's disorienting.
const SCROLL_STEP = 220

export default function AdminLayout() {
  const scrollerRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const location = useLocation()

  const updateScrollState = () => {
    const el = scrollerRef.current
    if (!el) return
    // 1px tolerance: some browsers report a fractional scrollWidth that
    // never quite reaches 0/max, which would otherwise leave one arrow
    // permanently (and wrongly) enabled.
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined

    updateScrollState()

    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    // The tab list itself never changes size after mount, but fonts/icons
    // loading asynchronously can still change its measured width slightly
    // after the first paint — one more check next frame catches that.
    const raf = requestAnimationFrame(updateScrollState)

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Switching tabs can scroll the active one into view (e.g. arriving via a
  // direct link to a tab further right) — re-check arrow visibility after.
  useEffect(() => {
    updateScrollState()
  }, [location.pathname])

  const scrollBy = (delta) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div className="space-y-5 min-w-0">
      <header>
        <h1 className="text-headline-lg text-ink">Administration</h1>
        <p className="text-body-md text-ink-muted mt-1">
          Users, access control, campus configuration and platform health.
        </p>
      </header>

      {/* Horizontal sub-nav; the module rail is already the primary sidebar.
          More tabs than fit on screen (this list runs past "SLA" on common
          laptop widths) previously had no visible way to reach beyond the
          fold — strip-scroll hides its own scrollbar by design, so without
          these arrows the only way to reach the last tab was an
          undiscoverable trackpad/shift-wheel swipe. */}
      <div className="relative border-b border-border-subtle no-print">
        {canScrollLeft && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-surface-base to-transparent pointer-events-none z-10" />
            <button
              onClick={() => scrollBy(-SCROLL_STEP)}
              aria-label="Scroll tabs left"
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-surface border border-border-subtle shadow-level2 grid place-items-center hover:bg-surface-sunken"
            >
              <ChevronLeft size={14} />
            </button>
          </>
        )}

        <div ref={scrollerRef} className="strip-scroll">
          <div className="flex gap-1 min-w-max">
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.to} to={item.to} end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 h-10 px-3 text-body-md font-medium whitespace-nowrap',
                    'border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-ink-muted hover:text-ink',
                  )
                }
              >
                <item.icon size={16} /> {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {canScrollRight && (
          <>
            <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-surface-base to-transparent pointer-events-none z-10" />
            <button
              onClick={() => scrollBy(SCROLL_STEP)}
              aria-label="Scroll tabs right"
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-surface border border-border-subtle shadow-level2 grid place-items-center hover:bg-surface-sunken"
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>

      <Outlet />
    </div>
  )
}
