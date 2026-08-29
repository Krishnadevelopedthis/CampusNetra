import clsx from 'clsx'
import {
  Bell, ChevronDown, HelpCircle, LogOut, Menu, PanelLeftClose, PanelLeft,
  PlusCircle, Search, Settings, Sparkles, User as UserIcon, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar } from '@/components/ui'
import { api } from '@/lib/api'
import { ROLE_ACCENT, ROLE_LABEL, useAuth } from '@/lib/auth'
import { ago } from '@/lib/format'
import { navFor } from './nav'
import { AssistantPanel } from '@/features/assistant/AssistantPanel'

function useOutsideClick(ref, handler) {
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, handler])
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
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
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
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
        className="btn-ghost h-9 w-9 p-0 rounded relative"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-surface rounded-lg shadow-popover border border-border-subtle z-50 animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-headline-md">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-body-sm text-secondary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
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
        className="flex items-center gap-2.5 h-9 pl-2 pr-1 rounded hover:bg-surface-sunken transition-colors"
      >
        <div className="text-right hidden sm:block leading-tight">
          <p className="text-body-md font-medium text-ink truncate max-w-[140px]">{user?.full_name}</p>
          <p className="text-body-sm text-ink-faint">{ROLE_LABEL[user?.role]}</p>
        </div>
        <Avatar name={user?.full_name} src={user?.avatar_url} size={32} />
        <ChevronDown size={14} className="text-ink-faint" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-surface rounded-lg shadow-popover border border-border-subtle z-50 py-1 animate-slide-up">
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
  const [assistantOpen, setAssistantOpen] = useState(false)
  const location = useLocation()
  const items = navFor(user?.role)
  const accent = ROLE_ACCENT[user?.role] || '#1e1b4b'

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
      {/* Role-coloured accent line, per the design spec. */}
      <div className="h-1 shrink-0" style={{ backgroundColor: accent }} />

      <div className={clsx('px-4 py-4 border-b border-border-subtle', collapsed && 'px-3')}>
        {collapsed ? (
          <LogoMark size={36} className="mx-auto" />
        ) : (
          <Logo subtitle={ROLE_LABEL[user?.role]} />
        )}
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

      <div className="p-3 border-t border-border-subtle space-y-2">
        {canReport && !collapsed && (
          <Link to="/issues/new" className="btn-dark w-full">
            <PlusCircle size={16} /> Report an Issue
          </Link>
        )}
        <button
          onClick={() => setAssistantOpen(true)}
          className={clsx('btn-dark w-full', collapsed && 'px-0')}
          title="AI Campus Assistant"
        >
          <Sparkles size={16} />
          {!collapsed && 'AI Assistant'}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={clsx('btn-ghost w-full hidden lg:flex', collapsed && 'px-0')}
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
              className="absolute top-3 right-3 btn-ghost h-8 w-8 p-0 rounded z-10"
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
          <button onClick={() => setMobileOpen(true)} className="btn-ghost h-9 w-9 p-0 rounded lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>

          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              className="input pl-9" placeholder="Search issues, assets, items…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  window.location.assign(`/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`)
                }
              }}
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-margin min-w-0">
          <Outlet />
        </main>

        <footer className="border-t border-border-subtle px-4 lg:px-margin py-4 text-body-sm text-ink-faint flex flex-wrap items-center justify-between gap-2 no-print">
          <span>© {new Date().getFullYear()} Campus Netra. Powered by Precision Intelligence.</span>
          <div className="flex gap-4">
            <Link to="/help" className="hover:text-ink">Support</Link>
            <a href="/docs" target="_blank" rel="noreferrer" className="hover:text-ink">API</a>
          </div>
        </footer>
      </div>

      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  )
}
