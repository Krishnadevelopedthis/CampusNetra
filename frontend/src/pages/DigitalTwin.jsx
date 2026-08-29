import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronRight, CircleDot, Layers, Radio, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, RefreshButton, Spinner, StatusPill, Widget } from '@/components/ui'
import { FloorPlan, TwinLegend } from '@/features/twin/FloorPlan'
import { useRefresh } from '@/hooks/useRefresh'
import { api, connectTwin } from '@/lib/api'
import { ago, titleCase } from '@/lib/format'

export default function DigitalTwin() {
  const { floorId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [buildingId, setBuildingId] = useState(null)
  const [selectedFloor, setSelectedFloor] = useState(floorId || null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [live, setLive] = useState(false)
  // Assets whose state changed in the last few seconds get a pulse ring.
  const [changed, setChanged] = useState(new Set())

  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: () => api.get('/campus/campuses'),
  })
  const campusId = campuses.data?.[0]?.id

  const overview = useQuery({
    queryKey: ['campus-overview', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/overview`),
    enabled: !!campusId,
  })

  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })

  // Default to the first building that actually has assets to show.
  useEffect(() => {
    if (buildingId || !overview.data?.buildings?.length) return
    const withAssets = overview.data.buildings.find((b) => b.asset_count > 0)
    setBuildingId(withAssets?.id || overview.data.buildings[0].id)
  }, [overview.data, buildingId])

  const floors = useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/campus/buildings/${buildingId}/floors`),
    enabled: !!buildingId,
  })

  useEffect(() => {
    if (!selectedFloor && floors.data?.length) setSelectedFloor(floors.data[0].id)
  }, [floors.data, selectedFloor])

  const plan = useQuery({
    queryKey: ['floor-plan', selectedFloor],
    queryFn: () => api.get(`/campus/floors/${selectedFloor}/plan`),
    enabled: !!selectedFloor,
  })

  // Live socket: refetch the plan whenever anything on this campus changes.
  useEffect(() => {
    if (!campusId) return
    const close = connectTwin(campusId, {
      onOpen: () => setLive(true),
      onClose: () => setLive(false),
      onEvent: (evt) => {
        if (evt.type === 'connected') return
        if (evt.entity_type === 'asset' && evt.entity_id) {
          setChanged((prev) => new Set(prev).add(evt.entity_id))
          setTimeout(() => {
            setChanged((prev) => {
              const next = new Set(prev)
              next.delete(evt.entity_id)
              return next
            })
          }, 6000)
        }
        qc.invalidateQueries({ queryKey: ['floor-plan'] })
        qc.invalidateQueries({ queryKey: ['campus-overview'] })
      },
    })
    return close
  }, [campusId, qc])

  const stateBreakdown = useMemo(() => {
    if (!plan.data) return {}
    const out = {}
    plan.data.rooms.forEach((r) =>
      (r.assets || []).forEach((a) => {
        out[a.state] = (out[a.state] || 0) + 1
      }),
    )
    return out
  }, [plan.data])

  const { refresh, refreshing } = useRefresh(plan.refetch, overview.refetch)

  if (campuses.isLoading) return <Spinner label="Loading campus…" />
  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.refetch} />
  if (!campusId) {
    return <EmptyState icon={Building2} title="No campus configured"
                       description="An administrator needs to set up the campus hierarchy first." />
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Digital Twin</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Live spatial state of {campuses.data[0].name}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`pill ${live ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-neutral-text'}`}>
            <Radio size={12} className={live ? 'animate-pulse' : ''} />
            {live ? 'Live' : 'Reconnecting…'}
          </span>
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </div>

      {/* Campus totals */}
      {overview.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Buildings', overview.data.totals.buildings],
            ['Rooms', overview.data.totals.rooms],
            ['Assets', overview.data.totals.assets],
            ['Open issues', overview.data.totals.open_issues],
          ].map(([label, value], i) => (
            <div key={label} className="widget px-widget py-3">
              <p className="text-label-caps uppercase text-ink-muted">{label}</p>
              <p className={`text-headline-lg tabular mt-1 ${i === 3 && value > 0 ? 'text-warning-text' : 'text-ink'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Hierarchy rail */}
        <Widget title="Hierarchy" bodyClass="p-0">
          <div className="p-3 space-y-1">
            {(buildings.data || []).map((b) => {
              const meta = overview.data?.buildings?.find((x) => x.id === b.id)
              const active = b.id === buildingId
              return (
                <div key={b.id}>
                  <button
                    onClick={() => { setBuildingId(b.id); setSelectedFloor(null); setSelectedRoom(null) }}
                    className={`w-full flex items-center gap-2 h-10 px-2.5 rounded text-left transition-colors
                                ${active ? 'bg-brand-soft text-brand font-medium' : 'hover:bg-surface-sunken text-ink'}`}
                  >
                    <Building2 size={16} className="shrink-0 text-ink-faint" />
                    <span className="flex-1 truncate text-body-md">{b.name}</span>
                    {meta?.aggregate_colour && meta.asset_count > 0 && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.aggregate_colour }} />
                    )}
                  </button>

                  {active && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-border-subtle pl-2">
                      {(floors.data || []).map((f) => (
                        <button
                          key={f.id}
                          onClick={() => { setSelectedFloor(f.id); setSelectedRoom(null); setSelectedAsset(null) }}
                          className={`w-full flex items-center gap-2 h-9 px-2 rounded text-left text-body-md transition-colors
                                      ${f.id === selectedFloor ? 'bg-secondary text-white' : 'hover:bg-surface-sunken text-ink-muted'}`}
                        >
                          <Layers size={14} className="shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                      {floors.data?.length === 0 && (
                        <p className="text-body-sm text-ink-faint px-2 py-2">No floors configured</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Widget>

        {/* Plan + inspector */}
        <div className="space-y-4">
          <Widget bodyClass="p-0" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-widget py-3 border-b border-border-subtle">
              <div className="flex items-center gap-1.5 text-body-md min-w-0">
                <span className="text-ink-muted truncate">{plan.data?.building?.name || '—'}</span>
                <ChevronRight size={14} className="text-ink-faint shrink-0" />
                <span className="text-ink font-medium truncate">{plan.data?.floor?.name || '—'}</span>
              </div>
              <TwinLegend breakdown={stateBreakdown} />
            </div>

            {plan.isLoading || refreshing ? (
              <div className="p-widget">
                <div className="skeleton w-full rounded-lg" style={{ aspectRatio: '16 / 10' }} />
              </div>
            ) : plan.error ? (
              <ErrorState error={plan.error} onRetry={plan.refetch} />
            ) : !plan.data?.rooms?.length ? (
              <EmptyState icon={Layers} title="No rooms mapped on this floor"
                          description="Add rooms and draw their boundaries in Floor Plan Management." />
            ) : (
              <FloorPlan
                rooms={plan.data.rooms}
                selectedRoomId={selectedRoom?.id}
                selectedAssetId={selectedAsset?.id}
                recentlyChanged={changed}
                onSelectRoom={(r) => { setSelectedRoom(r); setSelectedAsset(null) }}
                onSelectAsset={(a, r) => { setSelectedAsset(a); setSelectedRoom(r) }}
                className="h-[520px]"
              />
            )}
          </Widget>

          {(selectedAsset || selectedRoom) && (
            <Inspector
              asset={selectedAsset} room={selectedRoom}
              onClose={() => { setSelectedAsset(null); setSelectedRoom(null) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Detail card for whatever is selected on the plan. */
function Inspector({ asset, room, onClose }) {
  const detail = useQuery({
    queryKey: ['asset', asset?.id],
    queryFn: () => api.get(`/campus/assets/${asset.id}`),
    enabled: !!asset?.id,
  })

  if (asset) {
    const d = detail.data
    return (
      <Widget
        title={asset.name}
        subtitle={`${asset.tag} · ${room?.name || ''}`}
        action={<button onClick={onClose} className="btn-ghost h-8 w-8 p-0 rounded" aria-label="Close"><X size={16} /></button>}
      >
        {detail.isLoading ? <Spinner label="Loading asset…" /> : (
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <Row label="Status">
                <span className="pill" style={{ background: `${asset.colour}1a`, color: asset.colour }}>
                  <CircleDot size={12} /> {asset.label}
                </span>
              </Row>
              <Row label="Asset ID"><span className="font-mono text-mono-data">{asset.tag}</span></Row>
              {d?.room && <Row label="Zone"><span className="font-mono text-mono-data">{d.room.zone_id || '—'}</span></Row>}
              {d?.asset?.manufacturer && <Row label="Make">{d.asset.manufacturer} {d.asset.model}</Row>}
              <Row label="Open issues">{d?.open_issues?.length ?? 0}</Row>
            </div>

            <div className="space-y-4">
              {d?.open_issues?.length > 0 && (
                <div>
                  <p className="text-label-caps uppercase text-ink-muted mb-2">Active issues</p>
                  <div className="space-y-1.5">
                    {d.open_issues.map((i) => (
                      <Link key={i.id} to={`/issues/${i.id}`}
                            className="flex items-center justify-between gap-2 p-2 rounded border border-border-subtle hover:bg-surface-sunken transition-colors">
                        <div className="min-w-0">
                          <p className="font-mono text-mono-data text-secondary">{i.reference}</p>
                          <p className="text-body-sm text-ink truncate">{i.title}</p>
                        </div>
                        <StatusPill status={i.status} />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {d?.condition_history?.length > 0 && (
                <div>
                  <p className="text-label-caps uppercase text-ink-muted mb-2">Condition history</p>
                  <div className="space-y-1">
                    {d.condition_history.slice(0, 4).map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-body-sm">
                        <span className="text-ink-faint w-24 shrink-0">{ago(h.at)}</span>
                        <span className="text-ink-muted">
                          {titleCase(h.from || 'new')} → <strong className="text-ink">{titleCase(h.to)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Widget>
    )
  }

  return (
    <Widget
      title={room.name}
      subtitle={room.zone_id || room.code}
      action={<button onClick={onClose} className="btn-ghost h-8 w-8 p-0 rounded" aria-label="Close"><X size={16} /></button>}
    >
      <div className="grid sm:grid-cols-4 gap-4">
        <Row label="Type">{titleCase(room.kind)}</Row>
        <Row label="Capacity">{room.capacity ?? '—'}</Row>
        <Row label="Area">{room.area_sqft ? `${room.area_sqft} sq ft` : '—'}</Row>
        <Row label="Open issues">{room.open_issue_count}</Row>
      </div>

      {room.assets?.length > 0 && (
        <div className="mt-5">
          <p className="text-label-caps uppercase text-ink-muted mb-2">Assets in this room</p>
          <div className="flex flex-wrap gap-2">
            {room.assets.map((a) => (
              <span key={a.id} className="pill border border-border-subtle bg-surface">
                <span className="w-2 h-2 rounded-full" style={{ background: a.colour }} />
                <span className="font-mono text-mono-data">{a.tag}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Widget>
  )
}

function Row({ label, children }) {
  return (
    <div>
      <p className="text-label-caps uppercase text-ink-muted">{label}</p>
      <div className="text-body-md text-ink mt-1">{children}</div>
    </div>
  )
}
