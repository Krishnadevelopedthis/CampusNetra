import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowRight, Clock, HelpCircle, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sun, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/Logo'
import { api } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

const REPORTERS = ['student', 'teacher']

function NavItem({ to, icon: Icon, label, active, collapsed, onNavigate }) {
  // Fixed-position tooltip: the rail scrolls and clips its overflow, so a
  // plain absolutely-positioned label would be cut off at the rail's edge.
  const [tip, setTip] = useState(null)
  const show = (e) => {
    if (!collapsed) return
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ top: r.top + r.height / 2, left: r.right + 10 })
  }
  return (
    <>
      <NavLink
        to={to}
        onClick={onNavigate}
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
        aria-label={collapsed ? label : undefined}
        className={clsx(
          'flex h-10 items-center rounded-xl text-body-md font-medium transition-colors',
          collapsed ? 'mx-auto w-10 justify-center' : 'gap-3 px-3',
          active
            ? 'bg-surface-sunken text-ink'
            : 'text-ink-muted hover:bg-surface-sunken/60 hover:text-ink',
        )}
      >
        <Icon size={17} className={clsx('shrink-0', active && 'text-secondary')} />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
      {collapsed && tip && (
        <span
          className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-secondary
                     px-2 py-1 text-[11px] font-semibold text-on-secondary shadow-level2"
          style={{ top: tip.top, left: tip.left }}
        >
          {label}
        </span>
      )}
    </>
  )
}

function SectionLabel({ children, collapsed }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-border-subtle" />
  return (
    <p className="px-3 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
      {children}
    </p>
  )
}

/** Role-aware highlight card at the foot of the sidebar. */
function SidebarCard({ role, onNavigate }) {
  const isReporter = REPORTERS.includes(role)
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    enabled: !isReporter,
    staleTime: 60_000,
  })

  const score = data?.health_score
  const openIssues = data?.metrics?.find((m) => m.label === 'Open issues')?.value

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-secondary-400 via-secondary to-secondary-700 p-3 text-on-secondary shadow-level2">
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
      <div className="relative">
        {isReporter ? (
          <>
            <p className="text-center text-body-md font-semibold">Spotted a fault?</p>
            <p className="mt-1 text-center text-[11.5px] leading-snug opacity-85">
              Report it in a minute — AI routes it to the right team.
            </p>
          </>
        ) : (
          <>
            <p className="text-center text-body-md font-semibold">Campus Health</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-center text-[11.5px] opacity-85">
              {score != null ? `${score}% healthy` : 'Loading…'}
              {openIssues != null && ` · ${openIssues} open issues`}
            </p>
          </>
        )}

        <Link
          to={isReporter ? '/issues' : '/map'}
          onClick={onNavigate}
          className="mt-2.5 flex h-8 items-center justify-center rounded-full bg-white/90 text-body-sm font-semibold text-ink transition-colors hover:bg-white"
        >
          {isReporter ? 'Track complaints' : 'View campus map'}
        </Link>
        <Link
          to={isReporter ? '/issues/new' : '/dashboard'}
          onClick={onNavigate}
          className="mt-2 flex h-9 items-center justify-between rounded-full bg-primary pl-4 pr-1 text-body-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          {isReporter ? 'Report an issue' : 'Open dashboard'}
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-primary">
            <ArrowRight size={14} />
          </span>
        </Link>
      </div>
    </div>
  )
}

