import clsx from 'clsx'
import { AlertCircle, Check, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react'
import { Children, cloneElement, forwardRef, useEffect, useRef, useState } from 'react'

import { PRIORITY_STYLE, STATUS_STYLE, initials, titleCase } from '@/lib/format'
import { SkeletonRows } from '@/components/Skeletons'
export { SkeletonRows }
export { BrandLoader } from '@/components/ui/BrandLoader'

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    // Prevent the page behind the overlay from scrolling.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={clsx(
          'relative w-full bg-surface/90 backdrop-blur-2xl rounded-2xl border border-border-subtle/70 shadow-level3 animate-slide-up',
          'max-h-[90vh] flex flex-col', widths[size],
        )}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-headline-md">{title}</h2>
          <button onClick={onClose} className="btn-ghost h-11 w-11 p-0 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="px-5 py-4 border-t border-border-subtle flex justify-end gap-2 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/* ---------------- Toast ---------------- */
// Built from nodes with textContent, never innerHTML: titles and descriptions
// carry user names, file names and server messages, and parsing those as
// markup let any of them run script in the browser of whoever saw the toast.
function el(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text != null) node.textContent = String(text)
  return node
}

function createToast(title, description, variant = 'default') {
  const danger = variant === 'danger'
  const container = el('div', 'toast-overlay fixed top-4 right-4 z-50 flex gap-2')
  const card = el('div', clsx(
    'toast p-4 rounded-lg shadow-level2 transition-opacity duration-500',
    danger ? 'bg-danger-bg text-danger-text' : 'bg-surface text-ink',
  ))
  card.setAttribute('role', danger ? 'alert' : 'status')

  const body = el('div', '')
  body.append(el('p', 'font-medium', title))
  if (description) body.append(el('p', 'text-body-sm text-ink-muted mt-0.5', description))

  const row = el('div', 'flex items-start gap-2')
  row.append(el('span', clsx('w-2 h-2 rounded-full shrink-0 mt-1.5', danger ? 'bg-danger' : 'bg-secondary')), body)
  card.append(row)
  container.append(card)
  document.body.appendChild(container)

  // Auto-remove after 5 seconds
  setTimeout(() => {
    container.style.opacity = '0'
    setTimeout(() => container.remove(), 300)
  }, 5000)
}

export const toast = {
  info: (title, description) => createToast(title, description, 'default'),
  success: (title, description) => createToast(title, description, 'success'),
  danger: (title, description) => createToast(title, description, 'danger'),
  warning: (title, description) => createToast(title, description, 'warning'),
  error: (title, description) => createToast(title, description, 'danger'),
}

