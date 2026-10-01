import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, PlusCircle, Wrench } from 'lucide-react'
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
  const upcoming = useMemo(() => {
    const rows = []
    for (const [date, entry] of Object.entries(data?.days || {})) {
      if (date < today) continue
      for (const item of entry.issues || []) rows.push({ date, type: 'Issue', title: item.title, status: item.status, href: `/issues/${item.id}`, tone: 'bg-secondary' })
      for (const item of entry.inspections || []) rows.push({ date, type: 'Inspection', title: item.reference, status: item.status, href: `/inspections/${item.id}`, tone: 'bg-violet-500' })
      for (const item of entry.work_orders || []) rows.push({ date, type: 'Work order', title: item.title, status: item.status, href: `/work-orders/${item.id}`, tone: 'bg-info' })
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [data, today])

  const shiftMonth = (delta) => setCursor((c) => {
    const next = new Date(c)
    next.setMonth(next.getMonth() + delta)
    return next
  })

  return (
    <>
      <Widget
        title={<span className="flex items-center gap-2"><span className="icon-tile h-8 w-8 rounded-lg"><CalendarDays size={16} /></span> Calendar</span>}
        subtitle="A clear view of campus activity and scheduled work"
        action={
          <div className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-sunken/60 p-1">
            <button type="button" onClick={() => shiftMonth(-1)} className="btn-ghost h-8 w-8 rounded-lg p-0" aria-label="Previous month">
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="min-w-[7.5rem] rounded-lg px-2 py-1.5 text-center text-[clamp(0.72rem,1vw,0.82rem)] font-semibold text-ink transition-colors hover:bg-surface"
            >
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </button>
            <button type="button" onClick={() => shiftMonth(1)} className="btn-ghost h-8 w-8 rounded-lg p-0" aria-label="Next month">
              <ChevronRight size={15} />
            </button>
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-secondary" /> Issues</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet-500" /> Inspections</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-info" /> Work orders</span>
          </div>
          <button type="button" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="text-[11px] font-semibold text-secondary hover:underline">
            Today
          </button>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.75fr)]">
        <div className="min-w-0 rounded-2xl border border-border-subtle/70 bg-surface-sunken/25 p-2.5 sm:p-3">
        <div className="grid grid-cols-7 gap-1.5 text-center sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint sm:text-[11px]">{w}</div>
          ))}
          {grid.map((d) => {
            const iso = isoDay(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const entry = data?.days?.[iso]
            const issueCount = entry?.issues?.length || 0
            const inspectionCount = entry?.inspections?.length || 0
            const workOrderCount = entry?.work_orders?.length || 0
            const count = issueCount + inspectionCount + workOrderCount
            const selected = selectedDay && isoDay(selectedDay) === iso
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDay(d)}
                aria-label={`${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`}
                className={clsx(
                  'group relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-sm transition-all sm:min-h-[66px]',
                  inMonth ? 'border-border-subtle/70 bg-surface/60 text-ink' : 'border-transparent bg-surface-sunken/25 text-ink-faint/45',
                  iso === today ? 'border-secondary/60 bg-secondary/5 font-bold shadow-[0_0_0_3px_rgb(var(--c-secondary)/0.08)]' : '',
                  selected ? 'bg-secondary text-white shadow-level2 hover:bg-secondary' : 'hover:-translate-y-0.5 hover:border-secondary/40 hover:bg-surface hover:shadow-level2',
                )}
              >
                <span className="leading-none">{d.getDate()}</span>
                {count > 0 && (
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    {issueCount > 0 && <i className={clsx('h-1.5 w-1.5 rounded-full', selected ? 'bg-white' : 'bg-secondary')} />}
                    {inspectionCount > 0 && <i className={clsx('h-1.5 w-1.5 rounded-full', selected ? 'bg-white/75' : 'bg-violet-500')} />}
                    {workOrderCount > 0 && <i className={clsx('h-1.5 w-1.5 rounded-full', selected ? 'bg-white/55' : 'bg-info')} />}
                    <span className={clsx('ml-0.5 text-[9px] font-semibold', selected ? 'text-white/80' : 'text-ink-faint')}>{count}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        </div>
        <aside className="min-w-0 rounded-2xl border border-border-subtle/70 bg-surface-sunken/25 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Next up</p>
              <h4 className="mt-1 text-base font-semibold tracking-tight text-ink">Upcoming activity</h4>
            </div>
            <span className="icon-tile h-9 w-9 rounded-xl"><Clock3 size={16} /></span>
          </div>
          {upcoming.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarDays size={22} className="mx-auto text-ink-faint" />
              <p className="mt-3 text-sm font-medium text-ink">Your schedule is clear</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">New issues, inspections and work orders will appear here.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {upcoming.map((item, index) => (
                <Link key={`${item.href}-${index}`} to={item.href} className="group flex items-start gap-3 rounded-xl border border-border-subtle/70 bg-surface/80 p-3 transition-all hover:-translate-y-0.5 hover:border-secondary/40 hover:shadow-level2">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-sunken text-[10px] font-bold leading-none text-ink">
                    <span>{new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
                    <span className="mt-0.5 text-sm">{new Date(`${item.date}T00:00:00`).getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint"><i className={clsx('h-1.5 w-1.5 rounded-full', item.tone)} /> {item.type}</span>
                    <span className="mt-1 block truncate text-sm font-medium text-ink group-hover:text-secondary">{item.title}</span>
                    {item.status && <span className="mt-1 block text-[11px] text-ink-faint">{item.status.replaceAll('_', ' ')}</span>}
                  </span>
                  <ChevronRight size={14} className="mt-2 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-secondary" />
                </Link>
              ))}
            </div>
          )}
        </aside>
        </div>
      </Widget>

      <DayDetailModal day={selectedDay} data={data} onClose={() => setSelectedDay(null)} />
    </>
  )
}
