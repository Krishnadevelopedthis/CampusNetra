import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes, Building2, ChevronRight, CircleDot, DoorOpen, Landmark, Layers, Pencil,
  Plus, Radio, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Field, Input, Modal, RefreshButton, Spinner,
  StatusPill, Widget, toast,
} from '@/components/ui'
import { FloorPlan, TwinLegend } from '@/features/twin/FloorPlan'
import { AssetModal, RoomModal } from '@/features/twin/AssetRoomModals'
import { useRefresh } from '@/hooks/useRefresh'
import { useAuth } from '@/lib/auth'
import { api, connectTwin } from '@/lib/api'
import { ago, titleCase } from '@/lib/format'

export default function DigitalTwin() {
  const { user } = useAuth()
  const canEdit = ['technician', 'facility_manager', 'admin', 'super_admin']
    .includes(user?.role)
  const { floorId } = useParams()
  const [searchParams] = useSearchParams()
  const wantedRoom = searchParams.get('room')
  const qc = useQueryClient()

  const [buildingId, setBuildingId] = useState(null)
  const [selectedFloor, setSelectedFloor] = useState(floorId || null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [live, setLive] = useState(false)
  const [roomModal, setRoomModal] = useState(null)
  const [assetModal, setAssetModal] = useState(false)
  const [placeForm, setPlaceForm] = useState(null)   // campus / building / floor
  // Assets whose state changed in the last few seconds get a pulse ring.
  const [changed, setChanged] = useState(new Set())

  const assetCategories = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => api.get('/campus/asset-categories'),
    enabled: canEdit,
  })

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

  // Arriving from the campus map with ?room=… — select that room as soon as
  // the plan holding it has loaded, so the deep link lands on the thing the
  // user clicked rather than on the floor that contains it.
  useEffect(() => {
    if (!wantedRoom || !plan.data?.rooms) return
    const match = plan.data.rooms.find((r) => r.id === wantedRoom)
    if (match) setSelectedRoom(match)
  }, [wantedRoom, plan.data])

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

  const createPlace = useMutation({
    mutationFn: ({ kind, body }) => {
      if (kind === 'campus') return api.post('/campus/campuses', body)
      if (kind === 'building') return api.post(`/campus/campuses/${campusId}/buildings`, body)
      return api.post(`/campus/buildings/${buildingId}/floors`, body)
    },
    onSuccess: (created, { kind }) => {
      toast.success(`${created.name} added.`)
      setPlaceForm(null)
      qc.invalidateQueries({ queryKey: ['campuses'] })
      qc.invalidateQueries({ queryKey: ['campus-overview'] })
      qc.invalidateQueries({ queryKey: ['buildings'] })
      qc.invalidateQueries({ queryKey: ['floors'] })
      // Drop straight into what was just created, so the chain carries on
      // rather than ending at a list the person has to hunt through.
      if (kind === 'building') { setBuildingId(created.id); setSelectedFloor(null) }
      if (kind === 'floor') setSelectedFloor(created.id)
    },
    onError: (e) => toast.error(e.detail || 'Could not add that'),
  })

  // Guarded: refetch() runs even on a disabled query, so with no floor chosen
  // the refresh button used to request /campus/floors/null/plan and answer with
  // a validation error across the plan area of an estate that simply had
  // nothing in it yet.
  const { refresh, refreshing } = useRefresh(
    selectedFloor ? plan.refetch : null,
    campusId ? overview.refetch : null,
    campusId ? buildings.refetch : null,
    campuses.refetch,
  )

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
        {/* Left rail: the hierarchy, and the controls that extend it */}
        <div className="space-y-4">
        <Widget
          title="Hierarchy"
          action={canEdit && (
            <button className="btn-ghost btn-sm !px-2"
                    onClick={() => setPlaceForm({ kind: 'building', floors_count: 1 })}>
              <Plus size={14} /> Building
            </button>
          )}
          bodyClass="p-0"
        >
          <div className="p-3 space-y-1">
            {buildings.data?.length === 0 && (
              <p className="text-body-sm text-ink-faint px-2 py-4 text-center">
                No buildings yet.{canEdit && ' Add one to start mapping the campus.'}
              </p>
            )}
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
                      {canEdit && (
                        <button
                          onClick={() => setPlaceForm({
                            kind: 'floor',
                            level: (Math.max(0, ...(floors.data || []).map((f) => f.level)) || 0) + 1,
                          })}
                          className="w-full flex items-center gap-2 h-9 px-2 rounded text-left
                                     text-body-sm text-ink-faint hover:text-ink hover:bg-surface-sunken
                                     transition-colors"
                        >
                          <Plus size={14} className="shrink-0" /> Add floor
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Widget>

        {/* Build out the floor you are looking at.
            This lives on the twin rather than only in the admin panel because
            the twin is where a missing room is noticed — an empty floor plan is
            the thing that tells you nothing has been mapped yet, and sending
            someone to another screen to act on it is how estates stay
            half-configured. */}
        {canEdit && (
          <Widget
            title="Build out the campus"
            subtitle={plan.data?.floor?.name
              ? `${plan.data?.building?.name} · ${plan.data.floor.name}`
              : 'Campus → building → floor → room → equipment'}
          >
            <div className="space-y-2">
              <button
                onClick={() => setPlaceForm({ kind: 'campus' })}
                className="btn-secondary w-full justify-start"
              >
                <Landmark size={16} /> Add campus
              </button>

              <button
                onClick={() => setPlaceForm({ kind: 'building', floors_count: 1 })}
                className="btn-secondary w-full justify-start"
              >
                <Building2 size={16} /> Add building
              </button>

              <button
                onClick={() => setPlaceForm({
                  kind: 'floor',
                  level: (Math.max(0, ...(floors.data || []).map((f) => f.level)) || 0) + 1,
                })}
                disabled={!buildingId}
                title={buildingId ? undefined : 'Pick a building first'}
                className="btn-secondary w-full justify-start"
              >
                <Layers size={16} /> Add floor
              </button>

              <button
                onClick={() => setRoomModal({ floor_id: selectedFloor })}
                disabled={!selectedFloor}
                className="btn-secondary w-full justify-start"
              >
                <DoorOpen size={16} /> Add classroom or lab
              </button>

              <button
                onClick={() => setAssetModal(true)}
                disabled={!selectedRoom}
                className="btn-secondary w-full justify-start"
                title={selectedRoom ? undefined : 'Pick a room on the plan first'}
              >
                <Boxes size={16} /> Add assets
                {selectedRoom && (
                  <span className="font-mono text-body-sm text-ink-faint ml-auto">
                    {selectedRoom.code}
                  </span>
                )}
              </button>

              <p className="text-body-sm text-ink-faint pt-1">
                {!buildingId
                  ? 'Add a building to start, or pick one above.'
                  : !selectedFloor
                    ? 'Choose a floor above, or add one.'
                    : !selectedRoom
                      ? 'Assets belong to a room — click one on the plan to add equipment to it.'
                      : `Equipment will be registered in ${selectedRoom.name}.`}
              </p>

              {selectedFloor && (
                <Link
                  to="/admin/assets"
                  className="btn-ghost btn-sm w-full justify-start !px-2"
                >
                  <Pencil size={14} /> Manage the full registry
                </Link>
              )}
            </div>
          </Widget>
        )}
        </div>

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
                planImage={plan.data.floor?.floor_plan_url}
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
      <PlaceModal form={placeForm} onClose={() => setPlaceForm(null)}
                  onSave={createPlace.mutate} saving={createPlace.isPending} />
      <RoomModal
        open={!!roomModal}
        room={null}
        floorId={selectedFloor}
        onClose={() => setRoomModal(null)}
        onSaved={() => {
          setRoomModal(null)
          qc.invalidateQueries({ queryKey: ['floor-plan', selectedFloor] })
        }}
      />

      <AssetModal
        open={assetModal}
        asset={null}
        roomId={selectedRoom?.id}
        categories={assetCategories.data || []}
        onClose={() => setAssetModal(false)}
        onSaved={() => {
          setAssetModal(false)
          qc.invalidateQueries({ queryKey: ['floor-plan', selectedFloor] })
          qc.invalidateQueries({ queryKey: ['campus-overview'] })
        }}
      />

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


/**
 * The three levels above a room: campus, building, floor.
 *
 * One dialog for all three because they differ only in which fields apply, and
 * because the point of the panel that opens it is that the whole chain is one
 * flow — a person mapping a new site should not be sent to three screens to
 * describe one building.
 */
const PLACE_TITLES = {
  campus: 'Add a campus',
  building: 'Add a building',
  floor: 'Add a floor',
}

function PlaceModal({ form, onClose, onSave, saving }) {
  const [draft, setDraft] = useState({})

  // Reset when a different level is opened, so a building's code does not
  // arrive prefilled in the floor dialog.
  useEffect(() => { setDraft(form || {}) }, [form])

  if (!form) return null
  const kind = form.kind
  const set = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value }))
  const complete = kind === 'floor'
    ? !!draft.name
    : !!draft.name && !!draft.code

  return (
    <Modal
      open onClose={onClose} title={PLACE_TITLES[kind]} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!complete}
                  onClick={() => onSave({
                    kind,
                    body: kind === 'campus'
                      ? { name: draft.name, code: draft.code, address: draft.address || null }
                      : kind === 'building'
                        ? {
                          name: draft.name, code: draft.code,
                          floors_count: Math.max(1, Number(draft.floors_count) || 1),
                        }
                        : { name: draft.name, level: Number(draft.level) || 0 },
                  })}>
            {PLACE_TITLES[kind]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required className={kind === 'floor' ? '' : undefined}>
            <Input value={draft.name || ''} onChange={set('name')}
                   placeholder={kind === 'campus' ? 'Main Campus'
                     : kind === 'building' ? 'Science Block' : 'Second Floor'} />
          </Field>
          {kind === 'floor' ? (
            <Field label="Level" hint="0 is ground">
              <Input type="number" value={draft.level ?? ''} onChange={set('level')} />
            </Field>
          ) : (
            <Field label="Code" required hint="Short and unique">
              <Input value={draft.code || ''} onChange={set('code')}
                     placeholder={kind === 'campus' ? 'MAIN' : 'SCI'} />
            </Field>
          )}
        </div>

        {kind === 'campus' && (
          <Field label="Address">
            <Input value={draft.address || ''} onChange={set('address')} />
          </Field>
        )}

        {kind === 'building' && (
          <Field label="How many floors?"
                 hint="Created with the building — a building with no floors cannot hold rooms. More can be added later.">
            <Input type="number" min="1" max="100" value={draft.floors_count ?? 1}
                   onChange={set('floors_count')} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
