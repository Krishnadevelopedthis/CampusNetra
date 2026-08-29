import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns'

export const asDate = (v) => (v instanceof Date ? v : v ? parseISO(v) : null)

export function dt(value, pattern = 'd MMM, HH:mm') {
  const d = asDate(value)
  return d && isValid(d) ? format(d, pattern) : '—'
}

export function ago(value) {
  const d = asDate(value)
  if (!d || !isValid(d)) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

/** SLA countdown: "4h 20m left" / "2h overdue". */
export function slaLabel(minutes) {
  if (minutes === null || minutes === undefined) return null
  const overdue = minutes < 0
  const m = Math.abs(minutes)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  const parts = d ? [`${d}d`, `${h}h`] : h ? [`${h}h`, `${mm}m`] : [`${mm}m`]
  return `${parts.join(' ')} ${overdue ? 'overdue' : 'left'}`
}

export const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0)

/** Currency for chart axes, where the full form does not fit. */
export const moneyCompact = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1,
  }).format(Number(n) || 0)

export const compact = (n) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
    .format(Number(n) || 0)

export const titleCase = (s) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export const initials = (name) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

/** Status → pill styling. Shared by issues, work orders and inspections. */
export const STATUS_STYLE = {
  reported:    'bg-neutral-bg text-neutral-text',
  triaged:     'bg-info-bg text-info-text',
  open:        'bg-neutral-bg text-neutral-text',
  assigned:    'bg-info-bg text-info-text',
  accepted:    'bg-info-bg text-info-text',
  in_progress: 'bg-warning-bg text-warning-text',
  awaiting_parts: 'bg-warning-bg text-warning-text',
  on_hold:     'bg-warning-bg text-warning-text',
  resolved:    'bg-success-bg text-success-text',
  completed:   'bg-success-bg text-success-text',
  verified:    'bg-success-bg text-success-text',
  closed:      'bg-neutral-bg text-neutral-text',
  rejected:    'bg-danger-bg text-danger-text',
  cancelled:   'bg-neutral-bg text-neutral-text',
  duplicate:   'bg-neutral-bg text-neutral-text',
  draft:       'bg-neutral-bg text-neutral-text',
  // Lost & Found
  matched:     'bg-info-bg text-info-text',
  claim_pending: 'bg-warning-bg text-warning-text',
  claimed:     'bg-success-bg text-success-text',
  returned:    'bg-success-bg text-success-text',
  archived:    'bg-neutral-bg text-neutral-text',
  expired:     'bg-neutral-bg text-neutral-text',
  submitted:   'bg-info-bg text-info-text',
  under_review:'bg-warning-bg text-warning-text',
  approved:    'bg-success-bg text-success-text',
  collected:   'bg-success-bg text-success-text',
  scheduled:   'bg-info-bg text-info-text',
  overdue:     'bg-danger-bg text-danger-text',
}

export const PRIORITY_STYLE = {
  low:      'bg-neutral-bg text-neutral-text',
  medium:   'bg-info-bg text-info-text',
  high:     'bg-warning-bg text-warning-text',
  critical: 'bg-danger-bg text-danger-text',
}

/** Must stay in step with backend STATE_COLOURS. */
export const TWIN_STATE = {
  healthy:             { colour: '#10b981', label: 'Healthy' },
  warning:             { colour: '#f59e0b', label: 'Warning' },
  fault:               { colour: '#ef4444', label: 'Fault' },
  under_maintenance:   { colour: '#3b82f6', label: 'Under Maintenance' },
  inspection_required: { colour: '#8b5cf6', label: 'Inspection Required' },
  decommissioned:      { colour: '#94a3b8', label: 'Decommissioned' },
}
