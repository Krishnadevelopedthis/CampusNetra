import clsx from 'clsx'
import { LayoutGrid } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { navLeaves } from './nav'
import { Sidebar } from './Sidebar'

/**
 * Phone and tablet navigation: the four destinations a role uses most as a
 * bottom tab bar, and "More" for everything else (the full sidebar, opened as
 * a bottom sheet). Desktop keeps the sidebar; this is hidden from lg up.
 *
 * Tabs are picked from the role's own navigation, so a module that Admin ->
 * Roles has taken away never appears here either.
 */
const PRIMARY = {
  student: ['/dashboard', '/issues/new', '/issues', '/lost-found'],
  teacher: ['/dashboard', '/issues/new', '/issues', '/lost-found'],
  technician: ['/dashboard', '/work-orders', '/inspections', '/assets'],
  facility_manager: ['/dashboard', '/issues', '/work-orders', '/analytics'],
  admin: ['/dashboard', '/issues', '/work-orders', '/admin/health'],
  super_admin: ['/dashboard', '/issues', '/work-orders', '/admin/health'],
}

// Short labels: a tab has room for about one word.
const SHORT = {
  '/dashboard': 'Home',
  '/issues/new': 'Report',
  '/work-orders': 'Work',
  '/inspections': 'Inspect',
  '/lost-found': 'Lost/Found',
  '/admin/health': 'Health',
  '/analytics': 'Analytics',
  '/assets': 'Assets',
}

export function primaryTabs(items, role) {
  const leaves = navLeaves(items)
  const byPath = new Map(leaves.map((l) => [l.to, l]))
  const wanted = (PRIMARY[role] || []).map((to) => byPath.get(to)).filter(Boolean)
  const tabs = wanted.length >= 2 ? wanted : leaves
  // Reporters call /issues "Track Complaints"; staff call it "Issues".
  const reporter = role === 'student' || role === 'teacher'
  return tabs.slice(0, 4).map((t) => ({
    ...t,
    short: t.to === '/issues' ? (reporter ? 'Complaints' : 'Issues') : (SHORT[t.to] || t.label),
  }))
}

function Tab({ to, icon: Icon, label, active, emphasis }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1',
        'text-[11px] font-medium leading-none transition-colors active:scale-95 motion-reduce:transform-none',
        active ? 'text-secondary' : 'text-ink-muted hover:text-ink',
      )}
    >
      {active && !emphasis && (
        <span className="absolute -top-1.5 h-[3px] w-6 rounded-full bg-secondary" aria-hidden="true" />
      )}
      <span
        className={clsx(
          'grid place-items-center rounded-full transition-colors',
          // Same box for every tab so the labels line up; Report fills it.
          'h-8 w-8',
          emphasis && 'bg-secondary text-on-secondary shadow-level2',
        )}
      >
        <Icon size={emphasis ? 18 : 20} strokeWidth={active || emphasis ? 2.25 : 1.9} aria-hidden="true" />
      </span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </NavLink>
  )
}

export function MobileTabBar({ items, role, activePath, pathname, moreOpen, onMoreOpen, onMoreClose }) {
  const tabs = primaryTabs(items, role)
  const tabPaths = new Set(tabs.map((t) => t.to))
  const moreActive = !!activePath && !tabPaths.has(activePath)

  // The sheet locks the page behind it while open.
  useEffect(() => {
    if (!moreOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onMoreClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [moreOpen, onMoreClose])

  return (
    <>
      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex h-16 max-w-xl items-stretch gap-1 px-2 pt-1.5">
          {tabs.map((t) => (
            <Tab
              key={t.to} to={t.to} icon={t.icon} label={t.short}
              active={activePath === t.to} emphasis={t.to === '/issues/new'}
            />
          ))}
          <button
            type="button"
            onClick={onMoreOpen}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={clsx(
              'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1',
              'text-[11px] font-medium leading-none transition-colors active:scale-95 motion-reduce:transform-none',
              moreActive || moreOpen ? 'text-secondary' : 'text-ink-muted hover:text-ink',
            )}
          >
            {moreActive && !moreOpen && (
              <span className="absolute -top-1.5 h-[3px] w-6 rounded-full bg-secondary" aria-hidden="true" />
            )}
            <span className="grid h-8 w-8 place-items-center"><LayoutGrid size={20} aria-hidden="true" /></span>
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <div className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm animate-fade-in" onClick={onMoreClose} />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl
                       border-t border-border-subtle bg-surface shadow-level3 animate-slide-up"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex justify-center pt-2" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-border-strong" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <Sidebar
                items={items} activePath={activePath} pathname={pathname} role={role}
                mobile onClose={onMoreClose}
              />
            </div>
            <div className="flex items-center justify-center gap-5 border-t border-border-subtle px-4 py-3 text-body-sm text-ink-faint">
              <Link to="/privacy" onClick={onMoreClose} className="hover:text-ink">Privacy</Link>
              <Link to="/terms" onClick={onMoreClose} className="hover:text-ink">Terms</Link>
              <span>© {new Date().getFullYear()} Campus Netra</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
