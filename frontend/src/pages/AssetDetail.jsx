import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleDot, History, MapPin, ShieldCheck, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Button,
  ErrorState,
  Field,
  Modal,
  Select,
  Spinner,
  StatusPill,
  Textarea,
  Widget,
  toast,
} from '@/components/ui'
import { api } from '@/lib/api'
import { TWIN_STATE, ago, dt, money, titleCase } from '@/lib/format'
import { useAuth } from '@/lib/auth'

export default function AssetDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { isStaff } = useAuth()
  const [stateOpen, setStateOpen] = useState(false)
  const [form, setForm] = useState({})

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => api.get(`/campus/assets/${id}`),
  })

  const setState = useMutation({
    mutationFn: () => api.patch(`/campus/assets/${id}/state`, {
      state: form.state, reason: form.reason?.trim() || null,
    }),
    onSuccess: (d) => {
      toast.success(d.detail)
      setStateOpen(false); setForm({})
      qc.invalidateQueries({ queryKey: ['asset', id] })
      qc.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (err) => toast.error(err.detail || 'Could not update the asset'),
  })

  if (isLoading) return <Spinner label="Loading asset…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const a = data.asset
  const totalSpend = (data.maintenance_history || []).reduce((s, w) => s + (w.cost || 0), 0)

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/assets" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to registry
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-mono-data text-secondary">{a.tag}</span>
            <span className="pill" style={{
              background: `${data.state_colour}1a`, color: data.state_colour }}>
              <CircleDot size={12} /> {data.state_label}
            </span>
            {data.open_issues.length > 0 && (
              <span className="pill bg-danger-bg text-danger-text">
                {data.open_issues.length} open issue{data.open_issues.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <h1 className="text-headline-lg text-ink mt-2">{a.name}</h1>
          {data.room && (
            <p className="text-body-md text-ink-muted mt-1 flex items-center gap-1.5">
              <MapPin size={14} /> {data.room.name}
              <span className="font-mono text-mono-data text-ink-faint">
                {data.room.zone_id || data.room.code}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/twin" className="btn-secondary">View on twin</Link>
          {isStaff() && (
            <Button icon={Wrench} onClick={() => { setForm({ state: a.state }); setStateOpen(true) }}>
              Change condition
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="space-y-5">
          <Widget title="Specification">
            <dl className="space-y-3">
              <Row label="Asset tag" value={<span className="font-mono text-mono-data">{a.tag}</span>} />
              <Row label="Manufacturer" value={a.manufacturer} />
              <Row label="Model" value={a.model} />
              <Row label="Serial" value={a.serial_no && <span className="font-mono text-mono-data">{a.serial_no}</span>} />
              <Row label="Condition" value={
                <span style={{ color: data.state_colour }}>{data.state_label}</span>} />
            </dl>
          </Widget>

          <Widget title={<span className="flex items-center gap-2"><ShieldCheck size={17} /> Lifecycle</span>}>
            <dl className="space-y-3">
              <Row label="Warranty" value={
                a.warranty_expiry ? (
                  <span className={new Date(a.warranty_expiry) < new Date() ? 'text-danger-text' : ''}>
                    {dt(a.warranty_expiry, 'd MMM yyyy')}
                    {new Date(a.warranty_expiry) < new Date() && ' (expired)'}
                  </span>
                ) : null
              } />
              <Row label="Last service" value={a.last_service_at
                ? `${dt(a.last_service_at, 'd MMM yyyy')} · ${ago(a.last_service_at)}`
                : 'No record'} />
              <Row label="Maintenance jobs" value={data.maintenance_history.length} />
              <Row label="Total spend" value={totalSpend > 0
                ? <span className="tabular">{money(totalSpend)}</span> : null} />
            </dl>
          </Widget>
        </div>

        <div className="lg:col-span-2 space-y-5">
          {data.open_issues.length > 0 && (
            <Widget title="Open Issues" bodyClass="p-0">
              <div className="divide-y divide-border-subtle">
                {data.open_issues.map((i) => (
                  <Link key={i.id} to={`/issues/${i.id}`}
                        className="flex items-center justify-between gap-3 px-widget py-3 hover:bg-surface-sunken transition-colors">
                    <div className="min-w-0">
                      <span className="font-mono text-mono-data text-secondary">{i.reference}</span>
                      <p className="text-body-md text-ink truncate">{i.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={i.priority} />
                      <StatusPill status={i.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </Widget>
          )}

          <Widget
            title={<span className="flex items-center gap-2"><History size={17} /> Condition History</span>}
            subtitle="Every recorded state change, newest first"
            bodyClass="p-0"
          >
            {data.condition_history.length === 0 ? (
              <p className="text-body-md text-ink-faint text-center py-10">
                No state changes recorded yet.
              </p>
            ) : (
              <ol className="p-widget space-y-0">
                {data.condition_history.map((h, i) => {
                  const last = i === data.condition_history.length - 1
                  const colour = TWIN_STATE[h.to]?.colour || '#94a3b8'
                  return (
                    <li key={i} className="flex gap-3 pb-4 last:pb-0 relative">
                      {!last && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-border-subtle" />}
                      <span className="w-3.5 h-3.5 rounded-full mt-1 shrink-0 z-10 ring-2 ring-white"
                            style={{ background: colour }} />
                      <div className="min-w-0">
                        <p className="text-body-md text-ink">
                          {h.from
                            ? <>{TWIN_STATE[h.from]?.label || titleCase(h.from)} → <strong>{TWIN_STATE[h.to]?.label || titleCase(h.to)}</strong></>
                            : <strong>{TWIN_STATE[h.to]?.label || titleCase(h.to)}</strong>}
                        </p>
                        {h.reason && <p className="text-body-sm text-ink-muted">{h.reason}</p>}
                        <p className="text-body-sm text-ink-faint mt-0.5">
                          {dt(h.at)} · {ago(h.at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Widget>

          <Widget
            title={<span className="flex items-center gap-2"><Wrench size={17} /> Maintenance History</span>}
            bodyClass="p-0"
          >
            {data.maintenance_history.length === 0 ? (
              <p className="text-body-md text-ink-faint text-center py-10">
                No work orders raised against this asset.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr><th>Reference</th><th>Task</th><th>Status</th>
                        <th>Completed</th><th className="text-right">Cost</th></tr>
                  </thead>
                  <tbody>
                    {data.maintenance_history.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <Link to={`/work-orders/${w.id}`}
                                className="font-mono text-mono-data text-secondary hover:underline">
                            {w.reference}
                          </Link>
                        </td>
                        <td className="text-ink max-w-xs truncate">{w.title}</td>
                        <td><StatusPill status={w.status} /></td>
                        <td className="text-ink-muted whitespace-nowrap">
                          {w.completed_at ? dt(w.completed_at, 'd MMM yyyy') : '—'}
                        </td>
                        <td className="text-right tabular">
                          {w.cost > 0 ? money(w.cost) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Widget>
        </div>
      </div>

      <Modal
        open={stateOpen} onClose={() => setStateOpen(false)}
        title={`Change condition — ${a.tag}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStateOpen(false)}>Cancel</Button>
            <Button loading={setState.isPending} disabled={form.state === a.state}
                    onClick={() => setState.mutate()}>Update</Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted mb-4">
          This is recorded in the condition history and pushed live to every open
          Digital Twin.
        </p>
        <div className="space-y-4">
          <Field label="Condition" required>
            <Select value={form.state || a.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}>
              {Object.entries(TWIN_STATE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" hint="Appears on the condition history">
            <Textarea value={form.reason || ''}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="e.g. Replaced lamp module; tested and working." />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-body-md text-ink-muted shrink-0">{label}</dt>
      <dd className="text-body-md text-ink text-right min-w-0">{value ?? '—'}</dd>
    </div>
  )
}
