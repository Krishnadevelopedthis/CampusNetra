import { useMutation, useQuery } from '@tanstack/react-query'
import { Cpu, Download, Flame, Play, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'

import {
  CHART_COLORS, ChartContainer, ChartTooltip, ChartTooltipContent, DonutChart, TruncatedTick,
} from '@/components/charts'

import {
  Button,
  ErrorState,
  Field,
  Input,
  Metric,
  MetricRow,  RefreshButton,
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
  const categoryData = data.issues.by_category.slice(0, 8)
    .map((c, i) => ({ ...c, fill: CHART_COLORS[i % CHART_COLORS.length] }))
  const categoryTotal = categoryData.reduce((n, c) => n + c.count, 0)
  const statusData = Object.entries(data.issues.by_status)
    .filter(([, value]) => value > 0)
    .map(([name, value], i) => ({ key: name, label: titleCase(name), value, color: CHART_COLORS[i % CHART_COLORS.length] }))

  return (
    <>
      <MetricRow>
        <Metric label="Total issues" value={data.issues.total} accent="rgb(var(--c-brand))" />
        <Metric label="Currently open" value={data.issues.open} accent="#f59e0b" />
        <Metric label="SLA compliance" value={`${data.sla.compliance_pct}%`}
                accent={data.sla.compliance_pct >= 90 ? '#10b981' : '#f59e0b'} />
        <Metric label="Mean time to resolve"
                value={data.sla.mttr_hours != null ? `${data.sla.mttr_hours}h` : '—'} accent="#3b82f6" />
      </MetricRow>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title="Issues by Category">
          {categoryData.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">No data in this window.</p>
          ) : (
            <ChartContainer config={{ count: { label: 'Issues' } }}
                            style={{ height: Math.max(200, categoryData.length * 40 + 24) }}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={104} axisLine={false} tickLine={false}
                       tick={<TruncatedTick max={14} />} />
                <ChartTooltip
                  cursor={{ radius: 6 }}
                  wrapperStyle={{ zIndex: 30, outline: 'none' }}
                  content={(
                    <ChartTooltipContent
                      labelFormatter={(label) => label}
                      valueFormatter={(v) => `${v} · ${categoryTotal ? Math.round((v / categoryTotal) * 100) : 0}%`}
                    />
                  )}
                />
                <Bar dataKey="count" name="Issues" radius={[0, 6, 6, 0]} maxBarSize={24}
                     activeBar={{ fillOpacity: 0.85 }} animationDuration={600}>
                  {categoryData.map((c) => <Cell key={c.name} fill={c.fill} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </Widget>

        <Widget title="Status Distribution">
          {statusData.length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-10">No data in this window.</p>
          ) : (
            <DonutChart data={statusData} centerLabel="issues" />
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
// The server's limits (SimulationConfig in api/v1/analytics.py): [min, max, label].
const SIM_LIMITS = {
  complaint_count: [1, 500, 'Complaints'],
  hours_available: [1, 24, 'Shift length'],
  avg_minutes_per_job: [5, 480, 'Minutes per job'],
}

function SimulationPanel() {
  const chart = useChartTheme()
  const [config, setConfig] = useState({
    name: 'Complaint surge', complaint_count: 30,
    hours_available: 8, avg_minutes_per_job: 45,
  })
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})

  const run = useMutation({
    mutationFn: () => api.post('/analytics/simulate', config),
    onSuccess: (d) => {
      if (d.error) return toast.error(d.error)
      setResult(d)
      toast.success('Simulation complete.')
    },
    onError: (err) => {
      // Show the server's per-field reasons under the fields themselves.
      if (err.fields) setErrors(err.fields)
      toast.error(err.fields ? 'Check the highlighted fields.' : (err.detail || 'Simulation failed'))
    },
  })

  const start = () => {
    const next = {}
    for (const [key, [lo, hi, what]] of Object.entries(SIM_LIMITS)) {
      const v = config[key]
      if (!Number.isInteger(v) || v < lo || v > hi) next[key] = `${what} must be between ${lo} and ${hi}.`
    }
    if (!next.avg_minutes_per_job && !next.hours_available
        && config.avg_minutes_per_job > config.hours_available * 60) {
      next.avg_minutes_per_job = `A job can't take longer than the ${config.hours_available}-hour shift.`
    }
    if (!config.name?.trim()) next.name = 'Give the scenario a name.'
    setErrors(next)
    if (Object.keys(next).length === 0) run.mutate()
  }
  const setNum = (key) => (e) => {
    setConfig((c) => ({ ...c, [key]: e.target.value === '' ? '' : Number(e.target.value) }))
    setErrors((er) => ({ ...er, [key]: undefined }))
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <Widget title={<span className="flex items-center gap-2"><Cpu size={17} /> Configuration</span>}>
        <div className="space-y-4">
          <Field label="Scenario name" error={errors.name}>
            <Input value={config.name} error={errors.name}
                   onChange={(e) => { setConfig((c) => ({ ...c, name: e.target.value })); setErrors((er) => ({ ...er, name: undefined })) }} />
          </Field>
          <Field label="Simultaneous complaints" hint="How many arrive at once (1–500)" error={errors.complaint_count}>
            <Input type="number" min="1" max="500" value={config.complaint_count} error={errors.complaint_count}
                   onChange={setNum('complaint_count')} />
          </Field>
          <Field label="Shift length (hours)" hint="1–24 hours" error={errors.hours_available}>
            <Input type="number" min="1" max="24" value={config.hours_available} error={errors.hours_available}
                   onChange={setNum('hours_available')} />
          </Field>
          <Field label="Average minutes per job" hint="5–480 minutes (up to 8 hours)" error={errors.avg_minutes_per_job}>
            <Input type="number" min="5" max="480" value={config.avg_minutes_per_job} error={errors.avg_minutes_per_job}
                   onChange={setNum('avg_minutes_per_job')} />
          </Field>
          <Button icon={Play} loading={run.isPending} className="w-full"
                  onClick={start}>Run simulation</Button>
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
          <MetricRow>
            <Metric label="Complaints" value={result.complaint_count} accent="rgb(var(--c-brand))" />
            <Metric label="Total capacity" value={result.capacity.total_capacity} accent="#3b82f6" />
            <Metric label="Backlog" value={result.capacity.total_backlog}
                    accent={result.capacity.total_backlog > 0 ? '#ef4444' : '#10b981'} />
            <Metric label="Projected SLA" value={`${result.sla_projection.projected_compliance_pct}%`}
                    accent={result.sla_projection.projected_compliance_pct >= 90 ? '#10b981' : '#f59e0b'} />
          </MetricRow>

          <Widget title="AI Classification → Technician Routing"
                  subtitle={`Each category goes to the technicians who specialise in it · ${result.capacity.jobs_per_technician} jobs per technician per shift`}
                  bodyClass="p-0">
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Category</th><th className="text-right">Issues</th>
                    <th className="text-right">Specialists</th><th className="text-right">Handled</th>
                    <th className="text-right">Utilisation</th><th className="text-right">Backlog</th>
                  </tr>
                </thead>
                <tbody>
                  {result.by_department.map((d) => (
                    <tr key={d.department} className={d.at_risk ? 'bg-danger-bg/40' : ''}>
                      <td className="text-ink">
                        {d.department}
                        {d.owning_department && <span className="block text-body-xs text-ink-faint">{d.owning_department}</span>}
                      </td>
                      <td className="text-right tabular">{d.issues}</td>
                      <td className="text-right tabular">{d.technicians}</td>
                      <td className="text-right tabular">{d.capacity}</td>
                      <td className="text-right tabular">
                        {d.utilisation_pct != null ? (
                          <span className={d.utilisation_pct > 100 ? 'text-danger-text font-medium'
                            : d.utilisation_pct > 80 ? 'text-warning-text' : ''}>
                            {d.utilisation_pct}%
                          </span>
                        ) : <span className="text-danger-text">no specialist</span>}
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
                        {b.department}: {b.backlog} would wait{b.utilisation_pct == null ? ' (no technician covers it)' : ''}
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
