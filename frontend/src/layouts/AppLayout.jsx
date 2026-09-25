import clsx from 'clsx'
import {
  Bell, ChevronDown, HelpCircle, LogOut, Menu, PanelLeftClose, PanelLeft,
  PlusCircle, Search, Settings, User as UserIcon, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, toast } from '@/components/ui'
import { AssistantWidget } from '@/features/assistant/AssistantWidget'
import { api, connectNotifications } from '@/lib/api'
import { ROLE_ACCENT, ROLE_LABEL, useAuth } from '@/lib/auth'
import { ago } from '@/lib/format'
import { searchProfileIndex } from '@/lib/profileSearchIndex'
import { navFor } from './nav'

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
  useOutsideClick(ref, () => setValue(''))

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
    <div
      ref={ref}
      className={clsx(
        'relative flex-1 max-w-md',
        mobileOpen
          ? 'fixed inset-x-3 top-3 z-40 max-w-none sm:static sm:inset-auto sm:z-auto'
          : 'hidden sm:block',
      )}
    >
      <Search
        size={17} strokeWidth={2.25}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
      />
      <input
        autoFocus={mobileOpen}
        className="input pl-9"
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
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [pinged, setPinged] = useState(false)
  const ref = useRef(null)
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
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-80 max-h-[calc(100vh-5rem)] sm:max-h-none bg-surface rounded-xl shadow-popover border border-border-subtle z-50 overflow-hidden animate-slide-up flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-headline-md">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-body-sm text-secondary hover:underline">
                Mark all read
              </button>
            )}
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
        className="flex items-center gap-2.5 h-9 pl-2 pr-1 rounded-lg hover:bg-surface-sunken transition-colors"
      >
        <div className="text-right hidden sm:block leading-tight">
          <p className="text-body-md font-medium text-ink truncate max-w-[140px]">{user?.full_name}</p>
          <p className="text-body-sm text-ink-faint">{ROLE_LABEL[user?.role]}</p>
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
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const location = useLocation()
  const items = navFor(user?.role)
  const accent = ROLE_ACCENT[user?.role] || 'rgb(var(--c-primary))'

  // NavLink's own matching cannot express this: prefix mode lights up both
  // /issues and /issues/new at once, while exact mode leaves /issues/:id with
  // nothing highlighted. The rule that actually holds is longest match wins —
  // the most specific nav item containing the current path is the active one.
  const activePath = useMemo(() => {
    const matches = items.filter(
      (i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
    )
    return matches.sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null
  }, [items, location.pathname])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [location.pathname])

  const canReport = ['student', 'teacher'].includes(user?.role)

  const sidebar = (
    <>
      {/* Role-coloured accent line, per the design spec. Absolutely
          positioned so it doesn't add to the block's own height below --
          it used to sit in-flow and push the logo block a few px taller
          than the header's h-16, so the border under it never lined up
          with the header's own bottom border across the seam. */}
      <div className="relative shrink-0">
        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
        <div className={clsx(
          'h-16 flex items-center px-4 border-b border-border-subtle',
          collapsed && 'px-3 justify-center',
        )}>
          {collapsed ? (
            <LogoMark size={36} />
          ) : (
            <Logo subtitle={ROLE_LABEL[user?.role]} />
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to} to={item.to}
            title={collapsed ? item.label : undefined}
            className={clsx(
              'sidebar-link',
              item.to === activePath && 'sidebar-link-active',
              collapsed && 'justify-center px-0',
            )}
          >
            <item.icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* h-16, same as the footer row it sits beside at the bottom of the
          page — both used to size from their own padding+content (p-3 here,
          py-4 there), which landed at different totals and never lined up. */}
      <div className="h-16 flex items-center px-3 border-t border-border-subtle">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={clsx('btn-ghost w-full hidden lg:flex', collapsed && 'px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-surface-base">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-surface border-r border-border-subtle shrink-0 sticky top-0 h-screen transition-[width] duration-200',
          collapsed ? 'w-[76px]' : 'w-sidebar',
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer (Level 3 overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-sidebar max-w-[85vw] h-full bg-surface flex flex-col shadow-level3 animate-slide-up">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 btn-ghost h-8 w-8 p-0 rounded-lg z-10"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-surface border-b border-border-subtle flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30 no-print">
          <button onClick={() => setMobileOpen(true)} className="btn-ghost h-9 w-9 p-0 rounded-lg lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>

          <HeaderSearch mobileOpen={mobileSearchOpen} onMobileClose={() => setMobileSearchOpen(false)} />

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="btn-ghost h-9 w-9 p-0 rounded-lg sm:hidden"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-4 lg:px-margin lg:pt-margin lg:pb-margin min-w-0">
          <Outlet />
        </main>

        <footer className="h-16 border-t border-border-subtle px-4 lg:px-margin text-body-sm text-ink-faint flex flex-wrap items-center justify-between gap-2 no-print">
          <span>© {new Date().getFullYear()} Campus Netra. Powered by Precision Intelligence.</span>
        </footer>
      </div>

      <AssistantWidget />
    </div>
  )
}
