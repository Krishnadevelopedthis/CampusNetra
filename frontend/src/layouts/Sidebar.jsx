import clsx from 'clsx'
import {
  ChevronRight, Clock, HelpCircle, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/Logo'
import { ROLE_LABEL } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

// Collapsing animates only the rail's width. Everything inside keeps one
// fixed geometry in both states (icons sit at the same x, so they never
// jump) and labels fade instead of mounting/unmounting.
const fade = (collapsed) => clsx(
  'whitespace-nowrap transition-opacity motion-reduce:transition-none',
  // Closing: labels vanish at once. Opening: they wait for the rail to widen.
  collapsed ? 'pointer-events-none opacity-0 duration-150' : 'opacity-100 duration-300 delay-[260ms]',
)

function NavItem({ to, icon: Icon, label, active, collapsed, onNavigate }) {
  // Fixed-position tooltip in a portal: the rail clips its overflow and sits
  // in its own stacking context, so an in-place label would be cut off or
  // painted under page content.
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
          'flex h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-[15px] text-body-md font-medium transition-colors',
          active
            ? 'bg-surface-sunken text-ink'
            : 'text-ink-muted hover:bg-surface-sunken/60 hover:text-ink',
        )}
      >
        <Icon size={17} className={clsx('shrink-0', active && 'text-secondary')} />
        <span className={clsx('truncate', fade(collapsed))}>{label}</span>
      </NavLink>
      {collapsed && tip && createPortal(
        <span
          className="pointer-events-none fixed z-[100] -translate-y-1/2 whitespace-nowrap rounded-md bg-secondary
                     px-2 py-1 text-[11px] font-semibold text-on-secondary shadow-level2"
          style={{ top: tip.top, left: tip.left }}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  )
}

/**
 * A collapsible group (e.g. Assets → All Assets, Asset Registry, Create
 * Asset QR). Clicking the row toggles it; it opens on its own when the
 * current page is one of its entries. When the rail is collapsed it shows
 * as a single icon linking to the group's main page.
 */
