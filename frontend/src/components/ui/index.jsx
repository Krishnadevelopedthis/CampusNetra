import clsx from 'clsx'
import { AlertCircle, Check, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { PRIORITY_STYLE, STATUS_STYLE, initials, titleCase } from '@/lib/format'

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

export const Input = forwardRef(function Input({ error, className, ...rest }, ref) {
  return <input ref={ref} className={clsx('input', error && 'input-error', className)} {...rest} />
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
        <div className="mx-auto w-12 h-12 rounded-lg bg-surface-sunken grid place-items-center mb-4">
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
      <div className="mx-auto w-12 h-12 rounded-lg bg-danger-bg grid place-items-center mb-4">
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

export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2 p-widget">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

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
          'relative w-full bg-surface rounded-lg shadow-level3 animate-slide-up',
          'max-h-[90vh] flex flex-col', widths[size],
        )}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-headline-md">{title}</h2>
          <button onClick={onClose} className="btn-ghost h-8 w-8 p-0 rounded" aria-label="Close">
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

/* ---------------- Toasts ---------------- */
let pushToast = null
export const toast = {
  success: (m) => pushToast?.({ kind: 'success', message: m }),
  error: (m) => pushToast?.({ kind: 'error', message: m }),
  info: (m) => pushToast?.({ kind: 'info', message: m }),
}

export function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    pushToast = (t) => {
      const id = Math.random().toString(36).slice(2)
      setItems((prev) => [...prev, { ...t, id }])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5000)
    }
    return () => { pushToast = null }
  }, [])

  const styles = {
    success: 'bg-success-bg border-success-border text-success-text',
    error: 'bg-danger-bg border-danger-border text-danger-text',
    info: 'bg-info-bg border-info-border text-info-text',
  }
  const Icons = { success: Check, error: AlertCircle, info: AlertCircle }

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 max-w-sm no-print">
      {items.map((t) => {
        const Icon = Icons[t.kind]
        return (
          <div
            key={t.id} role="status"
            className={clsx(
              'flex items-start gap-2.5 px-4 py-3 rounded-lg border shadow-level3 animate-slide-up',
              styles[t.kind],
            )}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <p className="text-body-md">{t.message}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Metric tile ---------------- */
export function Metric({ label, value, delta, deltaTone = 'neutral', accent, icon: Icon }) {
  const tones = {
    up: 'bg-success-bg text-success-text',
    down: 'bg-danger-bg text-danger-text',
    neutral: 'bg-surface-sunken text-ink-muted',
  }
  return (
    <div
      className="widget p-widget flex flex-col gap-2 min-w-0"
      style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-label-caps uppercase text-ink-muted">{label}</span>
        {Icon && <Icon size={16} className="text-ink-faint shrink-0" />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-display-metrics tabular leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {delta && <span className={clsx('pill text-body-sm', tones[deltaTone])}>{delta}</span>}
      </div>
    </div>
  )
}
