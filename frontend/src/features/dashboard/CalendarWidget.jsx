import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, PlusCircle, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button, Field, Input, Modal, Select, StatusPill, Widget, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A 6-row grid so every month lays out identically (no layout jump between
// a 4-row and 6-row month) — leading/trailing days from the neighbouring
// months are shown dimmed, matching every other calendar UI convention.
function buildGrid(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

function QuickCreateWorkOrder({ dayIso, onDone }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const create = useMutation({
    mutationFn: () => api.post('/work-orders', {
      title: title.trim(),
      scheduled_for: new Date(`${dayIso}T09:00:00`).toISOString(),
    }),
    onSuccess: (wo) => {
      toast.success(`${wo.reference} created.`)
      qc.invalidateQueries({ queryKey: ['dashboard-calendar'] })
      setTitle('')
      onDone()
    },
    onError: (err) => toast.error(err.detail || 'Could not create work order'),
  })
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 3) create.mutate() }}
      className="flex items-end gap-2"
    >
      <Field label="New work order" className="flex-1">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace AC filter" />
      </Field>
      <Button type="submit" size="sm" icon={Wrench} loading={create.isPending} disabled={title.trim().length < 3}>
        Create
      </Button>
    </form>
  )
}

function QuickCreateInspection({ dayIso, onDone }) {
  const qc = useQueryClient()
  const [templateId, setTemplateId] = useState('')
  const templates = useQuery({ queryKey: ['inspection-templates'], queryFn: () => api.get('/inspections/templates') })
  const create = useMutation({
    mutationFn: () => api.post('/inspections', {
      template_id: templateId,
      scheduled_for: new Date(`${dayIso}T09:00:00`).toISOString(),
    }),
    onSuccess: (insp) => {
      toast.success(`${insp.reference} scheduled.`)
      qc.invalidateQueries({ queryKey: ['dashboard-calendar'] })
      setTemplateId('')
      onDone()
    },
    onError: (err) => toast.error(err.detail || 'Could not schedule inspection'),
  })
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (templateId) create.mutate() }}
      className="flex items-end gap-2"
    >
      <Field label="New inspection" className="flex-1">
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Select a checklist…</option>
          {(templates.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" size="sm" icon={ClipboardCheck} loading={create.isPending} disabled={!templateId}>
        Schedule
      </Button>
    </form>
  )
}

function DayDetailModal({ day, data, onClose }) {
  const { user } = useAuth()
  const canSchedule = ['facility_manager', 'admin', 'super_admin'].includes(user?.role)
  if (!day) return null
  const iso = isoDay(day)
  const entry = data?.days?.[iso] || { issues: [], inspections: [], work_orders: [] }
  const isFuture = iso > isoDay(new Date())
  const total = entry.issues.length + entry.inspections.length + entry.work_orders.length

  return (
    <Modal
      open={!!day}
      onClose={onClose}
      title={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      size="md"
    >
      <div className="space-y-4">
        {total === 0 && (
          <p className="text-body-sm text-ink-faint">Nothing recorded for this day.</p>
        )}

        {entry.issues.length > 0 && (
          <div>
            <p className="text-body-xs font-medium text-ink-faint uppercase tracking-wide mb-1.5">Issues</p>
            <div className="space-y-1.5">
              {entry.issues.map((i) => (
                <Link key={i.id} to={`/issues/${i.id}`} onClick={onClose}
                      className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 hover:bg-surface-hover">
                  <span className="text-body-sm text-ink truncate">{i.title}</span>
                  <StatusPill status={i.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {entry.inspections.length > 0 && (
          <div>
            <p className="text-body-xs font-medium text-ink-faint uppercase tracking-wide mb-1.5">Inspections</p>
            <div className="space-y-1.5">
              {entry.inspections.map((i) => (
                <Link key={i.id} to={`/inspections/${i.id}`} onClick={onClose}
                      className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 hover:bg-surface-hover">
                  <span className="text-body-sm text-ink font-mono">{i.reference}</span>
                  <StatusPill status={i.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {entry.work_orders.length > 0 && (
          <div>
            <p className="text-body-xs font-medium text-ink-faint uppercase tracking-wide mb-1.5">Work Orders</p>
            <div className="space-y-1.5">
              {entry.work_orders.map((w) => (
                <Link key={w.id} to={`/work-orders/${w.id}`} onClick={onClose}
                      className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 hover:bg-surface-hover">
                  <span className="text-body-sm text-ink truncate">{w.title}</span>
                  <StatusPill status={w.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {isFuture && canSchedule && (
          <div className="pt-3 border-t border-border-subtle space-y-3">
            <p className="text-body-xs font-medium text-ink-faint uppercase tracking-wide flex items-center gap-1.5">
              <PlusCircle size={12} /> Schedule something for this day
            </p>
            <QuickCreateWorkOrder dayIso={iso} onDone={() => {}} />
            <QuickCreateInspection dayIso={iso} onDone={() => {}} />
          </div>
        )}

        {isFuture && !canSchedule && (
          <div className="pt-3 border-t border-border-subtle">
            <Link to="/issues/new" onClick={onClose} className="text-body-sm text-secondary hover:underline">
              Report an issue instead →
            </Link>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function CalendarWidget() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDay, setSelectedDay] = useState(null)

  const key = monthKey(cursor)
  const { data } = useQuery({
    queryKey: ['dashboard-calendar', key],
    queryFn: () => api.get('/dashboard/calendar', { params: { month: key } }),
  })

  const grid = useMemo(() => buildGrid(cursor), [cursor])
  const today = isoDay(new Date())

  const shiftMonth = (delta) => setCursor((c) => {
    const next = new Date(c)
    next.setMonth(next.getMonth() + delta)
    return next
  })

  return (
    <>
      <Widget
        title={<span className="flex items-center gap-2"><CalendarDays size={18} className="text-secondary" /> Calendar</span>}
        subtitle="Inspections, work orders and issues by day"
        action={
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md hover:bg-surface-hover" aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="text-body-sm font-medium text-ink w-32 text-center">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-md hover:bg-surface-hover" aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-body-xs text-ink-faint font-medium py-1">{w}</div>
          ))}
          {grid.map((d) => {
            const iso = isoDay(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const entry = data?.days?.[iso]
            const count = entry ? entry.issues.length + entry.inspections.length + entry.work_orders.length : 0
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={clsx(
                  'relative aspect-square rounded-md text-body-sm flex flex-col items-center justify-center gap-0.5 transition-colors',
                  inMonth ? 'text-ink' : 'text-ink-faint/50',
                  iso === today ? 'ring-1 ring-secondary font-semibold' : '',
                  'hover:bg-surface-hover',
                )}
              >
                {d.getDate()}
                {count > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                )}
              </button>
            )
          })}
        </div>
      </Widget>

      <DayDetailModal day={selectedDay} data={data} onClose={() => setSelectedDay(null)} />
    </>
  )
}
