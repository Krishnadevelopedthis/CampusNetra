import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, MapPinned, Layers } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  EmptyState,
  ErrorState,
  Metric,
  RefreshButton,
  Select,
  Spinner,
  StatusPill,
  Widget,
} from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { ago } from '@/lib/format'

const VB = 1000
const PRIORITIES = ['critical', 'high', 'medium', 'low']

export default function IssueMap() {
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [priority, setPriority] = useState('')
  const [days, setDays] = useState(30)
  const [selected, setSelected] = useState(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })
  useEffect(() => {
    if (!buildingId && buildings.data?.length) setBuildingId(buildings.data[0].id)
  }, [buildings.data, buildingId])

  const floors = useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/campus/buildings/${buildingId}/floors`),
    enabled: !!buildingId,
  })
  useEffect(() => {
    if (!floorId && floors.data?.length) setFloorId(floors.data[0].id)
  }, [floors.data, floorId])

  // Geometry from the plan; issue data layered on top of it.
  const plan = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`),
    enabled: !!floorId,
  })

  const map = useQuery({
    queryKey: ['issue-map', floorId, priority, days],
    queryFn: () => api.get('/issues/map', {
      params: { floor_id: floorId || undefined, priority: priority || undefined, days },
    }),
    enabled: !!floorId,
  })

  const byRoom = useMemo(
    () => new Map((map.data?.rooms || []).map((r) => [r.room_id, r])),
    [map.data],
  )

  const { refresh, refreshing } = useRefresh(map.refetch, plan.refetch)

  if (campuses.isLoading) return <Spinner label="Loading campus…" />
  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.refetch} />

  const rooms = plan.data?.rooms || []

  // Same proportions as the twin renders: room outlines are normalised

  // against the plan, so squaring the canvas stretches a wide floor and

  // the two views disagree about the shape of the same rooms.

  const vbH = plan.data?.floor?.plan_width && plan.data?.floor?.plan_height

    ? Math.round((VB * plan.data.floor.plan_height) / plan.data.floor.plan_width)

    : VB
  const counts = PRIORITIES.map((p) => ({
    priority: p,
    count: (map.data?.rooms || []).reduce(
      (s, r) => s + r.issues.filter((i) => i.priority === p).length, 0),
  }))

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Issue Map</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Where the open complaints actually are, rather than a list of them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="w-auto min-w-[150px]">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counts.map((c) => (
          <Metric key={c.priority} label={`${c.priority} priority`} value={c.count}
                  accent={{ critical: '#ef4444', high: '#f59e0b',
                            medium: '#3b82f6', low: '#94a3b8' }[c.priority]} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={buildingId}
                onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setSelected(null) }}
                className="w-auto min-w-[190px]">
          {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={floorId} onChange={(e) => { setFloorId(e.target.value); setSelected(null) }}
                className="w-auto min-w-[140px]">
          {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <div className="ml-auto flex flex-wrap gap-3">
          {PRIORITIES.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-body-sm text-ink-muted">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-white"
                    style={{ background: { critical: '#ef4444', high: '#f59e0b',
                                           medium: '#3b82f6', low: '#94a3b8' }[p] }} />
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <Widget bodyClass="p-0" className="overflow-hidden">
          {plan.isLoading || refreshing ? (
            <div className="skeleton w-full rounded-lg" style={{ aspectRatio: '16 / 10' }} />
          )
            : !rooms.length ? (
              <EmptyState icon={Layers} title="No rooms mapped on this floor"
                          description="Outline the rooms in the Floor Plan editor first." />
            ) : (
              <div className="relative bg-surface-sunken">
                <svg viewBox={`0 0 ${VB} ${vbH}`} className="w-full h-[520px]"
                     role="img" aria-label="Issues plotted on the floor plan">
                  <defs>
                    <pattern id="issuegrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width={VB} height={vbH} fill="url(#issuegrid)" />

                  {rooms.map((room) => {
                    const pts = (room.boundary || []).map(([x, y]) => `${x * VB},${y * vbH}`).join(' ')
                    if (!pts) return null
                    const data = byRoom.get(room.id)
                    const isSelected = selected?.room_id === room.id
                    // Rooms with nothing open stay neutral, so attention goes
                    // where the problems are.
                    const colour = data?.colour || '#cbd5e1'
                    const centre = {
                      x: (room.boundary.reduce((s, p) => s + p[0], 0) / room.boundary.length) * VB,
                      y: (room.boundary.reduce((s, p) => s + p[1], 0) / room.boundary.length) * vbH,
                    }
                    return (
                      <g key={room.id} className="cursor-pointer"
                         onClick={() => setSelected(data || null)}>
                        <polygon points={pts}
                                 fill={colour} fillOpacity={data ? (isSelected ? 0.34 : 0.2) : 0.06}
                                 stroke={isSelected ? '#3b82f6' : colour}
                                 strokeWidth={isSelected ? 3 : data ? 2 : 1.2}
                                 className="transition-all duration-200" />
                        <text x={centre.x} y={centre.y - 26} textAnchor="middle" fontSize="17"
                              fill="#0b1c30" className="font-mono pointer-events-none">
                          {room.code}
                        </text>
                        {data && (
                          <>
                            <circle cx={centre.x} cy={centre.y + 8} r="21" fill={colour} />
                            <text x={centre.x} y={centre.y + 15} textAnchor="middle"
                                  fontSize="22" fontWeight="700" fill="white"
                                  className="pointer-events-none">
                              {data.count}
                            </text>
                            {data.issues.some((i) => i.sla_breached) && (
                              <circle cx={centre.x + 20} cy={centre.y - 10} r="7"
                                      fill="#ef4444" stroke="white" strokeWidth="2" />
                            )}
                          </>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}
        </Widget>

        <div className="space-y-4">
          {selected ? (
            <Widget title={selected.room_code} subtitle={selected.room_name} bodyClass="p-0">
              <div className="divide-y divide-border-subtle max-h-[460px] overflow-y-auto">
                {selected.issues.map((i) => (
                  <Link key={i.id} to={`/issues/${i.id}`}
                        className="block px-widget py-3 hover:bg-surface-sunken transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-mono-data text-secondary">{i.reference}</span>
                      <span className="pill" style={{
                        background: `${i.colour}1a`, color: i.colour }}>
                        {i.priority}
                      </span>
                    </div>
                    <p className="text-body-md text-ink mt-0.5">{i.title}</p>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <StatusPill status={i.status} />
                      <span className="text-body-sm text-ink-faint">{ago(i.created_at)}</span>
                    </div>
                    {i.asset_tag && (
                      <p className="font-mono text-[11px] text-ink-faint mt-1">{i.asset_tag}</p>
                    )}
                    {i.sla_breached && (
                      <p className="text-body-sm text-danger-text mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} /> SLA breached
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </Widget>
          ) : (
            <Widget>
              <EmptyState icon={MapPinned} title="Select a room"
                          description="Rooms with open issues are shaded by their most urgent one. Click for the detail." />
            </Widget>
          )}

          <Widget title="Busiest rooms" subtitle={`Across the whole campus, last ${days} days`}
                  bodyClass="p-0">
            {map.isLoading ? <Spinner />
              : !map.data?.rooms?.length ? (
                <p className="text-body-md text-ink-faint text-center py-8">
                  No open issues in this window.
                </p>
              ) : (
                <div className="divide-y divide-border-subtle max-h-72 overflow-y-auto">
                  {map.data.rooms.slice(0, 12).map((r) => (
                    <button key={r.room_id} onClick={() => setSelected(r)}
                            className="w-full text-left px-widget py-2.5 hover:bg-surface-sunken transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-mono-data text-secondary">{r.room_code}</span>
                        <span className="pill tabular" style={{
                          background: `${r.colour}1a`, color: r.colour }}>
                          {r.count}
                        </span>
                      </div>
                      <p className="text-body-sm text-ink-muted truncate">{r.room_name}</p>
                    </button>
                  ))}
                </div>
              )}
          </Widget>

          {map.data?.unplaced?.length > 0 && (
            <Widget title="Not on the map"
                    subtitle="Reported without a room, so they cannot be plotted">
              <div className="space-y-1.5">
                {map.data.unplaced.slice(0, 6).map((i) => (
                  <Link key={i.id} to={`/issues/${i.id}`}
                        className="flex items-center justify-between gap-2 text-body-md hover:underline">
                    <span className="font-mono text-mono-data text-secondary">{i.reference}</span>
                    <span className="text-ink truncate flex-1">{i.title}</span>
                    <ArrowRight size={13} className="text-ink-faint shrink-0" />
                  </Link>
                ))}
              </div>
            </Widget>
          )}
        </div>
      </div>
    </div>
  )
}
