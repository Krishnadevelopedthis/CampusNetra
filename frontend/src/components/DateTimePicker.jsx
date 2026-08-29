import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** `YYYY-MM-DDTHH:mm` in local time — the shape a datetime-local input uses. */
function toLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parse(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Monday-first grid of the weeks touching `month`. */
function monthGrid(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function describe(date) {
  if (!date) return null
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay(date, today)) return `Today at ${time}`
  if (sameDay(date, yesterday)) return `Yesterday at ${time}`
  return `${date.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })} at ${time}`
}

/**
 * Calendar + clock in a popover, replacing `<input type="datetime-local">`.
 *
 * The native control is inconsistent across browsers (Safari in particular
 * renders a cramped spinner), and it cannot express the thing people actually
 * reach for here: "this happened a couple of hours ago". The presets answer
 * that in one click, and the calendar stays available for anything older.
 */
export function DateTimePicker({
  value, onChange, max, min, error, id, placeholder = 'Pick a date and time',
}) {
  const selected = parse(value)
  const maxDate = parse(max)
  const minDate = parse(min)

  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => selected || new Date())
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (selected) setMonth(selected) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => monthGrid(month), [month])

  const outOfRange = (d) => {
    if (maxDate && d > maxDate) return true
    if (minDate && d < minDate) return true
    return false
  }

  const commit = (next) => {
    if (maxDate && next > maxDate) next = maxDate
    if (minDate && next < minDate) next = minDate
    onChange(toLocalValue(next))
  }

  const pickDay = (day) => {
    const next = new Date(day)
    const base = selected || new Date()
    next.setHours(base.getHours(), base.getMinutes(), 0, 0)
    commit(next)
  }

  const pickTime = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    const next = new Date(selected || new Date())
    next.setHours(h || 0, m || 0, 0, 0)
    commit(next)
  }

  const presets = [
    ['Just now', () => new Date()],
    ['An hour ago', () => new Date(Date.now() - 3600e3)],
    ['This morning', () => { const d = new Date(); d.setHours(9, 0, 0, 0); return d }],
    ['Yesterday', () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(12, 0, 0, 0); return d }],
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" id={id}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'input flex items-center gap-2.5 text-left',
          error && 'input-error',
          !selected && 'text-ink-faint',
        )}
      >
        <CalendarDays size={16} className="text-ink-faint shrink-0" />
        <span className="truncate">{describe(selected) || placeholder}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[310px] bg-surface border border-border-subtle rounded-xl shadow-popover p-3 animate-slide-up">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map(([label, make]) => {
              const d = make()
              return (
                <button
                  key={label} type="button"
                  disabled={outOfRange(d)}
                  onClick={() => { commit(d); setOpen(false) }}
                  className="px-2.5 h-7 rounded-lg bg-surface-sunken text-body-sm text-ink-muted
                             hover:bg-secondary hover:text-white transition-colors
                             disabled:opacity-40 disabled:pointer-events-none"
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button
              type="button" aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="btn-ghost h-7 w-7 p-0 rounded-lg"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-body-md font-medium text-ink">
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </span>
            <button
              type="button" aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="btn-ghost h-7 w-7 p-0 rounded-lg"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map((d) => (
              <span key={d} className="text-label-caps uppercase text-ink-faint text-center py-1">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const otherMonth = d.getMonth() !== month.getMonth()
              const disabled = outOfRange(d)
              const isSelected = sameDay(d, selected)
              const isToday = sameDay(d, new Date())
              return (
                <button
                  key={d.toISOString()} type="button"
                  disabled={disabled}
                  onClick={() => pickDay(d)}
                  className={clsx(
                    'h-8 rounded-lg text-body-sm tabular transition-colors',
                    isSelected
                      ? 'bg-secondary-600 text-white font-semibold'
                      : disabled
                        ? 'text-ink-faint/40 cursor-not-allowed'
                        : otherMonth
                          ? 'text-ink-faint hover:bg-surface-sunken'
                          : 'text-ink hover:bg-surface-sunken',
                    isToday && !isSelected && 'ring-1 ring-inset ring-secondary',
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
            <Clock size={15} className="text-ink-faint shrink-0" />
            <input
              type="time"
              value={selected ? toLocalValue(selected).slice(11) : ''}
              onChange={(e) => pickTime(e.target.value)}
              className="input h-8 flex-1"
            />
            <button type="button" onClick={() => setOpen(false)} className="btn-primary btn-sm">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