function NavGroup({ item, activePath, collapsed, onNavigate }) {
  const childActive = item.children.some((c) => c.to === activePath)
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])

  if (collapsed) {
    return (
      <NavItem
        to={item.to} icon={item.icon} label={item.label}
        active={childActive} collapsed onNavigate={onNavigate}
      />
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          'flex h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-[15px] text-body-md font-medium transition-colors',
          childActive && !open
            ? 'bg-surface-sunken text-ink'
            : childActive ? 'text-ink' : 'text-ink-muted hover:bg-surface-sunken/60 hover:text-ink',
        )}
      >
        <item.icon size={17} className={clsx('shrink-0', childActive && 'text-secondary')} />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">{item.label}</span>
        <ChevronRight
          size={15}
          className={clsx(
            'shrink-0 text-ink-faint transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </button>
      {/* grid-rows 0fr → 1fr animates to the content's real height */}
      <div
        className={clsx(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden" aria-hidden={!open}>
          <div className="ml-[23px] space-y-0.5 border-l border-border-subtle py-1 pl-3">
            {item.children.map((c) => {
              const active = c.to === activePath
              return (
                <NavLink
                  key={c.to}
                  to={c.to}
                  end
                  tabIndex={open ? undefined : -1}
                  onClick={onNavigate}
                  className={clsx(
                    'relative flex h-8 items-center rounded-lg px-2.5 text-body-sm transition-colors',
                    active
                      ? 'bg-surface-sunken font-medium text-ink'
                      : 'text-ink-muted hover:bg-surface-sunken/60 hover:text-ink',
                  )}
                >
                  {active && (
                    <span className="absolute -left-[13px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-secondary" />
                  )}
                  <span className="truncate">{c.label}</span>
                </NavLink>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children, collapsed }) {
  return (
    <div className="relative h-8">
      <p
        className={clsx(
          'absolute bottom-1.5 left-[15px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint',
          fade(collapsed),
        )}
      >
        {children}
      </p>
      <span
        aria-hidden
        className={clsx(
          'absolute bottom-3 left-1/2 h-px w-6 -translate-x-1/2 bg-border-subtle transition-opacity duration-300',
          collapsed ? 'opacity-100 delay-[260ms]' : 'opacity-0 duration-150',
        )}
      />
    </div>
  )
}

function ThemeSwitch({ collapsed }) {
  const resolved = useTheme((s) => s.resolved)
  const setMode = useTheme((s) => s.setMode)
  const dark = resolved === 'dark'
  const toggle = () => setMode(dark ? 'light' : 'dark')
  // The sun/moon hints shrink away when collapsed; the switch itself stays.
  const hint = clsx(
    'shrink-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none',
    collapsed ? 'w-0 opacity-0' : 'w-[15px] opacity-100',
  )

  return (
    <div className={clsx('flex items-center justify-center py-1 transition-[gap] duration-500', collapsed ? 'gap-0' : 'gap-2.5')}>
      <Sun size={15} className={clsx(hint, dark ? 'text-ink-faint' : 'text-secondary')} />
      <button
        role="switch"
        aria-checked={dark}
        aria-label="Dark theme"
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggle}
        className={clsx(
          'relative h-6 w-11 shrink-0 overflow-hidden rounded-full p-0 transition-colors',
          dark ? 'bg-primary-700' : 'bg-secondary',
        )}
      >
        <span
          className={clsx(
            'absolute left-0 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-level2 transition-transform duration-300',
            dark ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        >
          {/* Collapsed: the Sun/Moon beside the switch are hidden, so the knob carries the icon. */}
          <span
            aria-hidden="true"
            className={clsx(
              'transition-opacity motion-reduce:transition-none',
              collapsed ? 'opacity-100 duration-300 delay-[260ms]' : 'opacity-0 duration-100',
            )}
          >
            {dark
              ? <Moon size={12} className="text-primary-700" />
              : <Sun size={12} className="text-secondary" />}
          </span>
        </span>
      </button>
      <Moon size={15} className={clsx(hint, dark ? 'text-secondary' : 'text-ink-faint')} />
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
      {/* Logo, with the collapse toggle beneath it */}
      <div className="flex shrink-0 flex-col gap-4 px-3 pb-1 pt-4">
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard" onClick={onNavigate}
            aria-label="Campus Netra home"
            className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden px-2"
          >
            <LogoMark size={32} />
            <div className={clsx('min-w-0 leading-tight', fade(isCollapsed))}>
              <p className="truncate text-body-md font-bold tracking-tight text-ink">Campus Netra</p>
              <p className="truncate text-[11px] text-ink-faint">{ROLE_LABEL[role]}</p>
            </div>
          </Link>
          {mobile && (
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
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
            className="flex h-9 w-full items-center gap-3 overflow-hidden rounded-lg bg-surface-sunken/60 px-4 text-body-sm font-medium
                       text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          >
            {collapsed
              ? <PanelLeftOpen size={16} className="shrink-0" />
              : <PanelLeftClose size={16} className="shrink-0" />}
            <span className={fade(isCollapsed)}>Collapse sidebar</span>
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
        <SectionLabel collapsed={isCollapsed}>Navigation</SectionLabel>
        <div className="space-y-0.5">
          {navigation.map((item) => (item.children ? (
            <NavGroup
              key={item.to} item={item} activePath={activePath}
              collapsed={isCollapsed} onNavigate={onNavigate}
            />
          ) : (
            <NavItem
              key={item.to} {...item} collapsed={isCollapsed}
              active={item.to === activePath} onNavigate={onNavigate}
            />
          )))}
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

      {/* On mobile the navbar already carries the theme toggle. */}
      {!mobile && (
        <div className="shrink-0 border-t border-border-subtle px-3 pb-4 pt-3">
          <ThemeSwitch collapsed={isCollapsed} />
        </div>
      )}
    </div>
  )
}
