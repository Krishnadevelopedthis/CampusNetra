import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Banknote, CircleDollarSign, Hammer, MapPin, TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { SkeletonChart, SkeletonMetrics, SkeletonWidget } from '@/components/Skeletons'
import { EmptyState, ErrorState, Metric, Select, Widget } from '@/components/ui'
import { useChartTheme } from '@/hooks/useChartTheme'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { money, moneyCompact } from '@/lib/format'

const GRAINS = [
  ['week', 'Weekly'],
  ['month', 'Monthly'],
  ['quarter', 'Quarterly'],
  ['year', 'Yearly'],
]

const WINDOWS = [
  [3, 'Last 3 months'],
  [6, 'Last 6 months'],
  [12, 'Last 12 months'],
  [24, 'Last 2 years'],
  [60, 'Last 5 years'],
]

export default function AdminCosts() {
  const [granularity, setGranularity] = useState('month')
  const [months, setMonths] = useState(12)
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const chart = useChartTheme()

  // The place filters cascade, so the lists below only offer what sits inside
  // the level already chosen.
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id
  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })
  const floors = useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/campus/buildings/${buildingId}/floors`),
    enabled: !!buildingId,
  })
  const plan = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`),
    enabled: !!floorId,
  })

  const params = {
    granularity, months,
    building_id: buildingId || undefined,
    floor_id: floorId || undefined,
    room_id: roomId || undefined,
  }
  const spend = useQuery({
    queryKey: ['spend', params],
    queryFn: () => api.get('/analytics/spend', { params }),
  })
  const { refresh, refreshing } = useRefresh(spend.refetch)
  const busy = spend.isLoading || refreshing
  const d = spend.data

  if (spend.error && !d) return <ErrorState error={spend.error} onRetry={spend.refetch} />

  // Direction of travel matters more than the raw last bar.
  const series = d?.series || []
  const latest = series[series.length - 1]
  const previous = series[series.length - 2]
  const delta = latest && previous && previous.total
    ? Math.round(((latest.total - previous.total) / previous.total) * 100)
    : null

  const scopeLabel = roomId
    ? (plan.data?.rooms || []).find((r) => r.id === roomId)?.name || 'One room'
    : floorId
      ? `${(buildings.data || []).find((b) => b.id === buildingId)?.name || ''} · `
        + `${(floors.data || []).find((f) => f.id === floorId)?.name || ''}`
      : buildingId
        ? (buildings.data || []).find((b) => b.id === buildingId)?.name || ''
        : 'Whole campus'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-headline-md text-ink">Maintenance &amp; Expenses</h2>
          <p className="text-body-md text-ink-muted mt-0.5">
            What the campus spends keeping itself running. Only completed,
            signed-off work is counted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={granularity} onChange={(e) => setGranularity(e.target.value)}
                  className="w-auto">
            {GRAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}
                  className="w-auto">
            {WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary">
            Refresh
          </button>
        </div>
      </div>

      {/* Narrow the whole page to one place. Every figure below — the totals,
          the chart, the breakdowns and the repeat offenders — answers for the
          selection, so "what does this lab cost us" is one question rather
          than a reading exercise across four widgets. */}
      <Widget bodyClass="p-widget">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin size={16} className="text-ink-faint shrink-0" />
          <Select value={buildingId} className="w-auto min-w-[180px]"
                  onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setRoomId('') }}>
            <option value="">All buildings</option>
            {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select value={floorId} disabled={!buildingId} className="w-auto min-w-[150px]"
                  onChange={(e) => { setFloorId(e.target.value); setRoomId('') }}>
            <option value="">All floors</option>
            {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <Select value={roomId} disabled={!floorId} className="w-auto min-w-[190px]"
                  onChange={(e) => setRoomId(e.target.value)}>
            <option value="">All classrooms &amp; labs</option>
            {(plan.data?.rooms || []).map((r) => (
              <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
            ))}
          </Select>
          {(buildingId || floorId || roomId) && (
            <button className="btn-ghost btn-sm"
                    onClick={() => { setBuildingId(''); setFloorId(''); setRoomId('') }}>
              Clear
            </button>
          )}
          <span className="text-body-sm text-ink-faint ml-auto">
            {scopeLabel}
          </span>
        </div>
      </Widget>

      {busy ? (
        <>
          <SkeletonMetrics />
          <SkeletonChart height={300} />
          <div className="grid lg:grid-cols-2 gap-4">
            <SkeletonWidget lines={5} />
            <SkeletonWidget lines={5} />
          </div>
        </>
      ) : (
        <>
          <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric
              label="Maintenance spend" value={money(d.totals.maintenance)}
              icon={Banknote} accent="rgb(var(--c-brand))"
              delta={delta === null ? undefined : `${delta > 0 ? '+' : ''}${delta}%`}
              deltaTone={delta === null ? 'neutral' : delta > 0 ? 'down' : 'up'}
            />
            <Metric label="Jobs completed" value={d.totals.jobs} icon={Hammer} />
            <Metric label="Average per job" value={money(d.totals.average_per_job)}
                    icon={TrendingUp} />
            <Metric label="Asset purchase value" value={money(d.totals.capital)}
                    icon={CircleDollarSign} />
          </div>

          <Widget
            title="Spend over time"
            subtitle={GRAINS.find(([v]) => v === granularity)?.[1]}
          >
            {series.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No completed work in this window"
                description="Costs appear here once a work order is completed and signed off."
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: chart.axis }}
                         axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: chart.axis }} axisLine={false}
                         tickLine={false} width={72}
                         tickFormatter={moneyCompact} />
                  <Tooltip
                    {...chart.tooltip}
                    formatter={(value, name) => [
                      name === 'total' ? money(value) : value,
                      name === 'total' ? 'Spend' : 'Jobs',
                    ]}
                  />
                  <Legend iconType="circle"
                          wrapperStyle={{ fontSize: 13, paddingTop: 8, color: chart.axis }}
                          formatter={(v) => (v === 'total' ? 'Spend' : 'Jobs')} />
                  <Bar dataKey="total" fill={chart.seriesStrong} radius={[4, 4, 0, 0]}
                       maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Widget>

          <Widget
            title="Repeat offenders"
            subtitle="Assets ranked by what has been spent repairing them"
            bodyClass="p-0"
          >
            {(d.worst_offenders || []).length === 0 ? (
              <EmptyState icon={AlertTriangle} title="Nothing has needed repeat repair yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Asset</th>
                      <th>Jobs</th>
                      <th>Purchase</th>
                      <th>Repairs</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.worst_offenders.map((a) => (
                      <tr key={a.id}>
                        <td className="font-mono text-body-sm">
                          <Link to={`/assets/${a.id}`} className="text-secondary hover:underline">
                            {a.tag}
                          </Link>
                        </td>
                        <td>{a.name}</td>
                        <td className="tabular">{a.jobs}</td>
                        <td className="tabular">{a.purchase ? money(a.purchase) : '—'}</td>
                        <td className="tabular font-medium">{money(a.total)}</td>
                        <td>
                          {a.beyond_value ? (
                            <span className="pill bg-danger-bg text-danger-text">
                              <AlertTriangle size={12} /> Replace
                            </span>
                          ) : (
                            <span className="text-body-sm text-ink-faint">Worth repairing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Widget>
          </div>

          {/* Side panel: where the money went, at whatever level is selected.
              A building filter makes the per-building bar meaningless, so the
              rooms inside it take that slot instead. */}
          <div className="space-y-4">
            <Widget title="Spend at a glance" subtitle={scopeLabel}>
              <dl className="space-y-2.5 text-body-md">
                <SideRow label="Maintenance" value={money(d.totals.maintenance)} strong />
                <SideRow label="Jobs completed" value={d.totals.jobs} />
                <SideRow label="Average per job" value={money(d.totals.average_per_job)} />
                <SideRow label="Purchase value" value={money(d.totals.capital)} />
                <SideRow
                  label="Repairs vs purchase"
                  value={d.totals.capital
                    ? `${Math.round((d.totals.maintenance / d.totals.capital) * 100)}%`
                    : '—'}
                />
              </dl>
            </Widget>

            {d.totals.unattributed > 0 && (
              <Widget title="Not attributed to a place">
                <p className="text-body-md text-ink-muted">
                  {money(d.totals.unattributed)} of this spend is on work orders raised
                  without an asset or a room, so it counts in the totals above but
                  appears in none of the breakdowns below.
                </p>
                <p className="text-body-sm text-ink-faint mt-2">
                  Raising work against the asset or room it concerns is what puts it on
                  the map.
                </p>
              </Widget>
            )}

            <Breakdown
              title="By asset category"
              subtitle="Where the money goes"
              rows={d.by_category}
              chart={chart}
            />
            {buildingId ? (
              <Breakdown
                title="By classroom or lab"
                subtitle="Which rooms cost the most to maintain"
                rows={d.by_room}
                chart={chart}
              />
            ) : (
              <Breakdown
                title="By building"
                subtitle="Which buildings cost the most to maintain"
                rows={d.by_building}
                chart={chart}
              />
            )}
          </div>
          </div>
        </>
      )}
    </div>
  )
}

function SideRow({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`tabular ${strong ? 'text-ink font-medium' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function Breakdown({ title, subtitle, rows, chart }) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Widget title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <p className="text-body-md text-ink-faint py-6 text-center">Nothing recorded yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.name} className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Fixed columns for the label, the amount and the job count add
                  up to more than a narrow phone has. The label gives way — it
                  is the one that can truncate and still be recognised. */}
              <span className="text-body-md text-ink-muted w-20 sm:w-32 truncate shrink"
                    title={r.name}>
                {r.name}
              </span>
              <div className="flex-1 min-w-[24px] h-2.5 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(r.total / max) * 100}%`,
                    background: chart.categories[i % chart.categories.length],
                  }}
                />
              </div>
              <span className="tabular text-body-md w-20 sm:w-24 text-right shrink-0">
                {money(r.total)}
              </span>
              <span className="tabular text-body-sm text-ink-faint w-8 sm:w-10 text-right shrink-0">
                {r.jobs}
              </span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}
