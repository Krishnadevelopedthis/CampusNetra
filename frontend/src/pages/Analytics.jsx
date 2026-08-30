import { useMutation, useQuery } from '@tanstack/react-query'
import { Cpu, Download, Flame, Play, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'

import {
  Button,
  ErrorState,
  Field,
  Input,
  Metric,
  RefreshButton,
  Select,
  Spinner,
  Widget,
  toast,
} from '@/components/ui'
import { SkeletonChart, SkeletonMetrics, SkeletonWidget } from '@/components/Skeletons'
import { useChartTheme } from '@/hooks/useChartTheme'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { money, titleCase } from '@/lib/format'



export default function Analytics({ defaultTab = 'overview' }) {
  const [days, setDays] = useState(30)
  // Simulation has its own sidebar entry and therefore its own route, so which
  // tab opens depends on how the page was reached.
  const [tab, setTab] = useState(defaultTab)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.get('/analytics/overview', { params: { days } }),
  })
  const technicians = useQuery({
    queryKey: ['tech-performance', days],
    queryFn: () => api.get('/analytics/technicians', { params: { days } }),
    enabled: tab === 'technicians',
  })

  const { refresh, refreshing } = useRefresh(refetch, technicians.refetch)
  const busy = isLoading || refreshing

  if (error && !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Analytics & Reports</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Operational performance over the last {days} days.
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </Select>
          <Button variant="secondary" icon={Download}
                  onClick={() => window.print()}>Export</Button>
        </div>
      </header>

      <div className="strip-scroll no-print">
        <div className="flex p-1 bg-surface-sunken rounded-lg w-fit">
        {[['overview', 'Overview'], ['technicians', 'Technicians'], ['simulation', 'Simulation']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={`h-9 px-4 rounded text-body-md font-medium transition-colors ${
                    tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                  }`}>{label}</button>
        ))}
        </div>
      </div>

      {tab === 'overview' && (
        busy || !data ? (
          <>
            <SkeletonMetrics />
            <div className="grid md:grid-cols-2 gap-4">
              <SkeletonChart />
              <SkeletonChart />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <SkeletonWidget lines={5} />
              <SkeletonWidget lines={5} />
            </div>
          </>
        ) : <Overview data={data} />
      )}
      {tab === 'technicians' && <Technicians query={technicians} />}
      {tab === 'simulation' && <SimulationPanel />}
    </div>
  )
}

