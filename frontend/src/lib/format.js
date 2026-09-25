import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns'
import { getDisplayPrefs } from './displayPrefs'

export const asDate = (v) => (v instanceof Date ? v : v ? parseISO(v) : null)

export function dt(value, pattern = 'd MMM, HH:mm') {
  const d = asDate(value)
  if (!d || !isValid(d)) return '—'
  // Respect the user's saved "Time format" setting (Settings.jsx) wherever
  // a pattern spells out a 24-hour hour token, whether that pattern is the
  // default above or one a caller passed explicitly — every call site in
  // the app uses the literal 'HH:mm'/'HH' tokens, never a different way of
  // asking for 24-hour time, so this one substitution covers all of them.
  const resolved = getDisplayPrefs().time_format === '12h'
    ? pattern.replace(/HH:mm/g, 'h:mm a').replace(/\bHH\b/g, 'h a')
    : pattern
  return format(d, resolved)
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

/** Labels for Room.kind — icon choice per kind lives with whichever
 * component actually renders one, to keep this file free of UI imports. */
export const ROOM_KIND_LABELS = {
  classroom: 'Classroom',
  lecture_hall: 'Lecture Hall',
  laboratory: 'Laboratory',
  office: 'Office',
  library: 'Library',
  washroom: 'Washroom',
  corridor: 'Corridor',
  cafeteria: 'Cafeteria',
  auditorium: 'Auditorium',
  hostel_room: 'Hostel Room',
  server_room: 'Server Room',
  store: 'Store',
  utility: 'Utility',
  other: 'Other',
}

/** Rough, honest password-strength feedback — length dominates, variety
    helps. Shared by every place a password gets set (register, reset,
    change-password) so the bar means the same thing everywhere. */
export function scorePassword(value) {
  if (!value) return { score: 0, label: '' }
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score += 1
  return {
    score,
    label: ['Too short', 'Weak', 'Reasonable', 'Strong', 'Very strong'][score] || '',
  }
}
