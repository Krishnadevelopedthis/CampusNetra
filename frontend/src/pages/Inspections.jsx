import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarPlus, ClipboardCheck, ClipboardList, Clock,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Field, Metric, Modal, Select, SkeletonRows,
  Spinner, StatusPill, Widget, toast,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { dt } from '@/lib/format'

export default function Inspections() {
  const { isManager } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('active')
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const dashboard = useQuery({
    queryKey: ['inspection-dashboard'],
    queryFn: () => api.get('/inspections/dashboard'),
  })

  const statusFilter = {
    active: ['scheduled', 'in_progress', 'overdue'],
    submitted: ['submitted', 'approved'],
    all: undefined,
  }[tab]

  const list = useQuery({
    queryKey: ['inspections', tab],
    queryFn: () => api.get('/inspections', {
      params: { status: statusFilter, page_size: 50 },
    }),
    keepPreviousData: true,
  })

  const t = dashboard.data?.totals

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Inspections</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Routine checks. A failed critical item raises an issue automatically.
          </p>
        </div>
        {isManager() && (
          <Button icon={CalendarPlus} variant="dark" onClick={() => setScheduleOpen(true)}>
            Schedule inspection
          </Button>
        )}
      </header>

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Scheduled" value={t.scheduled} accent="#3b82f6" />
          <Metric label="Overdue" value={t.overdue}
                  accent={t.overdue > 0 ? '#ef4444' : '#10b981'} />
          <Metric label="Submitted" value={t.submitted} accent="#10b981" />
          <Metric label="Average score"
                  value={t.average_score != null ? `${t.average_score}%` : '—'}
                  accent={t.average_score >= 80 ? '#10b981' : '#f59e0b'} />
        </div>
      )}

      <Widget bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="flex p-1 bg-surface-sunken rounded-lg">
            {[['active', 'Active'], ['submitted', 'Completed'], ['all', 'All']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                      className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                        tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                      }`}>{label}</button>
            ))}
          </div>
        </div>

        {list.isLoading ? <SkeletonRows rows={5} cols={6} />
          : list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.data.items.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No inspections here"
                        description={tab === 'active'
                          ? 'Nothing is scheduled or in progress right now.'
                          : 'Completed inspections will appear here.'} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th><th>Template</th><th>Location</th>
                    <th>Assigned</th><th>Due</th><th>Status</th><th>Score</th><th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-mono-data text-secondary whitespace-nowrap">
                        {i.reference}
                      </td>
                      <td className="text-ink">{i.template_name || '—'}</td>
                      <td className="text-ink-muted whitespace-nowrap">
                        {i.room_name || '—'}
                        {i.asset_tag && (
                          <span className="font-mono text-[11px] text-ink-faint ml-1.5">{i.asset_tag}</span>
                        )}
                      </td>
                      <td className="text-ink-muted">{i.assignee?.full_name || 'Unassigned'}</td>
                      <td className={`whitespace-nowrap ${i.is_overdue ? 'text-danger-text font-medium' : 'text-ink-muted'}`}>
                        {i.is_overdue && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                        {dt(i.scheduled_for, 'd MMM, HH:mm')}
                      </td>
                      <td><StatusPill status={i.status} /></td>
                      <td className="tabular">
                        {i.score != null ? (
                          <span className={i.score >= 80 ? 'text-success-text'
                            : i.score >= 60 ? 'text-warning-text' : 'text-danger-text'}>
                            {i.score}%
                          </span>
                        ) : <span className="text-ink-faint">—</span>}
                      </td>
                      <td>
                        <Link to={`/inspections/${i.id}`} className="btn-ghost btn-sm">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Widget>

      <ScheduleModal
        open={scheduleOpen} onClose={() => setScheduleOpen(false)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['inspections'] })
          qc.invalidateQueries({ queryKey: ['inspection-dashboard'] })
        }}
      />
    </div>
  )
}

function ScheduleModal({ open, onClose, onDone }) {
  const [form, setForm] = useState({})
  const templates = useQuery({
    queryKey: ['inspection-templates'],
    queryFn: () => api.get('/inspections/templates'),
    enabled: open,
  })
  const campuses = useQuery({
    queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses'), enabled: open,
  })
  const buildings = useQuery({
    queryKey: ['buildings', campuses.data?.[0]?.id],
    queryFn: () => api.get(`/campus/campuses/${campuses.data[0].id}/buildings`),
    enabled: open && !!campuses.data?.[0]?.id,
  })
  const floors = useQuery({
    queryKey: ['floors', form.building_id],
    queryFn: () => api.get(`/campus/buildings/${form.building_id}/floors`),
    enabled: !!form.building_id,
  })
  const rooms = useQuery({
    queryKey: ['plan-rooms', form.floor_id],
    queryFn: () => api.get(`/campus/floors/${form.floor_id}/plan`).then((d) => d.rooms),
    enabled: !!form.floor_id,
  })

  const create = useMutation({
    mutationFn: () => api.post('/inspections', {
      template_id: form.template_id,
      room_id: form.room_id || null,
      asset_id: form.asset_id || null,
      assigned_to: form.assigned_to || null,
      scheduled_for: new Date(form.scheduled_for).toISOString(),
    }),
    onSuccess: (i) => {
      toast.success(`${i.reference} scheduled.`)
      setForm({}); onClose(); onDone()
    },
    onError: (err) => toast.error(err.detail || 'Could not schedule'),
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const selectedRoom = rooms.data?.find((r) => r.id === form.room_id)

  return (
    <Modal
      open={open} onClose={onClose} title="Schedule an inspection"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending}
                  disabled={!form.template_id || !form.scheduled_for || !form.room_id}
                  onClick={() => create.mutate()}>Schedule</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Template" required>
          <Select value={form.template_id || ''} onChange={set('template_id')}>
            <option value="">Select a checklist template</option>
            {(templates.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.items.length} checks)
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Building" required>
            <Select value={form.building_id || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f, building_id: e.target.value, floor_id: '', room_id: '', asset_id: '',
                    }))}>
              <option value="">Select building</option>
              {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Floor" required>
            <Select value={form.floor_id || ''} disabled={!form.building_id}
                    onChange={(e) => setForm((f) => ({
                      ...f, floor_id: e.target.value, room_id: '', asset_id: '',
                    }))}>
              <option value="">Select floor</option>
              {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Room" required>
            <Select value={form.room_id || ''} disabled={!form.floor_id}
                    onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value, asset_id: '' }))}>
              <option value="">Select room</option>
              {(rooms.data || []).map((r) => (
                <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Specific asset" hint="Optional — narrows the check to one item">
            <Select value={form.asset_id || ''} disabled={!selectedRoom} onChange={set('asset_id')}>
              <option value="">Whole room</option>
              {(selectedRoom?.assets || []).map((a) => (
                <option key={a.id} value={a.id}>{a.tag} — {a.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Scheduled for" required>
          <input type="datetime-local" className="input"
                 value={form.scheduled_for || ''} onChange={set('scheduled_for')} />
        </Field>
      </div>
    </Modal>
  )
}
