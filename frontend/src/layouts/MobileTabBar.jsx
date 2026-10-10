import clsx from 'clsx'
import { LayoutGrid } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { navLeaves } from './nav'
import { Sidebar } from './Sidebar'

/**
 * Phone and tablet navigation: a floating tab bar with the role's three most
 * used destinations, the campus map raised in a circle at the centre, and
 * "More" for everything else (the rest of the menu, opened as a bottom sheet).
 * Desktop keeps the sidebar; this is hidden from lg up.
 *
 * Tabs are picked from the role's own navigation, so a module that Admin ->
 * Roles has taken away never appears here either.
 */
const LAYOUT = {
  // Everything a student or teacher uses fits on the bar itself, so there is no
  // More (History, Profile, Settings and Help are in the profile menu up top).
  student: { tabs: ['/dashboard', '/issues/new', '/issues', '/lost-found'], center: '/map', more: false },
  teacher: { tabs: ['/dashboard', '/issues/new', '/issues', '/lost-found'], center: '/map', more: false },
  // Technicians have no Campus Map; the Digital Twin is their map of the campus.
  technician: { tabs: ['/dashboard', '/work-orders', '/inspections'], center: '/twin' },
  facility_manager: { tabs: ['/dashboard', '/issues', '/work-orders'], center: '/map' },
  admin: { tabs: ['/dashboard', '/issues', '/work-orders'], center: '/map' },
  super_admin: { tabs: ['/dashboard', '/issues', '/work-orders'], center: '/map' },
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
  '/map': 'Map',
  '/twin': 'Twin',
}

/** { tabs, center } for a role: up to three side tabs and the raised centre one. */
export function barLayout(items, role) {
  const leaves = navLeaves(items)
  const byPath = new Map(leaves.map((l) => [l.to, l]))
  const plan = { more: true, ...(LAYOUT[role] || { tabs: [], center: null }) }
  const reporter = role === 'student' || role === 'teacher'
  const label = (t) => (t.to === '/issues' ? (reporter ? 'Complaints' : 'Issues') : (SHORT[t.to] || t.label))

  const center = plan.center ? byPath.get(plan.center) : null
  let tabs = plan.tabs.map((to) => byPath.get(to)).filter(Boolean)
  if (tabs.length < 2) tabs = leaves.filter((l) => l.to !== center?.to)   // a role with no plan
  // Five slots: the centre button, More (when there is one), and the rest.
  const slots = 5 - (center ? 1 : 0) - (plan.more ? 1 : 0)
  tabs = tabs.slice(0, slots).map((t) => ({ ...t, short: label(t) }))
  return { tabs, center: center ? { ...center, short: label(center) } : null, more: plan.more }
}

const tabClass = (active) => clsx(
  'group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl pb-1 pt-1.5',
  'text-[11px] font-medium leading-none outline-none transition-colors duration-200',
  'active:scale-95 motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-secondary/50',
  active ? 'text-secondary' : 'text-ink-muted hover:text-secondary',
)

/** The pill behind an icon: filled for the current page, tinted on hover or press. */
function IconPill({ icon: Icon, active }) {
  return (
    <span
      className={clsx(
        'grid h-8 w-12 place-items-center rounded-full transition-all duration-200 motion-reduce:transform-none',
        active
          ? 'bg-secondary/15'
          : 'group-hover:-translate-y-0.5 group-hover:bg-secondary/10 group-active:bg-secondary/15',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
    </span>
  )
}

function Tab({ to, icon, label, active }) {
  return (
    <NavLink to={to} data-tour={`nav:${to}`} aria-label={label} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
      <IconPill icon={icon} active={active} />
      <span className="max-w-full truncate px-0.5">{label}</span>
    </NavLink>
  )
}

function CenterTab({ to, icon: Icon, label, active }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="group relative flex min-w-0 flex-col items-center justify-end pb-1.5 text-[11px] font-semibold leading-none outline-none"
    >
      {/* Raised above the bar; the ring in the page colour cuts a notch into the bar's edge. */}
      <span
        data-tour={`nav:${to}`}
        className={clsx(
          'absolute -top-7 grid h-[3.75rem] w-[3.75rem] place-items-center rounded-full text-white',
          'bg-gradient-to-br from-secondary to-secondary-700 ring-[5px] ring-surface-base',
          'shadow-[0_10px_24px_-8px_rgb(var(--c-secondary)/0.7)] transition-all duration-200',
          'group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_28px_-8px_rgb(var(--c-secondary)/0.85)]',
          'group-active:scale-95 group-focus-visible:ring-secondary/40 motion-reduce:transform-none',
        )}
      >
        <Icon size={27} strokeWidth={2.2} aria-hidden="true" />
        {active && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-white" aria-hidden="true" />}
      </span>
      <span className={clsx('transition-colors', active ? 'text-secondary' : 'text-ink-muted group-hover:text-secondary')}>
        {label}
      </span>
    </NavLink>
  )
}

export function MobileTabBar({ items, role, activePath, pathname, moreOpen, onMoreOpen, onMoreClose }) {
  const { tabs, center, more } = barLayout(items, role)
  const shown = new Set([...tabs.map((t) => t.to), ...(center ? [center.to] : [])])
  const moreActive = !!activePath && !shown.has(activePath)
  // The sheet lists only what the tab bar does not already show.
  const sheetItems = items
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !shown.has(c.to)) } : i))
    .filter((i) => (i.children ? i.children.length > 0 : !shown.has(i.to)))

  // The sheet locks the page behind it while open.
  useEffect(() => {
    if (!moreOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onMoreClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [moreOpen, onMoreClose])

  // Two slots either side of the centre button; More, when there is one, is the last.
  const left = center ? tabs.slice(0, 2) : tabs
  const right = center ? tabs.slice(2) : []
  const tab = (t) => <Tab key={t.to} to={t.to} icon={t.icon} label={t.short} active={activePath === t.to} />

  return (
    <>
      <nav
        aria-label="Main"
        className="no-print fixed left-1/2 z-30 w-[min(30rem,calc(100%-1.25rem))] -translate-x-1/2 lg:hidden"
        style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          className="grid h-16 grid-cols-5 items-stretch rounded-[1.4rem] border border-border-subtle bg-surface/90
                     px-1.5 shadow-level3 backdrop-blur-xl backdrop-saturate-150"
        >
          {left.map(tab)}
          {center && <CenterTab to={center.to} icon={center.icon} label={center.short} active={activePath === center.to} />}
          {right.map(tab)}
          {more && (
            <button type="button" data-tour="nav:more" onClick={onMoreOpen} aria-haspopup="dialog" aria-expanded={moreOpen}
                    className={tabClass(moreActive || moreOpen)}>
              <IconPill icon={LayoutGrid} active={moreActive || moreOpen} />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>

      {more && moreOpen && (
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
                items={sheetItems} activePath={activePath} pathname={pathname} role={role}
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
