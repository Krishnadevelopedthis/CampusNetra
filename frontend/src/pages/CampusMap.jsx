import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes, ChevronLeft, ChevronRight, CircleDot, DoorOpen, Download, Flame,
  Landmark, Layers, Maximize, PanelTop, Plus, RotateCcw, RotateCw, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Metric,
  MetricRow,
  RefreshButton,
  Select,
  Spinner,
  StatusPill,
  Widget,
} from '@/components/ui'
import { AssetModal, PlaceModal, RoomModal } from '@/features/twin/AssetRoomModals'
// Lazy: maplibre-gl is a large dependency that only matters once a campus
// actually has real-world coordinates set (hasOutdoorMap below) — most
// visits to this page shouldn't pay for it just to render the three.js
// fallback grid.
const OutdoorCampusMap = lazy(() =>
  import('@/features/twin/OutdoorCampusMap').then((m) => ({ default: m.OutdoorCampusMap })))
import { CampusScene3D } from '@/features/twin/Scene3D'
import { TwinLegend } from '@/features/twin/FloorPlan'
import { SkeletonMetrics } from '@/components/Skeletons'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, titleCase, TWIN_STATE } from '@/lib/format'

/**
 * Buildings need map_x/map_y (0–1) to be placed, set via an easy-to-miss
 * field in Campus Management. A building with none set used to be dropped
 * from the map entirely — with enough of them, the map looked empty even
 * though every building existed and had rooms/assets. Buildings missing
 * coordinates are now auto-arranged in a grid instead, so the map always
 * shows something; a building an admin has actually positioned keeps its
 * exact spot untouched.
 */