function Overview({ data }) {
  const chart = useChartTheme()
  const categoryData = data.issues.by_category.slice(0, 8)
  const statusData = Object.entries(data.issues.by_status)
    .map(([name, value]) => ({ name: titleCase(name), value }))
    .filter((d) => d.value > 0)

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Total issues" value={data.issues.total} accent="rgb(var(--c-brand))" />
        <Metric label="Currently open" value={data.issues.open} accent="#f59e0b" />
        <Metric label="SLA compliance" value={`${data.sla.compliance_pct}%`}
                accent={data.sla.compliance_pct >= 90 ? '#10b981' : '#f59e0b'} />
        <Metric label="Mean time to resolve"
                value={data.sla.mttr_hours != null ? `${data.sla.mttr_hours}h` : '—'} accent="#3b82f6" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title="Issues by Category">
          {categoryData.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">No data in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110}
                       tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={chart.categories[i % chart.categories.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Widget>

        <Widget title="Status Distribution">
          {statusData.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">No data in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name"
                     innerRadius={62} outerRadius={100} paddingAngle={2}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={chart.categories[i % chart.categories.length]} />
                  ))}
                </Pie>
                <Tooltip {...chart.tooltip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: chart.axis }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Widget>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title={<span className="flex items-center gap-2"><Flame size={17} className="text-warning" /> Campus Hotspots</span>}
                subtitle="Rooms generating the most complaints" bodyClass="p-0">
          {data.hotspots.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">No hotspots identified.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Room</th><th>Building</th><th className="text-right">Issues</th></tr></thead>
                <tbody>
                  {data.hotspots.map((h) => (
                    <tr key={h.room_code}>
                      <td>
                        <span className="font-mono text-mono-data">{h.room_code}</span>
                        <span className="text-ink-muted ml-2">{h.room_name}</span>
                      </td>
                      <td className="text-ink-muted">{h.building}</td>
                      <td className="text-right tabular font-medium">{h.issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Widget>

        <Widget title={<span className="flex items-center gap-2"><TrendingUp size={17} /> Recurring Problem Assets</span>}
                subtitle="Repeat faults — candidates for replacement" bodyClass="p-0">
          {data.recurring_assets.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">
              No asset has failed more than once in this window.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Asset</th><th>Name</th><th className="text-right">Faults</th></tr></thead>
                <tbody>
                  {data.recurring_assets.map((a) => (
                    <tr key={a.tag}>
                      <td className="font-mono text-mono-data text-secondary">{a.tag}</td>
                      <td className="text-ink-muted">{a.name}</td>
                      <td className="text-right tabular font-medium text-danger-text">{a.fault_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Widget>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Deliberately a different number from Maintenance & Expenses, which
            counts only signed-off work and dates it by completion. This card is
            about the window the rest of the page covers and includes jobs still
            running, so both say which they are rather than appearing to
            contradict each other. */}
        <Widget
          title="Maintenance Cost"
          subtitle={`Work raised in the last ${data.window_days} days`}
          className="lg:col-span-1"
        >
          <dl className="space-y-3">
            <div className="flex justify-between"><dt className="text-ink-muted">Labour</dt>
              <dd className="tabular">{money(data.cost.labour)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Parts</dt>
              <dd className="tabular">{money(data.cost.parts)}</dd></div>
            <div className="flex justify-between pt-3 border-t border-border-subtle">
              <dt className="font-medium">Total</dt>
              <dd className="text-headline-md tabular">{money(data.cost.total)}</dd>
            </div>
            {data.cost.in_progress > 0 && (
              <p className="text-body-sm text-ink-faint pt-1">
                {money(data.cost.settled)} signed off; {money(data.cost.in_progress)} on
                jobs still open. Administration → Maintenance &amp; Expenses counts the
                signed-off figure only.
              </p>
            )}
          </dl>
        </Widget>

        <Widget title="Department Load" className="lg:col-span-2" bodyClass="p-0">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Department</th><th className="text-right">Total</th><th className="text-right">Open</th></tr></thead>
              <tbody>
                {data.issues.by_department.map((d) => (
                  <tr key={d.name}>
                    <td className="text-ink">{d.name}</td>
                    <td className="text-right tabular">{d.total}</td>
                    <td className="text-right tabular font-medium text-warning-text">{d.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      </div>
    </>
  )
}

function Technicians({ query }) {
  if (query.isLoading) return <Spinner label="Loading technician performance…" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <Widget title="Technician Performance" bodyClass="p-0">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Technician</th><th>Department</th>
              <th className="text-right">Assigned</th><th className="text-right">Completed</th>
              <th className="text-right">Completion</th><th className="text-right">Breached</th>
              <th className="text-right">Avg time</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((t) => (
              <tr key={t.id}>
                <td className="text-ink">{t.name}</td>
                <td className="text-ink-muted">{t.department || '—'}</td>
                <td className="text-right tabular">{t.assigned}</td>
                <td className="text-right tabular">{t.completed}</td>
                <td className="text-right tabular">
                  {t.completion_rate != null ? `${t.completion_rate}%` : '—'}
                </td>
                <td className={`text-right tabular ${t.breached > 0 ? 'text-danger-text font-medium' : ''}`}>
                  {t.breached}
                </td>
                <td className="text-right tabular">{t.avg_minutes ? `${t.avg_minutes}m` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Widget>
  )
}

/* ---------------- Scenario simulation ---------------- */
function SimulationPanel() {
  const chart = useChartTheme()
  const [config, setConfig] = useState({
    name: 'Complaint surge', complaint_count: 30,
    hours_available: 8, avg_minutes_per_job: 45,
  })
  const [result, setResult] = useState(null)

  const run = useMutation({
    mutationFn: () => api.post('/analytics/simulate', config),
    onSuccess: (d) => {
      if (d.error) return toast.error(d.error)
      setResult(d)
      toast.success('Simulation complete.')
    },
    onError: (err) => toast.error(err.detail || 'Simulation failed'),
  })

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <Widget title={<span className="flex items-center gap-2"><Cpu size={17} /> Configuration</span>}>
        <div className="space-y-4">
          <Field label="Scenario name">
            <Input value={config.name} onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} />
          </Field>
          <Field label="Simultaneous complaints" hint="How many arrive at once">
            <Input type="number" min="1" max="500" value={config.complaint_count}
                   onChange={(e) => setConfig((c) => ({ ...c, complaint_count: Number(e.target.value) }))} />
          </Field>
          <Field label="Shift length (hours)">
            <Input type="number" min="1" max="24" value={config.hours_available}
                   onChange={(e) => setConfig((c) => ({ ...c, hours_available: Number(e.target.value) }))} />
          </Field>
          <Field label="Average minutes per job">
            <Input type="number" min="5" max="480" value={config.avg_minutes_per_job}
                   onChange={(e) => setConfig((c) => ({ ...c, avg_minutes_per_job: Number(e.target.value) }))} />
          </Field>
          <Button icon={Play} loading={run.isPending} className="w-full"
                  onClick={() => run.mutate()}>Run simulation</Button>
        </div>
      </Widget>

      {!result ? (
        <Widget>
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-lg bg-surface-sunken grid place-items-center mx-auto mb-4">
              <Cpu size={22} className="text-ink-faint" />
            </div>
            <h3 className="text-headline-md">What if it all happens at once?</h3>
            <p className="text-body-md text-ink-faint mt-1 max-w-md mx-auto">
              Fan N hypothetical complaints through AI classification, department routing
              and technician capacity to see where the campus would break.
            </p>
          </div>
        </Widget>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Complaints" value={result.complaint_count} accent="rgb(var(--c-brand))" />
            <Metric label="Total capacity" value={result.capacity.total_capacity} accent="#3b82f6" />
            <Metric label="Backlog" value={result.capacity.total_backlog}
                    accent={result.capacity.total_backlog > 0 ? '#ef4444' : '#10b981'} />
            <Metric label="Projected SLA" value={`${result.sla_projection.projected_compliance_pct}%`}
                    accent={result.sla_projection.projected_compliance_pct >= 90 ? '#10b981' : '#f59e0b'} />
          </div>

          <Widget title="AI Classification → Department Routing" bodyClass="p-0">
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Department</th><th className="text-right">Issues</th>
                    <th className="text-right">Technicians</th><th className="text-right">Capacity</th>
                    <th className="text-right">Utilisation</th><th className="text-right">Backlog</th>
                  </tr>
                </thead>
                <tbody>
                  {result.by_department.map((d) => (
                    <tr key={d.department} className={d.at_risk ? 'bg-danger-bg/40' : ''}>
                      <td className="text-ink">{d.department}</td>
                      <td className="text-right tabular">{d.issues}</td>
                      <td className="text-right tabular">{d.technicians}</td>
                      <td className="text-right tabular">{d.capacity}</td>
                      <td className="text-right tabular">
                        {d.utilisation_pct != null ? (
                          <span className={d.utilisation_pct > 100 ? 'text-danger-text font-medium'
                            : d.utilisation_pct > 80 ? 'text-warning-text' : ''}>
                            {d.utilisation_pct}%
                          </span>
                        ) : <span className="text-ink-faint">no capacity</span>}
                      </td>
                      <td className={`text-right tabular ${d.backlog > 0 ? 'text-danger-text font-medium' : ''}`}>
                        {d.backlog}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>

          <div className="grid md:grid-cols-2 gap-4">
            <Widget title="Category Fan-out">
              <div className="space-y-2">
                {result.by_category.map((c, i) => (
                  <div key={c.code} className="flex items-center gap-3">
                    <span className="text-body-md text-ink-muted w-36 truncate">{c.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{
                             width: `${(c.count / result.complaint_count) * 100}%`,
                             background: chart.categories[i % chart.categories.length],
                           }} />
                    </div>
                    <span className="tabular text-body-md w-8 text-right">{c.count}</span>
                  </div>
                ))}
              </div>
            </Widget>

            <Widget title="SLA Prediction">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Expected met</span>
                  <span className="tabular text-success-text font-medium">
                    {result.sla_projection.expected_met}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Expected breached</span>
                  <span className="tabular text-danger-text font-medium">
                    {result.sla_projection.expected_breached}
                  </span>
                </div>
                <div className="flex justify-between pt-3 border-t border-border-subtle">
                  <span className="font-medium">Projected compliance</span>
                  <span className="text-headline-md tabular">
                    {result.sla_projection.projected_compliance_pct}%
                  </span>
                </div>
                {result.bottlenecks.length > 0 && (
                  <div className="pt-3 border-t border-border-subtle">
                    <p className="text-label-caps uppercase text-ink-muted mb-2">Bottlenecks</p>
                    {result.bottlenecks.map((b) => (
                      <p key={b.department} className="text-body-md text-danger-text">
                        {b.department}: +{b.backlog} over capacity
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Widget>
          </div>
        </div>
      )}
    </div>
  )
}
