import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { EmptyState, Widget } from '@/components/ui'
import { SkeletonChart } from '@/components/Skeletons'
import { api } from '@/lib/api'
import { TWIN_STATE } from '@/lib/format'

// `/campus/campuses/{id}/overview` is open to every authenticated role
// (unlike /health/tree, which is admin-only and backs the more detailed,
// per-asset chart admins get further down this dashboard) — this is the
// same room-by-room breakdown the Campus Map's "Live condition" view
// already shows every role, just re-read as a donut so every user, not
// only staff, sees campus health without needing to open the map.
function useCampusHealthOverview() {
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id
  const overview = useQuery({
    queryKey: ['campus-overview', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/overview`),
    enabled: !!campusId,
  })
  return { data: overview.data, isLoading: campuses.isLoading || overview.isLoading }
}

function CampusHealthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const shown = d.rooms.slice(0, 8)
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 shadow-level2 max-w-xs">
      <p className="text-body-sm font-semibold text-ink flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.colour }} />
        {d.label} · {d.count} asset{d.count === 1 ? '' : 's'}
      </p>
      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-body-xs text-ink-muted max-h-48 overflow-y-auto">
          {shown.map((r, i) => (
            <li key={i} className="leading-snug">
              <span className="text-ink font-medium">{r.building} / {r.floor} / {r.room}</span>
              <span className="block text-ink-faint">{r.assetCount} asset{r.assetCount === 1 ? '' : 's'} here</span>
            </li>
          ))}
        </ul>
      )}
      {d.rooms.length > shown.length && (
        <p className="mt-1.5 text-body-xs text-ink-faint">+{d.rooms.length - shown.length} more rooms</p>
      )}
    </div>
  )
}

/** Campus-wide asset health, visible to every role — hovering a slice names
 * exactly which rooms are in that state, not just a count. */
export default function CampusHealthWidget() {
  const { data, isLoading } = useCampusHealthOverview()

  const byState = useMemo(() => {
    if (!data) return []
    const roomsByState = {}
    for (const b of data.buildings || []) {
      for (const f of b.floors || []) {
        for (const r of f.rooms || []) {
          if (!r.asset_count) continue
          (roomsByState[r.state] ??= []).push({
            building: b.name, floor: f.name, room: `${r.code} · ${r.name}`, assetCount: r.asset_count,
          })
        }
      }
    }
    return Object.entries(data.state_breakdown || {})
      .filter(([, count]) => count > 0)
      .map(([state, count]) => ({
        state, count, rooms: roomsByState[state] || [],
        colour: TWIN_STATE[state]?.colour || '#94a3b8',
        label: TWIN_STATE[state]?.label || state,
      }))
      .sort((a, b) => b.count - a.count)
  }, [data])

  return (
    <Widget
      title={<span className="flex items-center gap-2"><Activity size={18} className="text-secondary" /> Campus Health</span>}
      subtitle="Hover a slice for the exact rooms behind it"
    >
      {isLoading ? (
        <SkeletonChart />
      ) : !byState.length ? (
        <EmptyState icon={Activity} title="No electronic assets yet"
                    description="Assets with IoT sensors will appear here once added." />
      ) : (
        <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={byState} dataKey="count" nameKey="label" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {byState.map((d) => <Cell key={d.state} fill={d.colour} />)}
              </Pie>
              <Tooltip content={<CampusHealthTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 min-w-0">
            {byState.map((d) => (
              <div key={d.state} className="flex items-center justify-between gap-2 text-body-sm">
                <span className="flex items-center gap-2 text-ink-muted min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.colour }} />
                  <span className="truncate">{d.label}</span>
                </span>
                <span className="tabular font-medium text-ink shrink-0">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Widget>
  )
}
