import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Boxes, CircleCheck, TriangleAlert, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, Metric, MetricRow, Spinner, Widget } from '@/components/ui'
import { api } from '@/lib/api'
import { titleCase } from '@/lib/format'

/* ========================= Work order configuration ========================= */
const WHO = {
  manager: { text: 'Manager / admin', cls: 'bg-warning-bg text-warning-text' },
  technician_or_manager: { text: 'Technician', cls: 'bg-info-bg text-info-text' },
}

export function AdminWorkOrderConfig() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['workorder-config'], queryFn: () => api.get('/admin/workorder-config'),
  })

  if (isLoading) return <Spinner label="Loading work order flow…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const active = data.statuses.filter((s) => !s.terminal)
  const terminal = data.statuses.filter((s) => s.terminal)

  return (
    <div className="space-y-5">
      <Widget
        title={<span className="flex items-center gap-2"><Workflow size={17} /> Work Order Lifecycle</span>}
        subtitle="Each stage, the moves allowed from it, who may make them, and what the reporter sees"
      >
        <div className="space-y-2">
          {active.map((s) => (
            <div key={s.status} className="rounded border border-border-subtle p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-full sm:w-52 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body-md font-medium text-ink">{titleCase(s.status)}</span>
                    {s.count > 0 && <span className="pill bg-info-bg text-info-text tabular">{s.count}</span>}
                  </div>
                  {s.complaint_shows && (
                    <p className="text-body-sm text-ink-faint mt-0.5">
                      Reporter sees: <span className="text-ink-muted">{titleCase(s.complaint_shows)}</span>
                    </p>
                  )}
                </div>
                <ArrowRight size={15} className="text-ink-faint shrink-0 mt-1 hidden sm:block" />
                <div className="flex flex-wrap gap-2 min-w-0">
                  {s.next.map((n) => (
                    <span key={n.status}
                          className={`inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-body-sm ${
                            n.primary ? 'border-secondary text-ink' : 'border-border-subtle text-ink-muted'
                          }`}>
                      {titleCase(n.status)}
                      <span className={`pill text-[11px] ${WHO[n.who].cls}`}>{WHO[n.who].text}</span>
                      {n.note && <span className="text-[11px] text-ink-faint">· {n.note}</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-body-sm text-ink-faint mt-3">
          Outlined step = the main button on the work order page. "Technician" steps can also be taken by a manager or admin.
        </p>

        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-label-caps uppercase text-ink-muted mb-2">Final states</p>
          <div className="flex flex-wrap gap-2">
            {terminal.map((s) => (
              <span key={s.status} className="pill bg-surface-sunken text-ink-muted">
                {titleCase(s.status)}
                {s.count > 0 && <span className="tabular ml-1">· {s.count}</span>}
              </span>
            ))}
          </div>
        </div>
      </Widget>

      <Widget title="Rules the system enforces" subtitle="Checked by the API, not just hidden in the page">
        <ul className="space-y-2">
          {data.rules.map((r) => (
            <li key={r} className="flex gap-2 text-body-md text-ink">
              <CircleCheck size={16} className="text-success shrink-0 mt-0.5" /> {r}
            </li>
          ))}
        </ul>
      </Widget>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title="By category" subtitle="All work orders, grouped by the complaint's category" bodyClass="p-0">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Category</th><th className="text-right">Total</th><th className="text-right">Open</th>
                         <th className="text-right">SLA missed</th><th className="text-right">Avg time</th></tr></thead>
              <tbody>
                {data.by_category.map((d) => (
                  <tr key={d.category}>
                    <td className="text-ink">{d.category}</td>
                    <td className="text-right tabular">{d.total}</td>
                    <td className="text-right tabular">{d.open || '—'}</td>
                    <td className={`text-right tabular ${d.breached > 0 ? 'text-danger-text font-medium' : ''}`}>
                      {d.breached || '—'}
                    </td>
                    <td className="text-right tabular">{d.avg_minutes ? `${d.avg_minutes}m` : '—'}</td>
                  </tr>
                ))}
                {data.by_category.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-ink-faint py-8">No work orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Widget>

        <Widget title="Technician load" subtitle="Who handles what, and how much is on their plate" bodyClass="p-0">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Technician</th><th>Handles</th><th className="text-right">Open</th>
                         <th className="text-right">Done (30d)</th></tr></thead>
              <tbody>
                {data.technician_load.map((t) => (
                  <tr key={t.name}>
                    <td className="text-ink">{t.name}</td>
                    <td className="text-ink-muted text-body-sm">
                      {t.categories.length ? t.categories.join(', ') : <span className="text-danger-text">No categories — never auto-assigned</span>}
                    </td>
                    <td className="text-right tabular">
                      <span className={t.open_work_orders > 5 ? 'text-warning-text font-medium' : ''}>
                        {t.open_work_orders}
                      </span>
                    </td>
                    <td className="text-right tabular">{t.completed_30d}</td>
                  </tr>
                ))}
                {data.technician_load.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-ink-faint py-8">No active technicians.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Widget>
      </div>
    </div>
  )
}

/* ======================== Digital twin configuration ======================== */
export function AdminTwinConfig() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['twin-config'], queryFn: () => api.get('/admin/twin-config'),
  })

  if (isLoading) return <Spinner label="Checking spatial data…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const c = data.coverage
  const gaps = [
    ['Rooms without an outline', c.rooms_unmapped, 'cannot be drawn on a floor plan'],
    ['Assets without a position', c.assets_unplaced, 'exist but never appear as a marker'],
    ['Assets with no room', c.orphan_assets, 'are absent from the twin entirely'],
    ['Buildings without map coordinates', c.buildings_unpositioned, 'are missing from the campus map'],
  ].filter(([, n]) => n > 0)

  return (
    <div className="space-y-5">
      <MetricRow>
        <Metric label="Rooms mapped" value={`${c.rooms_mapped_pct}%`}
                accent={c.rooms_mapped_pct === 100 ? '#10b981' : '#f59e0b'} />
        <Metric label="Assets placed" value={`${c.assets_placed_pct}%`}
                accent={c.assets_placed_pct === 100 ? '#10b981' : '#f59e0b'} />
        <Metric label="Floors" value={data.floors.length} accent="#3b82f6" icon={Boxes} />
        <Metric label="Plan images"
                value={`${data.floors.filter((f) => f.has_plan_image).length}/${data.floors.length}`}
                accent="#8b5cf6" />
      </MetricRow>

      <Widget title="Spatial data health"
              subtitle="Anything listed here exists in the database but cannot be drawn">
        {gaps.length === 0 ? (
          <div className="flex items-center gap-3 py-2">
            <CircleCheck size={20} className="text-success" />
            <p className="text-body-lg text-ink">
              Everything is mapped — every room has an outline and every asset a position.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {gaps.map(([label, n, consequence]) => (
              <div key={label}
                   className="flex items-start gap-3 rounded border border-warning-border bg-warning-bg p-3">
                <TriangleAlert size={17} className="text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-body-md text-ink">
                    <strong className="tabular">{n}</strong> {label.toLowerCase()}
                  </p>
                  <p className="text-body-sm text-ink-muted">They {consequence}.</p>
                </div>
              </div>
            ))}
            <p className="text-body-md text-ink-muted pt-1">
              Fix these in the{' '}
              <Link to="/admin/floor-plans" className="text-secondary hover:underline">
                Floor Plan editor
              </Link>.
            </p>
          </div>
        )}
      </Widget>

      <Widget title="Marker colours"
              subtitle="Shared by the backend and the twin renderer, so exports and the map always agree">
        <div className="flex flex-wrap gap-3">
          {data.legend.map((l) => (
            <div key={l.state} className="flex items-center gap-2 rounded border border-border-subtle px-3 py-2">
              <span className="w-3 h-3 rounded-full ring-2 ring-white" style={{ background: l.colour }} />
              <span className="text-body-md text-ink">{l.label}</span>
              <code className="font-mono text-[11px] text-ink-faint">{l.colour}</code>
            </div>
          ))}
        </div>
      </Widget>

      <Widget title="Floors" subtitle="Coverage per floor" bodyClass="p-0">
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr><th>Building</th><th>Floor</th><th className="text-right">Level</th>
                       <th className="text-right">Rooms</th><th>Plan image</th><th /></tr></thead>
            <tbody>
              {data.floors.map((f) => (
                <tr key={f.floor_id}>
                  <td>
                    <span className="font-mono text-mono-data text-secondary">{f.building_code}</span>
                    <span className="text-ink-muted ml-2">{f.building}</span>
                  </td>
                  <td className="text-ink">{f.floor}</td>
                  <td className="text-right tabular">{f.level}</td>
                  <td className={`text-right tabular ${f.rooms === 0 ? 'text-ink-faint' : ''}`}>
                    {f.rooms || '—'}
                  </td>
                  <td>
                    {f.has_plan_image
                      ? <span className="pill bg-success-bg text-success-text text-body-sm">uploaded</span>
                      : <span className="text-body-sm text-ink-faint">none</span>}
                  </td>
                  <td>
                    <Link to="/admin/floor-plans" className="btn-ghost btn-sm">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>
    </div>
  )
}
