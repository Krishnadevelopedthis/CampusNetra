import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Bell, ChevronDown, HelpCircle, LogOut, Menu, Search, Settings, User as UserIcon, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, toast } from '@/components/ui'
import { AssistantWidget } from '@/features/assistant/AssistantWidget'
import { QrScanButton } from '@/features/assistant/QrScanButton'
import { api, connectNotifications } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { ago } from '@/lib/format'
import { searchProfileIndex } from '@/lib/profileSearchIndex'
import { navFor, navLeaves } from './nav'
import { Sidebar } from './Sidebar'

function useOutsideClick(ref, handler) {
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, handler])
}

function HeaderSearch({ mobileOpen, onMobileClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isProfileContext = location.pathname.startsWith('/profile') || location.pathname.startsWith('/settings')
  const [value, setValue] = useState('')
  const ref = useRef(null)
  // Closing (not just clearing) on an outside tap/click is what makes this
  // behave like the dropdown panel it now looks like on mobile -- leaving it
  // open with just the text cleared was the old behaviour, and looked like
  // the panel had frozen open.
  useOutsideClick(ref, () => { setValue(''); onMobileClose?.() })

  const matches = isProfileContext ? searchProfileIndex(value) : []

  const goToMatch = (route) => {
    navigate(route)
    setValue('')
    onMobileClose?.()
  }

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || !e.currentTarget.value.trim()) return
    if (isProfileContext) {
      if (matches[0]) goToMatch(matches[0].route)
    } else {
      window.location.assign(`/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`)
    }
  }

  return (
    // On mobile this used to render as a small fixed box pinned 12px from
    // the very top of the viewport -- inside the header's own 64px (h-16)
    // height, so it visually collided with the menu button and the search
    // toggle that opened it. Anchoring it to top-16 instead drops it in as
    // a full-width panel directly under the header, the way a mobile
    // search overlay is expected to behave.
    <div
      ref={ref}
      className={clsx(
        mobileOpen
          ? 'fixed inset-x-3 top-[5.25rem] z-40 rounded-2xl bg-surface border border-border-subtle shadow-level3 p-3 sm:static sm:inset-auto sm:top-auto sm:z-auto sm:bg-transparent sm:border-0 sm:shadow-none sm:p-0 sm:flex-1 sm:max-w-md'
          : 'hidden sm:block sm:flex-1 sm:max-w-md',
      )}
    >
      <div className="relative">
        <Search
          size={15} strokeWidth={2.25}
          className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
        />
        <input
          autoFocus={mobileOpen}
          className="input !min-h-0 h-11 rounded-xl pl-9 pr-9 text-body-sm"
          placeholder={isProfileContext ? 'Search profile & settings…' : 'Search issues, complaints, lost & found…'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {mobileOpen && (
          <button
            type="button"
            onClick={() => { setValue(''); onMobileClose?.() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost h-7 w-7 p-0 rounded-md sm:hidden"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        )}
        {isProfileContext && value && (
          <div className="absolute left-0 right-0 mt-1.5 bg-surface rounded-xl shadow-popover border border-border-subtle z-50 overflow-hidden animate-slide-up">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-body-sm text-ink-faint">No matching settings.</p>
          ) : (
            matches.map((m) => (
              <button
                key={m.route}
                type="button"
                onClick={() => goToMatch(m.route)}
                className="w-full text-left px-4 py-2.5 text-body-md text-ink hover:bg-surface-sunken transition-colors"
              >
                {m.label}
              </button>
            ))
          )}
          </div>
        )}
      </div>
    </div>
  )
}

// A notification event names the entity it's about (`entity_type`/
// `entity_id`, already sent by the backend for every notify() call), but
// arriving here only ever updated the bell's own local state -- an issue
// getting resolved elsewhere, say, would toast and bump the unread count
// without ever telling any open IssueList/IssueDetail/Dashboard query that
// its data is now stale. This maps each entity_type to the same query keys
// those pages already invalidate themselves after their own mutations (see
// IssueDetail.jsx, WorkOrderDetail.jsx, etc.) so a change made by someone
// else reaches an already-open view the same way a change made by you does.
function keysForNotification(entityType, entityId) {
  switch (entityType) {
    case 'issue':
      return [['issue', entityId], ['issues'], ['dashboard']]
    case 'work_order':
      return [['work-order', entityId], ['work-orders'], ['wo-board'], ['dashboard']]
    case 'asset':
    case 'health_event':
      return [['asset', entityId], ['assets']]
    case 'inspection':
      return [['inspection', entityId], ['inspections'], ['inspection-dashboard']]
    case 'lostfound_item':
      return [['lf-item', entityId], ['lf-items'], ['lf-dashboard']]
    case 'lf_claim':
    case 'lf_match':
      return [['lf-items'], ['lf-dashboard'], ['lf-claims-all'], ['lf-matches-review']]
    default:
      return []
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [pinged, setPinged] = useState(false)
  const ref = useRef(null)
  const qc = useQueryClient()
  useOutsideClick(ref, () => setOpen(false))

  const load = async () => {
    try {
      const data = await api.get('/notifications', { params: { limit: 12 } })
      setItems(data.items || [])
      setUnread(data.unread ?? 0)
    } catch {
      /* the bell is non-critical; stay quiet on failure */
    }
  }

  useEffect(() => {
    load()
    // A slow poll is the safety net for a socket that never connected or
    // dropped frames while the tab was asleep, not the delivery mechanism.
    const t = setInterval(load, 120000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

  // Live delivery. Arriving frames carry the notification itself, so the bell
  // updates without a round trip; the reload afterwards is only to pick up the
  // server-assigned id and timestamp the list needs for its links.
  useEffect(() => {
    const disconnect = connectNotifications({
      onEvent: (evt) => {
        if (evt?.type !== 'notification') return
        setUnread((n) => n + 1)
        setPinged(true)
        window.setTimeout(() => setPinged(false), 1200)
        toast.info(evt.title)
        load()
        keysForNotification(evt.entity_type, evt.entity_id)
          .forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      },
    })
    return disconnect
  }, [])

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setUnread(0)
      setItems((prev) => prev.map((i) => ({ ...i, read_at: new Date().toISOString() })))
    } catch { /* ignore */ }
  }

  const clearAll = async () => {
    try {
      await api.del('/notifications')
      setUnread(0)
      setItems([])
    } catch {
      toast.error('Could not clear notifications')
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        className="btn-ghost h-9 w-9 p-0 rounded-lg relative"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={18} className={clsx(pinged && 'animate-[pulse-ring_0.6s_ease-out_2]')} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full
                           bg-danger text-white text-[10px] font-semibold leading-[17px]
                           text-center ring-2 ring-surface tabular">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[5.25rem] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-80 max-h-[calc(100vh-5rem)] sm:max-h-none bg-surface rounded-xl shadow-popover border border-border-subtle z-50 overflow-hidden animate-slide-up flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-headline-md">Notifications</span>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="text-body-sm text-secondary hover:underline">
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button onClick={clearAll} className="text-body-sm text-ink-muted hover:text-danger-text hover:underline">
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 sm:max-h-96 flex-1 min-h-0 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-body-md text-ink-faint">You're all caught up.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id} to={n.link || '#'} onClick={() => setOpen(false)}
                  className={clsx(
                    'block px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface-sunken transition-colors',
                    !n.read_at && 'bg-info-bg/40',
                  )}
                >
                  <p className="text-body-md text-ink font-medium">{n.title}</p>
                  {n.body && <p className="text-body-sm text-ink-faint mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-body-sm text-ink-faint mt-1">{ago(n.created_at)}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useOutsideClick(ref, () => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-sunken/40 py-1.5 pl-1.5 pr-2 transition-colors hover:bg-surface-sunken sm:pl-3"
      >
        <div className="hidden min-w-0 flex-col gap-0.5 text-right leading-none sm:flex">
          <p className="max-w-[140px] truncate text-body-sm font-semibold text-ink">{user?.full_name}</p>
          <p className="text-[11px] text-ink-faint">{ROLE_LABEL[user?.role]}</p>
        </div>
        <Avatar name={user?.full_name} src={user?.avatar_url} size={32} />
        <ChevronDown size={14} className="text-ink-faint" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-surface rounded-xl shadow-popover border border-border-subtle z-50 py-1 overflow-hidden animate-slide-up">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-body-md font-medium truncate">{user?.full_name}</p>
            <p className="text-body-sm text-ink-faint truncate">{user?.email}</p>
          </div>
          <MenuItem icon={UserIcon} to="/profile" onClick={() => setOpen(false)}>My Profile</MenuItem>
          <MenuItem icon={Settings} to="/settings" onClick={() => setOpen(false)}>Account Settings</MenuItem>
          <MenuItem icon={HelpCircle} to="/help" onClick={() => setOpen(false)}>Help & Support</MenuItem>
          <div className="border-t border-border-subtle mt-1 pt-1">
            <button
              onClick={async () => { await logout(); navigate('/login') }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-body-md text-danger-text hover:bg-danger-bg transition-colors"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, to, children, onClick }) {
  return (
    <Link
      to={to} onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-body-md text-ink hover:bg-surface-sunken transition-colors"
    >
      <Icon size={16} className="text-ink-faint" /> {children}
    </Link>
  )
}

export default function AppLayout() {
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('cn-sidebar-collapsed') === 'true' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('cn-sidebar-collapsed', String(collapsed)) } catch { /* private mode */ }
  }, [collapsed])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  // Once the page scrolls, the navbar turns into frosted glass (translucent
  // + blurred) so content stays faintly visible behind it.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const location = useLocation()
  const items = navFor(user?.role)

  // NavLink's own matching cannot express this: prefix mode lights up both
  // /issues and /issues/new at once, while exact mode leaves /issues/:id with
  // nothing highlighted. The rule that actually holds is longest match wins —
  // the most specific nav item containing the current path is the active one.
  const activePath = useMemo(() => {
    const matches = navLeaves(items).filter(
      (i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
    )
    return matches.sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null
  }, [items, location.pathname])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [location.pathname])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])

  return (
    <div className="app-shell min-h-screen flex bg-surface-base">
      {/* Desktop sidebar: a floating card inset from the viewport edges */}
      <div className="hidden lg:block shrink-0 p-3 pr-0">
        <aside
          className={clsx(
            'sticky top-3 h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-border-subtle',
            'bg-surface shadow-level2 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            collapsed ? 'w-[72px]' : 'w-[264px]',
          )}
        >
          <Sidebar
            items={items} activePath={activePath} pathname={location.pathname} role={user?.role}
            collapsed={collapsed} onToggle={toggleCollapsed}
          />
        </aside>
      </div>

      {/* Mobile drawer (Level 3 overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[280px] max-w-[85vw] bg-surface shadow-level3 animate-slide-up">
            <Sidebar
              items={items} activePath={activePath} pathname={location.pathname} role={user?.role}
              mobile onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Floating navbar card, matching the sidebar. The wrapper's
            fading backdrop keeps scrolled content from showing through the
            gap above it. */}
        <div className="sticky top-0 z-30 px-3 pt-3 no-print lg:bg-gradient-to-b lg:from-surface-base lg:via-surface-base/85 lg:to-transparent">
        <header
          className={clsx(
            'flex min-h-16 items-center gap-3 rounded-2xl border px-4 backdrop-blur-xl backdrop-saturate-150 [&_.btn-ghost]:backdrop-blur-none',
            'transition-[background-color,box-shadow,border-color] duration-300 lg:px-5',
            scrolled
              ? 'border-border-subtle/60 bg-surface/55 shadow-level3 lg:border-border-subtle lg:bg-surface/95 lg:shadow-level2'
              : 'border-border-subtle bg-surface/90 shadow-level2 lg:bg-surface/95',
          )}
        >
          <Link to="/dashboard" aria-label="Campus Netra home" className="shrink-0 lg:hidden">
            <LogoMark size={30} />
          </Link>
          <button onClick={() => setMobileOpen(true)} className="btn-ghost h-9 w-9 p-0 rounded-lg lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>

          <HeaderSearch mobileOpen={mobileSearchOpen} onMobileClose={() => setMobileSearchOpen(false)} />

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setMobileSearchOpen(true)}
              className={clsx('btn-ghost h-9 w-9 p-0 rounded-lg sm:hidden', mobileSearchOpen && 'hidden')}
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <ThemeToggle className="lg:hidden" />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        </div>

        <main className="app-main page-reveal min-w-0 flex-1 px-4 pb-6 pt-5 lg:px-margin lg:pb-margin lg:pt-margin">
          <Outlet />
        </main>

        {/* Floating footer card, matching the navbar and sidebar */}
        <div className="px-3 pb-3 no-print">
          <footer className="app-footer flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-2xl border border-border-subtle bg-surface/95 py-3 pl-5 pr-16 text-body-sm text-ink-faint shadow-level2 sm:pr-24">
            <span>© {new Date().getFullYear()} Campus Netra. Powered by Precision Intelligence.</span>
            <nav className="flex items-center gap-4">
              <Link to="/help" className="transition-colors hover:text-ink">Help &amp; Support</Link>
              <Link to="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
              <Link to="/terms" className="transition-colors hover:text-ink">Terms</Link>
            </nav>
          </footer>
        </div>
      </div>

      <AssistantWidget />
      <QrScanButton />
    </div>
  )
}
