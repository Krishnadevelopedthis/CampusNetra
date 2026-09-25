import clsx from 'clsx'
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, Loader2, Lock, RefreshCw, X } from 'lucide-react'
import { Children, cloneElement, forwardRef, useEffect, useId, useRef, useState } from 'react'
import { GooeyToaster, gooeyToast } from 'goey-toast'
import 'goey-toast/styles.css'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

import { PRIORITY_STYLE, STATUS_STYLE, initials, titleCase } from '@/lib/format'
import { SkeletonRows } from '@/components/Skeletons'
import { useAuthedImage } from '@/hooks/useAuthedImage'
import { useTheme } from '@/lib/theme'
export { SkeletonRows }
export { RingLoader } from '@/components/ui/RingLoader'

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null)

  // Most callers pass onClose as an inline arrow function, so its identity
  // changes on every render of the parent -- including every keystroke in
  // a field inside the modal, since that's a state update on the same
  // parent. A ref means the effect below never needs onClose in its
  // dependency array to see the current one, so typing doesn't re-run the
  // "move focus into the dialog" logic and steal focus away mid-word.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    // Move focus into the dialog when it opens, and trap Tab/Shift+Tab
    // inside it while it's up — without this, a keyboard user can Tab
    // straight past the modal into whatever's behind it, which for a
    // dialog that's blocking the page is a real accessibility failure,
    // not just a nicety.
    const node = ref.current
    const focusables = () => node
      ? Array.from(node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && el.offsetParent !== null)
      : []
    const toFocus = focusables()[0] || node
    toFocus?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    // Prevent the page behind the overlay from scrolling.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
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

/* ---------------- Toast ----------------
 * goey-toast (gooey/morphing pill, built on Sonner + Framer Motion) in
 * place of the old plain DOM-node toast -- same call shape everywhere it's
 * used (toast.success(title, description) etc), so no call site changed.
 * Colors are pinned to the app's own success/danger/warning/secondary
 * tokens rather than the library's defaults, so a toast reads as part of
 * CampusNetra's own UI instead of a generic drop-in widget. */
const TOAST_ACCENT = {
  default: 'rgb(var(--c-secondary))',
  success: 'rgb(var(--c-success))',
  danger: 'rgb(var(--c-danger))',
  warning: 'rgb(var(--c-warning))',
}

function createToast(title, description, variant = 'default') {
  const fn = { success: gooeyToast.success, danger: gooeyToast.error, warning: gooeyToast.warning }[variant]
    || gooeyToast.info
  fn(title, {
    description,
    fillColor: 'rgb(var(--c-surface))',
    borderColor: TOAST_ACCENT[variant] || TOAST_ACCENT.default,
  })
}

export const toast = {
  info: (title, description) => createToast(title, description, 'default'),
  success: (title, description) => createToast(title, description, 'success'),
  danger: (title, description) => createToast(title, description, 'danger'),
  warning: (title, description) => createToast(title, description, 'warning'),
  error: (title, description) => createToast(title, description, 'danger'),
}

/** Mounted once near the app root (see App.jsx). */
export function Toaster() {
  const theme = useTheme((s) => s.resolved)
  return (
    <GooeyToaster
      position="top-right"
      theme={theme === 'dark' ? 'dark' : 'light'}
      preset="smooth"
      // A bare `true` here left the close button's left/right side picked
      // by a comparison against a string it never was, "top-right" in this
      // case, putting it on the same side as the toast's own type icon --
      // two X-shaped icons squashed together on the left of an error toast,
      // reading as one broken duplicate rather than two distinct controls.
      // Naming the side explicitly, matching the toaster's own position,
      // fixes both that and the button moving around between toasts.
      closeButton="top-right"
      richColors={false}
    />
  )
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
// The label and its control used to be unconnected siblings — clicking the
// label text did nothing, which fails the basic "click a label, focus its
// field" expectation every other form on the web meets. When children is a
// single form element without its own id, we generate one and wire up
// htmlFor/id so the label is actually clickable and screen readers can
// announce the field by name.
export function Field({ label, error, hint, required, children, className }) {
  const generatedId = useId()
  const singleChild = Children.count(children) === 1 ? Children.toArray(children)[0] : null
  const isWireable = singleChild && typeof singleChild === 'object' && singleChild.props
  const canWire = isWireable && !singleChild.props.id
  const fieldId = canWire ? generatedId : (isWireable ? singleChild.props.id : undefined)
  const wiredChildren = canWire ? cloneElement(singleChild, { id: fieldId }) : children

  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={fieldId}>
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {wiredChildren}
      {error && (
        <p className="field-error">
          <AlertCircle size={13} /> {error}
        </p>
      )}
      {hint && !error && <p className="hint">{hint}</p>}
    </div>
  )
}

export const Input = forwardRef(function Input({ error, icon: Icon, className, id, ...rest }, ref) {
  if (!Icon) {
    return (
      <input
        ref={ref}
        id={id}
        className={clsx('input', error && 'input-error', className)}
        {...rest}
      />
    )
  }
  return (
    <div className="relative">
      <Icon size={15} className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
      <input
        ref={ref}
        id={id}
        className={clsx('input pl-9', error && 'input-error', className)}
        {...rest}
      />
    </div>
  )
})

// A password field with a lock icon and a show/hide toggle — every
// password box in the app (login, register, reset, change-password)
// used a plain <Input type="password">, no visual cue it holds a secret
// and no way to check what you typed before submitting.
export const PasswordInput = forwardRef(function PasswordInput({ error, className, ...rest }, ref) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Lock size={15} className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={clsx('input pl-9 pr-9', error && 'input-error', className)}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted transition-colors"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
})

// The 4-segment strength bar shown under a new-password field. Takes the
// already-computed score from scorePassword (lib/format.js) rather than
// the raw value, so it stays a dumb rendering component -- every place
// that sets a password (register, reset, change) shares the one scoring
// function and the one bar, not a copy of each.
export function PasswordStrengthMeter({ score, label }) {
  if (!label) return null
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden flex gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={clsx(
              'flex-1 rounded-full transition-colors',
              i < score
                ? score <= 1 ? 'bg-danger'
                  : score === 2 ? 'bg-warning' : 'bg-success'
                : 'bg-transparent',
            )}
          />
        ))}
      </div>
      <span className="text-body-sm text-ink-muted w-28 text-right">{label}</span>
    </div>
  )
}

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
export function Avatar({ name, src: path, size = 32, className }) {
  const [failed, setFailed] = useState(false)
  // src is a private /uploads/file/... path, not a directly-loadable URL —
  // the route requires the caller's bearer token, which a plain <img src>
  // cannot send. useAuthedImage fetches it and hands back a blob: URL.
  const src = useAuthedImage(path)
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

// A KPI card with a bare number reads as a snapshot; the same card with a
// trend beside it reads as something moving. `sparkline` is optional and
// only ever real data already fetched for this dashboard (each day's own
// count) -- never fabricated points, since a graph that doesn't correspond
// to anything real is worse than no graph.
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null
  const gradientId = `metric-spark-${color?.replace(/[^a-zA-Z0-9]/g, '') || 'default'}`
  return (
    <div className="h-9 -mx-1 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v) => ({ v }))} margin={{ top: 2, right: 1, bottom: 0, left: 1 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="v" stroke={color} strokeWidth={1.75}
            fill={`url(#${gradientId})`} isAnimationActive={false} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Metric({
  label, value, delta, deltaTone = 'neutral', accent, icon: Icon, size = 'default', className,
  sparkline,
}) {
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
      <Sparkline data={sparkline} color={resolvedAccent || 'rgb(var(--c-secondary))'} />
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