/* ---------------- Widget (Level 1: bordered, no shadow) ---------------- */
export function Widget({ title, subtitle, action, children, className, bodyClass, ...rest }) {
  return (
    <section className={clsx('widget', className)} {...rest}>
      {(title || action) && (
        <header className="widget-header">
          <div className="min-w-0">
            {title && <h3 className="widget-title truncate">{title}</h3>}
            {subtitle && <p className="text-body-sm text-ink-faint mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx('widget-body', bodyClass)}>{children}</div>
    </section>
  )
}

/* ---------------- Status & priority pills ---------------- */
export function StatusPill({ status, className }) {
  if (!status) return null
  return (
    <span className={clsx('pill', STATUS_STYLE[status] || 'bg-neutral-bg text-neutral-text', className)}>
      {titleCase(status)}
    </span>
  )
}

export function PriorityPill({ priority, className }) {
  if (!priority) return null
  return (
    <span className={clsx('pill', PRIORITY_STYLE[priority] || 'bg-neutral-bg', className)}>
      {priority === 'critical' && <AlertCircle size={12} />}
      {titleCase(priority)}
    </span>
  )
}

/* ---------------- Buttons ---------------- */
export function Button({
  variant = 'primary', size, loading, icon: Icon, children, className, disabled, ...rest
}) {
  const variants = {
    primary: 'btn-primary', dark: 'btn-dark', secondary: 'btn-secondary',
    ghost: 'btn-ghost', danger: 'btn-danger',
  }
  return (
    <button
      className={clsx(variants[variant], size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

/* ---------------- Form fields ---------------- */
export function Field({ label, error, hint, required, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="field-error">
          <AlertCircle size={13} /> {error}
        </p>
      )}
      {hint && !error && <p className="hint">{hint}</p>}
    </div>
  )
}

export const Input = forwardRef(function Input({ error, className, id, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx('input', error && 'input-error', className)}
      {...rest}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ error, className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx('textarea', error && 'input-error', className)} {...rest} />
})

export function Select({ error, className, children, ...rest }) {
  return (
    <div className="relative">
      <select className={clsx('select', error && 'input-error', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
      />
    </div>
  )
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, src, size = 32, className }) {
  const [failed, setFailed] = useState(false)
  // Reset on every new src — otherwise an avatar that failed to load once
  // (a transient network hiccup, or the brief moment mid logout/login when
  // this re-renders with a stale or empty src) is stuck showing initials
  // forever, even once a perfectly good src comes back. That read as an
  // uploaded photo "fading away" and never returning after signing out.
  useEffect(() => { setFailed(false) }, [src])

  if (src && !failed) {
    return (
      <img
        src={src} alt={name || ''} width={size} height={size} onError={() => setFailed(true)}
        className={clsx('rounded-full object-cover shrink-0', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={clsx(
        'rounded-full bg-brand-soft text-brand grid place-items-center font-semibold shrink-0',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

/* ---------------- Empty / loading / error states ---------------- */
/**
 * Standard page header. Pulled out of the pages because the refresh control
 * belongs in the same place on every one of them — a control that moves is a
 * control people stop looking for.
 */
export function PageHeader({ title, subtitle, actions, onRefresh, refreshing }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-headline-lg text-ink">{title}</h1>
        {subtitle && <p className="text-body-md text-ink-muted mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions}
        {onRefresh && <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />}
      </div>
    </header>
  )
}

export function RefreshButton({ onRefresh, refreshing, className }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      title="Refresh"
      aria-label={refreshing ? 'Refreshing' : 'Refresh'}
      className={clsx('btn-secondary h-10 w-10 p-0', className)}
    >
      <RefreshCw size={16} className={clsx(refreshing && 'animate-spin')} />
    </button>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-14 px-6">
      {Icon && (
        <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken grid place-items-center mb-4">
          <Icon size={22} className="text-ink-faint" />
        </div>
      )}
      <h3 className="text-headline-md text-ink">{title}</h3>
      {description && <p className="text-body-md text-ink-faint mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading…', className }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-12 text-ink-faint', className)}>
      <Loader2 size={18} className="animate-spin" />
      <span className="text-body-md">{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-danger-bg grid place-items-center mb-4">
        <AlertCircle size={22} className="text-danger" />
      </div>
      <h3 className="text-headline-md text-ink">Something went wrong</h3>
      <p className="text-body-md text-ink-faint mt-1">
        {error?.detail || error?.message || 'Please try again.'}
      </p>
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  )
}

/* ---------------- Metric tile ---------------- */
// The backend sends a fixed hex per metric (warning/success/info intent),
// the same value regardless of theme. Recognize the known ones and route
// them through the theme-aware token instead of using the literal hex --
// this is the only way these colors can actually shift with light/dark,
// since the raw string from the API never will.
const KNOWN_ACCENT_HEX = {
  '#f59e0b': 'rgb(var(--c-warning))',
  '#10b981': 'rgb(var(--c-success))',
  '#3b82f6': 'rgb(var(--c-info))',
  '#ef4444': 'rgb(var(--c-danger))',
}
function resolveAccent(hex) {
  if (!hex) return undefined
  return KNOWN_ACCENT_HEX[hex.toLowerCase()] || hex
}

export function Metric({ label, value, delta, deltaTone = 'neutral', accent, icon: Icon, size = 'default', className }) {
  const tones = {
    up: 'bg-success-bg text-success-text',
    down: 'bg-danger-bg text-danger-text',
    neutral: 'bg-surface-sunken text-ink-muted',
  }
  const resolvedAccent = resolveAccent(accent)
  const isHero = size === 'hero'
  return (
    <div
      className={clsx(
        'widget flex flex-col gap-2 min-w-0',
        isHero ? 'p-6 sm:p-7' : 'p-widget',
        className,
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: resolvedAccent,
        // A hero tile earns a faint wash of its own accent so it visually
        // leads the row -- everything else stays on the plain surface,
        // matching "one accent stands out, the rest don't compete".
        background: isHero && resolvedAccent ? `linear-gradient(135deg, color-mix(in srgb, ${resolvedAccent} 10%, transparent), transparent 60%)` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-label-caps uppercase text-ink-muted">{label}</span>
        {Icon && <Icon size={isHero ? 20 : 16} className="text-ink-faint shrink-0" />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={clsx('tabular leading-none', isHero ? 'text-display-hero' : 'text-display-metrics')}
          style={resolvedAccent ? { color: resolvedAccent } : undefined}
        >
          {value}
        </span>
        {delta && <span className={clsx('pill text-body-sm', tones[deltaTone])}>{delta}</span>}
      </div>
    </div>
  )
}

// Wraps a set of <Metric> elements so the first visually leads (bigger,
// tinted) and the rest sit smaller beside/below it -- the "one primary,
// several supporting" KPI hierarchy every page with a stat row should
// have, applied by wrapping the existing <Metric> children rather than
// restructuring each page's own metric list into a separate data shape.
export function MetricRow({ children, className }) {
  const items = Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  const [hero, ...rest] = items
  return (
    <div className={clsx('grid grid-cols-2 gap-3', className)}>
      {cloneElement(hero, {
        size: 'hero',
        className: clsx('col-span-2 sm:col-span-1', hero.props.className),
      })}
      {rest.length > 0 && (
        <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-3">
          {rest}
        </div>
      )}
    </div>
  )
}