function ThemeSwitch({ collapsed }) {
  const resolved = useTheme((s) => s.resolved)
  const setMode = useTheme((s) => s.setMode)
  const dark = resolved === 'dark'
  const toggle = () => setMode(dark ? 'light' : 'dark')

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="mx-auto grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        {dark ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-center gap-2.5 py-1">
      <Sun size={15} className={dark ? 'text-ink-faint' : 'text-secondary'} />
      <button
        role="switch"
        aria-checked={dark}
        aria-label="Dark theme"
        onClick={toggle}
        className={clsx(
          'relative h-6 w-11 rounded-full transition-colors',
          dark ? 'bg-primary-700' : 'bg-secondary',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-level2 transition-transform duration-200',
            dark ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <Moon size={15} className={dark ? 'text-secondary' : 'text-ink-faint'} />
    </div>
  )
}

/**
 * Floating sidebar card: logo + collapse toggle, a filterable nav ("/" to
 * search), grouped sections, a role-aware highlight card and a theme switch.
 * `mobile` renders it full-height inside the drawer, always expanded.
 */
export function Sidebar({ items, activePath, pathname, role, collapsed, onToggle, mobile, onClose }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const isCollapsed = collapsed && !mobile

  useEffect(() => {
    if (mobile) return undefined
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      if (collapsed) onToggle()
      requestAnimationFrame(() => searchRef.current?.focus())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, mobile, onToggle])

  const q = query.trim().toLowerCase()
  const match = (label) => !q || label.toLowerCase().includes(q)

  const navigation = items.filter((i) => i.to !== '/history' && match(i.label))
  const account = [
    items.some((i) => i.to === '/history') && { to: '/history', label: 'History', icon: Clock },
    { to: '/help', label: 'Help & Support', icon: HelpCircle },
    { to: '/settings', label: 'Settings', icon: Settings },
  ].filter(Boolean).filter((i) => match(i.label))

  const onNavigate = () => {
    setQuery('')
    onClose?.()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header: logo + collapse */}
      <div className={clsx('flex shrink-0 items-center pb-3 pt-4', isCollapsed ? 'flex-col gap-3 px-2' : 'gap-2.5 px-4')}>
        {!isCollapsed && (
          <Link to="/dashboard" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5">
            <LogoMark size={32} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-body-md font-bold tracking-tight text-ink">Campus Netra</p>
              <p className="truncate text-[11px] text-ink-faint">{ROLE_LABEL[role]}</p>
            </div>
          </Link>
        )}
        {mobile ? (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-subtle text-ink-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-subtle text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Search */}
      <div className={clsx('shrink-0 pb-1', isCollapsed ? 'px-2' : 'px-3')}>
        {isCollapsed ? (
          <button
            onClick={() => { onToggle(); requestAnimationFrame(() => searchRef.current?.focus()) }}
            aria-label="Search menu"
            className="mx-auto grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <Search size={17} />
          </button>
        ) : (
          <label className="flex h-10 items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken/50 px-3 focus-within:border-secondary">
            <Search size={15} className="shrink-0 text-ink-faint" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none placeholder:text-ink-faint"
            />
            {!mobile && (
              <kbd className="grid h-5 min-w-5 place-items-center rounded border border-border-subtle bg-surface px-1 font-mono text-[10px] text-ink-faint">
                /
              </kbd>
            )}
          </label>
        )}
      </div>

      {/* Nav */}
      <nav className={clsx('min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2', isCollapsed ? 'px-2' : 'px-3')}>
        {navigation.length > 0 && (
          <>
            <SectionLabel collapsed={isCollapsed}>Navigation</SectionLabel>
            <div className="space-y-0.5">
              {navigation.map((item) => (
                <NavItem
                  key={item.to} {...item} collapsed={isCollapsed}
                  active={item.to === activePath} onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        )}
        {account.length > 0 && (
          <>
            <SectionLabel collapsed={isCollapsed}>Account</SectionLabel>
            <div className="space-y-0.5">
              {account.map((item) => (
                <NavItem
                  key={item.to} {...item} collapsed={isCollapsed}
                  active={pathname === item.to || pathname?.startsWith(`${item.to}/`)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        )}
        {q && navigation.length === 0 && account.length === 0 && (
          <p className="px-3 py-4 text-center text-body-sm text-ink-faint">No match for “{query}”.</p>
        )}
      </nav>

      {/* Footer: highlight card + theme switch */}
      <div className={clsx('shrink-0 space-y-3 pb-4 pt-2', isCollapsed ? 'px-2' : 'px-3')}>
        {!isCollapsed && <SidebarCard role={role} onNavigate={onNavigate} />}
        <ThemeSwitch collapsed={isCollapsed} />
      </div>
    </div>
  )
}