function layoutBuildings(buildings) {
  const positioned = buildings.filter((b) => b.map_x != null && b.map_y != null)
  const unpositioned = buildings.filter((b) => b.map_x == null || b.map_y == null)
  if (unpositioned.length === 0) return { placed: positioned, autoCount: 0 }

  const cols = Math.max(1, Math.ceil(Math.sqrt(unpositioned.length)))
  const rows = Math.max(1, Math.ceil(unpositioned.length / cols))
  const auto = unpositioned.map((b, i) => ({
    ...b,
    map_x: (i % cols + 0.5) / cols,
    map_y: (Math.floor(i / cols) + 0.5) / rows,
    _autoPositioned: true,
  }))
  return { placed: [...positioned, ...auto], autoCount: auto.length }
}

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

  // Drill-down state: clicking a building/floor/room in the 3D scene moves
  // one level in; the breadcrumb below moves back out. Deeper ids are kept
  // even when backing out, so stepping forward again doesn't need a re-pick.
  const [view, setView] = useState('campus')       // campus | building | floor | room
  const [selectedBuildingId, setSelectedBuildingId] = useState(null)
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [selectedFloorId, setSelectedFloorId] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [pendingPlacement, setPendingPlacement] = useState(null)
  // Off by default: the ceiling plane used to always be clickable, and being
  // a full-footprint plane near the top of the room, it often caught a
  // click meant for the floor or a wall before the ray reached them --
  // assets kept landing on the ceiling with no way to target it on purpose
  // or avoid it by accident. Now it only exists (and is only clickable)
  // while this is on, and the admin turns it on deliberately.
  const [ceilingEnabled, setCeilingEnabled] = useState(false)
  const [placeForm, setPlaceForm] = useState(null)
  const [roomModal, setRoomModal] = useState(false)
  // Imperative handle onto the indoor 3D scene, for the on-screen nav
  // buttons below — dragging to orbit is awkward on a touchscreen, so
  // rotate/tilt/zoom/reset are also reachable as taps.
  const sceneRef = useRef(null)
  const [assetModal, setAssetModal] = useState(false)

  const { user } = useAuth()
  const canEdit = ['technician', 'facility_manager', 'admin', 'super_admin'].includes(user?.role)
  const qc = useQueryClient()

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const overview = useQuery({
    queryKey: ['campus-overview', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/overview`),
    enabled: !!campusId,
  })

  const assetCategories = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => api.get('/campus/asset-categories'),
    enabled: canEdit,
  })

  // The heatmap endpoint is manager-and-above, but Campus Map is in the student
  // and teacher navigation, so every reporter opening this page fired a request
  // that could only 403. Ask for it only when it can be answered, and drop the
  // toggle that offers it otherwise.
  const canSeeHeat = ['facility_manager', 'admin', 'super_admin'].includes(user?.role)
  const heat = useQuery({
    queryKey: ['heatmap', campusId, days],
    queryFn: () => api.get('/analytics/heatmap', { params: { days, campus_id: campusId } }),
    enabled: !!campusId && canSeeHeat,
  })

  // Only needed once a floor is in view — the room level needs each asset's
  // actual x/y to place its marker; the floor level only needs the overview's
  // per-room counts, already in hand, but fetching here too keeps the room
  // click instant instead of waiting on a second round trip.
  const plan = useQuery({
    queryKey: ['floor-plan', selectedFloorId],
    queryFn: () => api.get(`/campus/floors/${selectedFloorId}/plan`),
    enabled: !!selectedFloorId && (view === 'floor' || view === 'room'),
  })
  const planRoom = plan.data?.rooms?.find((r) => r.id === selectedRoomId) || null

  const navigate = (v, ids = {}) => {
    setView(v)
    if ('buildingId' in ids) setSelectedBuildingId(ids.buildingId)
    if ('floorId' in ids) setSelectedFloorId(ids.floorId)
    if ('roomId' in ids) setSelectedRoomId(ids.roomId)
  }

  const { refresh, refreshing } = useRefresh(
    overview.refetch, canSeeHeat ? heat.refetch : null, campuses.refetch,
    selectedFloorId ? plan.refetch : null,
  )

  const createPlace = useMutation({
    mutationFn: ({ kind, body }) => {
      if (kind === 'campus') return api.post('/campus/campuses', body)
      if (kind === 'building') return api.post(`/campus/campuses/${campusId}/buildings`, body)
      return api.post(`/campus/buildings/${selectedBuildingId}/floors`, body)
    },
    onSuccess: (created, { kind }) => {
      setPlaceForm(null)
      qc.invalidateQueries({ queryKey: ['campuses'] })
      qc.invalidateQueries({ queryKey: ['campus-overview'] })
      if (kind === 'building') navigate('building', { buildingId: created.id, floorId: null, roomId: null })
      if (kind === 'floor') navigate('floor', { floorId: created.id, roomId: null })
    },
  })

  const busy = campuses.isLoading || overview.isLoading || refreshing

  // Scene3D tears down and rebuilds its whole WebGL scene whenever these
  // change identity — memoised so an unrelated re-render (a query refetch,
  // a hover, the parent's own state ticking) doesn't hand it a new Map/array
  // every time and reset the camera the user just dragged into place. Kept
  // above the early-return below since hooks can't run conditionally.
  const heatByBuilding = useMemo(
    () => new Map((heat.data?.buildings || []).map((b) => [b.id, b])),
    [heat.data],
  )
  const buildings = overview.data?.buildings || []
  const { placed: laidOut, autoCount } = useMemo(
    () => layoutBuildings(buildings),
    // buildings is a fresh array each render (overview.data?.buildings || []),
    // so key off overview.data itself, which react-query only replaces when
    // the response actually changes.
    [overview.data],
  )

  if (overview.error && !overview.data) {
    return <ErrorState error={overview.error} onRetry={overview.refetch} />
  }

  // The outdoor map needs the campus itself geolocated; a building missing
  // only its own lat/lng just doesn't get a footprint drawn (handled inside
  // OutdoorCampusMap) rather than losing the whole outdoor view over one
  // building never having been pinned.
  const campusGeo = overview.data?.campus
  const hasOutdoorMap = view === 'campus' && campusGeo?.latitude != null && campusGeo?.longitude != null
  const buildingsMissingGeo = hasOutdoorMap
    ? buildings.filter((b) => b.latitude == null || b.longitude == null).length
    : 0
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId)
  const selectedFloor = selectedBuilding?.floors?.find((f) => f.id === selectedFloorId)

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

  if (campuses.isLoading) return <Spinner label="Loading campus…" />
  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.refetch} />
  if (!campusId) {
    return (
      <>
        <EmptyState
          icon={Landmark} title="No campus configured"
          description="Start with a campus, then add its buildings, floors, rooms and equipment."
          action={canEdit ? (
            <Button icon={Plus} onClick={() => setPlaceForm({ kind: 'campus' })}>
              Add a campus
            </Button>
          ) : undefined}
        />
        <PlaceModal form={placeForm} onClose={() => setPlaceForm(null)}
                    onSave={createPlace.mutate} saving={createPlace.isPending} />
      </>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Campus Map</h1>
          <p className="text-body-md text-ink-muted mt-1">
            The real thing, rendered — walk in from campus down to a single room.
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
        <MetricRow>
          <Metric label="Buildings" value={overview.data.totals.buildings} accent="rgb(var(--c-brand))" />
          <Metric label="Rooms" value={overview.data.totals.rooms} accent="#3b82f6" />
          <Metric label="Assets" value={overview.data.totals.assets} accent="#8b5cf6" />
          <Metric label="Open issues" value={overview.data.totals.open_issues}
                  accent={overview.data.totals.open_issues > 0 ? '#f59e0b' : '#10b981'} />
        </MetricRow>
      )}

      <Widget bodyClass="p-0" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-widget border-b border-border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            {view !== 'campus' && (
              <button
                onClick={() => {
                  if (view === 'room') navigate('floor', { roomId: null })
                  else if (view === 'floor') navigate('building', { floorId: null })
                  else navigate('campus', { buildingId: null })
                }}
                className="btn-ghost h-8 w-8 p-0 rounded shrink-0"
                aria-label="Back"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <nav className="flex items-center gap-1 text-body-md min-w-0 overflow-hidden">
              <Crumb active={view === 'campus'} onClick={() => navigate('campus')}>
                {overview.data?.campus?.name || 'Campus'}
              </Crumb>
              {selectedBuilding && (
                <>
                  <ChevronRight size={13} className="text-ink-faint shrink-0" />
                  <Crumb active={view === 'building'} onClick={() => navigate('building', { floorId: null, roomId: null })}>
                    {selectedBuilding.code}
                  </Crumb>
                </>
              )}
              {selectedFloor && (
                <>
                  <ChevronRight size={13} className="text-ink-faint shrink-0" />
                  <Crumb active={view === 'floor'} onClick={() => navigate('floor', { roomId: null })}>
                    {selectedFloor.name}
                  </Crumb>
                </>
              )}
              {view === 'room' && planRoom && (
                <>
                  <ChevronRight size={13} className="text-ink-faint shrink-0" />
                  <Crumb active>{planRoom.code}</Crumb>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {view === 'campus' && (
              <div className="flex p-1 bg-surface-sunken rounded-lg">
                {[['condition', 'Live condition'],
                  ...(canSeeHeat ? [['heat', 'Complaint heatmap']] : [])].map(([k, label]) => (
                  <button key={k} onClick={() => setMode(k)}
                          className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                            mode === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                          }`}>{label}</button>
                ))}
              </div>
            )}
            {view === 'campus' && mode === 'condition' && (
              <TwinLegend breakdown={overview.data?.state_breakdown} />
            )}
            {view === 'campus' && mode === 'heat' && (
              <div className="flex items-center gap-2 text-body-sm text-ink-muted">
                <span>Fewer</span>
                <span className="h-2 w-24 rounded-full" style={{
                  background: 'linear-gradient(90deg, rgb(59,130,246), rgb(16,185,129), rgb(245,158,11), rgb(239,68,68))',
                }} />
                <span>More</span>
              </div>
            )}

            {canEdit && view === 'campus' && (
              <Button size="sm" icon={Plus} onClick={() => setPlaceForm({ kind: 'building' })}>
                Add building
              </Button>
            )}
            {canEdit && view === 'building' && (
              <Button size="sm" icon={Layers} onClick={() => setPlaceForm({ kind: 'floor' })}>
                Add floor
              </Button>
            )}
            {canEdit && view === 'floor' && (
              <Button size="sm" icon={DoorOpen} onClick={() => setRoomModal(true)}>
                Add room
              </Button>
            )}
            {canEdit && view === 'room' && (
              <>
                <Button
                  size="sm" icon={PanelTop}
                  variant={ceilingEnabled ? 'primary' : 'secondary'}
                  onClick={() => setCeilingEnabled((v) => !v)}
                  title={ceilingEnabled
                    ? 'Ceiling placement is on — clicking the ceiling places an asset there'
                    : 'Ceiling placement is off — turn on to place equipment on the ceiling'}
                >
                  Ceiling {ceilingEnabled ? 'on' : 'off'}
                </Button>
                <Button size="sm" icon={Boxes} onClick={() => setAssetModal(true)}>
                  Add asset
                </Button>
              </>
            )}
          </div>
        </div>

        {busy ? (
          <div className="p-widget">
            <div className="skeleton w-full rounded-xl" style={{ aspectRatio: '16 / 9' }} />
          </div>
        ) : view === 'campus' && buildings.length === 0 ? (
          <EmptyState icon={Landmark} title="No buildings yet"
                      description="Add a building to see it appear on the campus."
                      action={canEdit ? (
                        <Button icon={Plus} onClick={() => setPlaceForm({ kind: 'building' })}>Add building</Button>
                      ) : undefined} />
        ) : (
          <div className="relative bg-surface-sunken" style={{ height: 560 }}>
            {view === 'campus' && hasOutdoorMap && buildingsMissingGeo > 0 && (
              <p className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-body-sm text-ink-faint bg-surface/90 backdrop-blur px-3 py-1.5 rounded-full border border-border-subtle">
                {buildingsMissingGeo} building{buildingsMissingGeo === 1 ? '' : 's'} without map coordinates aren't shown on the outdoor map.
              </p>
            )}
            {view === 'campus' && !hasOutdoorMap && autoCount > 0 && (
              <p className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-body-sm text-ink-faint bg-surface/90 backdrop-blur px-3 py-1.5 rounded-full border border-border-subtle">
                {autoCount === buildings.length
                  ? 'Positions are approximate — set exact coordinates in Campus Management.'
                  : `${autoCount} building${autoCount === 1 ? '' : 's'} at an approximate position.`}
              </p>
            )}
            {view === 'campus' && hasOutdoorMap ? (
              <Suspense fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner label="Loading map…" />
                </div>
              }>
                <OutdoorCampusMap
                  campus={overview.data.campus}
                  buildings={buildings}
                  mode={mode}
                  heatByBuilding={heatByBuilding}
                  heatColour={heatColour}
                  onSelectBuilding={(id) => navigate('building', { buildingId: id, floorId: null, roomId: null })}
                  className="w-full h-full"
                />
              </Suspense>
            ) : view === 'room' && plan.isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner label="Loading room…" />
              </div>
            ) : (
              <>
                <CampusScene3D
                  ref={sceneRef}
                  view={view}
                  buildings={laidOut}
                  autoCount={autoCount}
                  mode={mode}
                  heatByBuilding={heatByBuilding}
                  heatColour={heatColour}
                  selectedBuildingId={selectedBuildingId}
                  selectedFloorId={selectedFloorId}
                  selectedRoomId={selectedRoomId}
                  roomAssets={view === 'room' ? (planRoom?.assets ?? null) : null}
                  pendingPlacement={pendingPlacement}
                  ceilingEnabled={canEdit && ceilingEnabled}
                  onSelectBuilding={(id) => navigate('building', { buildingId: id, floorId: null, roomId: null })}
                  onSelectFloor={(id) => navigate('floor', { floorId: id, roomId: null })}
                  onSelectRoom={(id) => { setPendingPlacement(null); navigate('room', { roomId: id }) }}
                  onSelectAsset={(a) => setSelectedAsset(a)}
                  onPlaceAsset={canEdit ? (pos) => { setPendingPlacement(pos); setAssetModal(true) } : undefined}
                  className="w-full h-full"
                />
                {/* Touch-friendly alternative to drag-to-orbit — same controls
                    work on desktop too, just less necessary there. */}
                <div className="absolute right-3 top-14 z-10 flex flex-col gap-1.5">
                  <SceneNavButton icon={ZoomIn} label="Zoom in" onClick={() => sceneRef.current?.zoom(0.8)} />
                  <SceneNavButton icon={ZoomOut} label="Zoom out" onClick={() => sceneRef.current?.zoom(1.25)} />
                  <SceneNavButton icon={RotateCcw} label="Rotate left" onClick={() => sceneRef.current?.rotate(-20)} />
                  <SceneNavButton icon={RotateCw} label="Rotate right" onClick={() => sceneRef.current?.rotate(20)} />
                  <SceneNavButton icon={Maximize} label="Reset view" onClick={() => sceneRef.current?.resetView()} />
                </div>
              </>
            )}

            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-body-sm text-ink-faint bg-surface/80 backdrop-blur px-3 py-1 rounded-full pointer-events-none">
              {view === 'campus' && hasOutdoorMap
                ? 'Drag to orbit · scroll to zoom · click a building'
                : `Drag to orbit · scroll to zoom · click a ${view === 'campus' ? 'building' : view === 'building' ? 'floor' : view === 'floor' ? 'room' : 'floor space to place equipment'}`}
            </p>
          </div>
        )}
      </Widget>

      {(selectedAsset || (view === 'room' && planRoom)) && (
        <Inspector
          asset={selectedAsset} room={view === 'room' ? planRoom : null}
          onClose={() => setSelectedAsset(null)}
        />
      )}

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
                  <tr key={b.id} className="cursor-pointer"
                      onClick={() => navigate('building', { buildingId: b.id, floorId: null, roomId: null })}>
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

      <PlaceModal form={placeForm} onClose={() => setPlaceForm(null)}
                  onSave={createPlace.mutate} saving={createPlace.isPending} />

      <RoomModal
        open={roomModal}
        room={null}
        floorId={selectedFloorId}
        onClose={() => setRoomModal(false)}
        onSaved={() => {
          setRoomModal(false)
          qc.invalidateQueries({ queryKey: ['campus-overview'] })
          qc.invalidateQueries({ queryKey: ['floor-plan', selectedFloorId] })
        }}
      />

      <AssetModal
        open={assetModal}
        asset={null}
        roomId={selectedRoomId}
        campusId={campusId}
        categories={assetCategories.data || []}
        initialPosition={pendingPlacement}
        onClose={() => { setAssetModal(false); setPendingPlacement(null) }}
        onSaved={() => {
          setAssetModal(false)
          setPendingPlacement(null)
          qc.invalidateQueries({ queryKey: ['floor-plan', selectedFloorId] })
          qc.invalidateQueries({ queryKey: ['campus-overview'] })
        }}
      />
    </div>
  )
}

function SceneNavButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label}
      className="h-9 w-9 rounded-full bg-surface/90 backdrop-blur border border-border-subtle
                 shadow-level2 flex items-center justify-center text-ink-muted
                 hover:text-ink hover:bg-surface active:scale-95 transition-transform"
    >
      <Icon size={16} />
    </button>
  )
}

function Crumb({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={active}
      className={`px-1.5 h-7 rounded truncate max-w-[160px] ${
        active ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
      }`}
    >
      {children}
    </button>
  )
}

/** Detail card for whichever room is currently open, or an asset clicked inside it. */
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
                      <div key={i.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border-subtle">
                        <div className="min-w-0">
                          <p className="font-mono text-mono-data text-secondary">{i.reference}</p>
                          <p className="text-body-sm text-ink truncate">{i.title}</p>
                        </div>
                        <StatusPill status={i.status} />
                      </div>
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

  if (!room) return null
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
          <p className="text-label-caps uppercase text-ink-muted mb-2">Assets in this room — click one in the scene for details</p>
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
