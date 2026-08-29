import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Download, Flame, MapPinned } from 'lucide-react'
import { useState } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Metric,
  RefreshButton,
  Select,
  Widget,
} from '@/components/ui'
import { TwinLegend } from '@/features/twin/FloorPlan'
import { SkeletonMetrics } from '@/components/Skeletons'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { TWIN_STATE } from '@/lib/format'

const VB = 1000
const VB_H = 620

/** Cold blue through to hot red, by complaint intensity. */
function heatColour(intensity) {
  if (intensity <= 0) return '#cbd5e1'
  const stops = [
    [0.0, [59, 130, 246]],   // blue
    [0.35, [16, 185, 129]],  // green
    [0.6, [245, 158, 11]],   // amber
    [1.0, [239, 68, 68]],    // red
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (intensity >= stops[i][0] && intensity <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const t = (intensity - lo[0]) / (hi[0] - lo[0] || 1)
  const rgb = lo[1].map((c, i) => Math.round(c + (hi[1][i] - c) * t))
  return `rgb(${rgb.join(',')})`
}

export default function CampusMap() {
  const [days, setDays] = useState(30)
  const [mode, setMode] = useState('condition')   // condition | heat
  const [hover, setHover] = useState(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const overview = useQuery({
    queryKey: ['campus-overview', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/overview`),
    enabled: !!campusId,
  })
  const heat = useQuery({
    queryKey: ['heatmap', campusId, days],
    queryFn: () => api.get('/analytics/heatmap', { params: { days, campus_id: campusId } }),
    enabled: !!campusId,
  })

  const navigate = useNavigate()
  const { refresh, refreshing } = useRefresh(
    overview.refetch, heat.refetch, campuses.refetch,
  )

  const busy = campuses.isLoading || overview.isLoading || refreshing

  if (overview.error && !overview.data) {
    return <ErrorState error={overview.error} onRetry={overview.refetch} />
  }

  const heatByBuilding = new Map((heat.data?.buildings || []).map((b) => [b.id, b]))
  const buildings = overview.data?.buildings || []
  const positioned = buildings.filter((b) => b.map_x != null && b.map_y != null)

  const exportCsv = () => {
    const rows = [
      ['Building', 'Code', 'Assets', 'Open issues', 'Condition', `Complaints (${days}d)`],
      ...buildings.map((b) => [
        b.name, b.code, b.asset_count, b.open_issues, b.aggregate_state,
        heatByBuilding.get(b.id)?.count ?? 0,
      ]),
      [],
      ['Room', 'Building', 'Floor', `Complaints (${days}d)`],
      ...(heat.data?.rooms || []).map((r) => [r.name, r.building, r.floor, r.count]),
    ]
    // Quote every field: room names and building names contain commas.
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `campus-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Campus Map</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Every building at a glance — by live condition, or by where complaints cluster.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
          <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </header>

      {busy ? <SkeletonMetrics /> : overview.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Buildings" value={overview.data.totals.buildings} accent="rgb(var(--c-brand))" />
          <Metric label="Rooms" value={overview.data.totals.rooms} accent="#3b82f6" />
          <Metric label="Assets" value={overview.data.totals.assets} accent="#8b5cf6" />
          <Metric label="Open issues" value={overview.data.totals.open_issues}
                  accent={overview.data.totals.open_issues > 0 ? '#f59e0b' : '#10b981'} />
        </div>
      )}

      <Widget bodyClass="p-0" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-widget border-b border-border-subtle">
          <div className="flex p-1 bg-surface-sunken rounded-lg">
            {[['condition', 'Live condition'], ['heat', 'Complaint heatmap']].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                      className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                        mode === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                      }`}>{label}</button>
            ))}
          </div>

          {mode === 'condition' ? (
            <TwinLegend breakdown={overview.data?.state_breakdown} />
          ) : (
            <div className="flex items-center gap-2 text-body-sm text-ink-muted">
              <span>Fewer</span>
              <span className="h-2 w-32 rounded-full" style={{
                background: 'linear-gradient(90deg, rgb(59,130,246), rgb(16,185,129), rgb(245,158,11), rgb(239,68,68))',
              }} />
              <span>More complaints</span>
            </div>
          )}
        </div>

        {busy ? (
          <div className="p-widget">
            <div className="skeleton w-full rounded-xl" style={{ aspectRatio: '1000 / 620' }} />
          </div>
        ) : positioned.length === 0 ? (
          <EmptyState icon={MapPinned} title="No buildings positioned on the map"
                      description="Buildings need map coordinates before they can be placed. An administrator sets these in Campus Management." />
        ) : (
          <div className="relative bg-surface-sunken">
            <svg viewBox={`0 0 ${VB} ${VB_H}`} className="w-full h-[560px]" role="img"
                 aria-label="Campus map">
              <defs>
                <pattern id="campusgrid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" className="stroke-border-subtle" strokeWidth="1" />
                </pattern>
                <radialGradient id="glow">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width={VB} height={VB_H} fill="url(#campusgrid)" />

              {/* Heat glow sits under the buildings so labels stay readable. */}
              {mode === 'heat' && positioned.map((b) => {
                const h = heatByBuilding.get(b.id)
                if (!h?.count) return null
                return (
                  <circle key={`glow-${b.id}`}
                          cx={b.map_x * VB} cy={b.map_y * VB_H}
                          r={90 + h.intensity * 110}
                          fill="url(#glow)"
                          style={{ color: heatColour(h.intensity) }} />
                )
              })}

              {positioned.map((b) => (
                <BuildingBlock
                  key={b.id}
                  building={b}
                  heat={heatByBuilding.get(b.id)}
                  mode={mode}
                  vb={VB}
                  vbH={VB_H}
                  onHover={setHover}
                  onOpenRoom={(roomId, floorId) => navigate(`/twin/${floorId}?room=${roomId}`)}
                />
              ))}
            </svg>

            {hover && (
              <div className="absolute bottom-3 left-3 bg-surface/95 backdrop-blur border border-border-subtle rounded-lg shadow-level3 p-3 pointer-events-none animate-fade-in">
                <p className="text-body-md font-medium text-ink">{hover.name}</p>
                <dl className="mt-1.5 space-y-0.5 text-body-sm">
                  <div className="flex justify-between gap-6">
                    <dt className="text-ink-muted">Assets</dt><dd className="tabular">{hover.asset_count}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-ink-muted">Open issues</dt><dd className="tabular">{hover.open_issues}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-ink-muted">Complaints ({days}d)</dt>
                    <dd className="tabular">{hover.heat?.count ?? 0}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </Widget>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title="Buildings" bodyClass="p-0">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Building</th><th className="text-right">Assets</th>
                         <th className="text-right">Open</th><th>Condition</th></tr></thead>
              <tbody>
                {busy ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 4 }).map((_, c) => (
                      <td key={c}><div className="skeleton h-4" /></td>
                    ))}
                  </tr>
                )) : buildings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="font-mono text-mono-data text-secondary">{b.code}</span>
                      <span className="text-ink ml-2">{b.name}</span>
                    </td>
                    <td className="text-right tabular">{b.asset_count}</td>
                    <td className={`text-right tabular ${b.open_issues > 0 ? 'text-warning-text font-medium' : ''}`}>
                      {b.open_issues || '—'}
                    </td>
                    <td>
                      <span className="pill" style={{
                        background: `${b.aggregate_colour}1a`, color: b.aggregate_colour }}>
                        {TWIN_STATE[b.aggregate_state]?.label || b.aggregate_state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>

        <Widget title={<span className="flex items-center gap-2"><Flame size={17} className="text-warning" /> Complaint Hotspots</span>}
                subtitle={`Rooms generating the most complaints in ${days} days`} bodyClass="p-0">
          {heat.isLoading || refreshing ? (
              <div className="p-widget space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-4 rounded" />
                ))}
              </div>
            )
            : !heat.data?.rooms?.length ? (
              <p className="text-body-md text-ink-faint text-center py-10">
                No complaints recorded in this window.
              </p>
            ) : (
              <div className="p-widget space-y-2">
                {heat.data.rooms.slice(0, 10).map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="font-mono text-mono-data text-secondary w-20 shrink-0">{r.code}</span>
                    <span className="text-body-md text-ink-muted w-32 truncate">{r.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                           style={{ width: `${r.intensity * 100}%`, background: heatColour(r.intensity) }} />
                    </div>
                    <span className="tabular text-body-md w-8 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
        </Widget>
      </div>
    </div>
  )
}

/**
 * One building, drawn as an outline containing what is actually inside it.
 *
 * A coloured block tells you a building has a problem. It does not tell you the
 * problem is in the second-floor physics lab — which is the thing a facility
 * manager is standing at the map to find out. Floors stack top-down at their
 * real levels, and each room is a chip carrying its own worst asset state, so a
 * single red chip among green ones locates the fault without a drill-down.
 *
 * Rooms are only legible above a certain size, so below that the block falls
 * back to floor bands with counts rather than rendering unreadable slivers.
 */
function BuildingBlock({ building: b, heat, mode, vb, vbH, onHover, onOpenRoom }) {
  const colour = mode === 'heat' ? heatColour(heat?.intensity ?? 0) : b.aggregate_colour
  const floors = b.floors || []

  // Size to contents: a building with eight rooms needs more room than one
  // with a single office, and a fixed box makes both look wrong.
  const widest = Math.max(1, ...floors.map((f) => f.rooms.length))
  const w = Math.min(300, Math.max(168, 56 + widest * 34))
  const headerH = 42
  const floorH = 26
  const ht = headerH + Math.max(1, floors.length) * floorH + 10

  // Nudge away from the edges so a wide block is never clipped.
  const x = Math.min(vb - w - 8, Math.max(8, b.map_x * vb - w / 2))
  const y = Math.min(vbH - ht - 8, Math.max(8, b.map_y * vbH - ht / 2))

  return (
    <g
      onMouseEnter={() => onHover({ ...b, heat })}
      onMouseLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      {/* Shell */}
      <rect
        x={x} y={y} width={w} height={ht} rx="10"
        fill={colour} fillOpacity={mode === 'heat' ? 0.24 : 0.10}
        stroke={colour} strokeWidth="2.5"
        className="transition-all duration-200"
      />

      {/* Header band, so the code and totals never collide with the contents */}
      <rect x={x} y={y} width={w} height={headerH} rx="10" fill={colour} fillOpacity="0.16" />
      <rect x={x} y={y + headerH - 10} width={w} height="10" fill={colour} fillOpacity="0.16" />
      <line x1={x} y1={y + headerH} x2={x + w} y2={y + headerH}
            stroke={colour} strokeOpacity="0.4" strokeWidth="1.5" />

      <text x={x + 10} y={y + 20} fontSize="17" fontWeight="700"
            className="font-mono fill-ink pointer-events-none">
        {b.code}
      </text>
      <text x={x + 10} y={y + 34} fontSize="10.5"
            className="fill-ink-faint pointer-events-none">
        {mode === 'heat'
          ? `${heat?.count ?? 0} complaint${(heat?.count ?? 0) === 1 ? '' : 's'}`
          : `${b.room_count ?? 0} rooms · ${b.asset_count} assets`}
      </text>

      {b.open_issues > 0 && mode === 'condition' && (
        <>
          <circle cx={x + w - 17} cy={y + 17} r="10.5" fill="#ef4444" />
          <text x={x + w - 17} y={y + 21} textAnchor="middle" fontSize="11"
                fill="white" fontWeight="700" className="pointer-events-none">
            {b.open_issues}
          </text>
        </>
      )}

      {/* Floors, highest at the top — the way a building is actually stacked */}
      {floors.length === 0 ? (
        <text x={x + w / 2} y={y + headerH + 18} textAnchor="middle" fontSize="10.5"
              className="fill-ink-faint pointer-events-none">
          No floors mapped yet
        </text>
      ) : (
        floors.map((f, i) => {
          const fy = y + headerH + 4 + i * floorH
          const chipW = Math.min(36, (w - 46) / Math.max(1, f.rooms.length) - 3)
          const showRooms = chipW >= 14 && f.rooms.length > 0
          return (
            <g key={f.id}>
              <text x={x + 10} y={fy + 16} fontSize="10"
                    className="fill-ink-muted font-mono pointer-events-none">
                {f.level}
              </text>

              {showRooms ? (
                f.rooms.map((r, j) => (
                  <g
                    key={r.id}
                    onClick={(e) => { e.stopPropagation(); onOpenRoom(r.id, f.id) }}
                  >
                    <title>
                      {`${r.code} · ${r.name} (${r.kind.replace(/_/g, ' ')}) — `
                        + `${r.asset_count} asset${r.asset_count === 1 ? '' : 's'}`
                        + (r.open_issues ? `, ${r.open_issues} open` : '')}
                    </title>
                    <rect
                      x={x + 26 + j * (chipW + 3)} y={fy + 4}
                      width={chipW} height={18} rx="3.5"
                      fill={r.colour} fillOpacity={r.state === 'healthy' ? 0.34 : 0.62}
                      stroke={r.colour} strokeWidth="1"
                    />
                    <text
                      x={x + 26 + j * (chipW + 3) + chipW / 2} y={fy + 17}
                      textAnchor="middle" fontSize="9" fontWeight="700"
                      className="fill-ink pointer-events-none font-mono"
                    >
                      {r.code.split('-').pop()}
                    </text>
                    {r.open_issues > 0 && (
                      <circle
                        cx={x + 26 + j * (chipW + 3) + chipW - 2} cy={fy + 5}
                        r="3" fill="#ef4444" className="stroke-surface" strokeWidth="1"
                      />
                    )}
                  </g>
                ))
              ) : (
                <text x={x + 26} y={fy + 16} fontSize="10"
                      className="fill-ink-faint pointer-events-none">
                  {f.rooms.length
                    ? `${f.rooms.length} rooms`
                    : 'no rooms mapped'}
                </text>
              )}
            </g>
          )
        })
      )}
    </g>
  )
}
