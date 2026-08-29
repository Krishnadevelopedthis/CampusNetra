import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Banknote, CircleDollarSign, Hammer, TrendingUp } from 'lucide-react'
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
  ['month', 'Monthly'],
  ['quarter', 'Quarterly'],
  ['year', 'Yearly'],
]

const WINDOWS = [
  [12, 'Last 12 months'],
  [24, 'Last 2 years'],
  [60, 'Last 5 years'],
]

export default function AdminCosts() {
  const [granularity, setGranularity] = useState('month')
  const [months, setMonths] = useState(12)
  const chart = useChartTheme()

  const spend = useQuery({
    queryKey: ['spend', granularity, months],
    queryFn: () => api.get('/analytics/spend', { params: { granularity, months } }),
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

          <div className="grid lg:grid-cols-2 gap-4">
            <Breakdown
              title="By asset category"
              subtitle="Where the money goes"
              rows={d.by_category}
              chart={chart}
            />
            <Breakdown
              title="By building"
              subtitle="Which buildings cost the most to maintain"
              rows={d.by_building}
              chart={chart}
            />
          </div>

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
        </>
      )}
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
