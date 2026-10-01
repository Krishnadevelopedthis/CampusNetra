import clsx from 'clsx'
import {
  Clock, HelpCircle, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/Logo'
import { ROLE_LABEL } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

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
 * Floating sidebar card: logo with the collapse toggle beneath it, grouped
 * nav sections and a theme switch. `mobile` renders it inside the drawer,
 * always expanded, with a close button instead of the collapse toggle.
 */
export function Sidebar({ items, activePath, pathname, role, collapsed, onToggle, mobile, onClose }) {
  const isCollapsed = collapsed && !mobile

  const navigation = items.filter((i) => i.to !== '/history')
  const account = [
    items.some((i) => i.to === '/history') && { to: '/history', label: 'History', icon: Clock },
    { to: '/help', label: 'Help & Support', icon: HelpCircle },
    { to: '/settings', label: 'Settings', icon: Settings },
  ].filter(Boolean)

  const onNavigate = () => onClose?.()

  return (
    <div className="flex h-full flex-col">
      {/* Logo, with the collapse toggle directly beneath it */}
      <div className={clsx('flex shrink-0 flex-col gap-2.5 pb-2 pt-4', isCollapsed ? 'items-center px-2' : 'px-4')}>
        <div className="flex items-center gap-2.5">
          <Link
            to="/dashboard" onClick={onNavigate}
            aria-label="Campus Netra home"
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <LogoMark size={isCollapsed ? 36 : 32} />
            {!isCollapsed && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-body-md font-bold tracking-tight text-ink">Campus Netra</p>
                <p className="truncate text-[11px] text-ink-faint">{ROLE_LABEL[role]}</p>
              </div>
            )}
          </Link>
          {mobile && (
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-subtle text-ink-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {!mobile && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      <nav className={clsx('min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2', isCollapsed ? 'px-2' : 'px-3')}>
        <SectionLabel collapsed={isCollapsed}>Navigation</SectionLabel>
        <div className="space-y-0.5">
          {navigation.map((item) => (
            <NavItem
              key={item.to} {...item} collapsed={isCollapsed}
              active={item.to === activePath} onNavigate={onNavigate}
            />
          ))}
        </div>
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
      </nav>

      <div className={clsx('shrink-0 border-t border-border-subtle pb-4 pt-3', isCollapsed ? 'px-2' : 'px-3')}>
        <ThemeSwitch collapsed={isCollapsed} />
      </div>
    </div>
  )
}
