import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Image as ImageIcon,
  Layers,
  MousePointer2,
  Pencil,
  Plus,
  Save,
  Square,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Widget,
  toast,
} from '@/components/ui'
import { AssetModal } from '@/features/twin/AssetRoomModals'
import { useCascadingDelete } from '@/hooks/useCascadingDelete'
import { api, mediaUrl, upload } from '@/lib/api'
import { titleCase } from '@/lib/format'
import { loadPlanPixels, traceRoomAt } from '@/lib/planTrace'

const VB = 1000
const ROOM_KINDS = [
  'classroom', 'lecture_hall', 'laboratory', 'office', 'library', 'washroom',
  'corridor', 'cafeteria', 'auditorium', 'hostel_room', 'server_room', 'store',
  'utility', 'other',
]

/** select · trace a room off the plan · draw one by hand · place an asset */
const MODES = {
  select: { label: 'Select', icon: MousePointer2 },
  trace: { label: 'Trace room', icon: Wand2, needsPlan: true },
  draw: { label: 'Draw room', icon: Square },
  place: { label: 'Place asset', icon: Plus },
}

export default function FloorPlanEditor() {
  const qc = useQueryClient()
  const svgRef = useRef(null)

  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [mode, setMode] = useState('select')
  const [draft, setDraft] = useState([])          // polygon being drawn
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [placingAsset, setPlacingAsset] = useState(null)
  const [roomForm, setRoomForm] = useState(null)  // open modal when non-null
  const [assetForm, setAssetForm] = useState(null)
  const [floorForm, setFloorForm] = useState(null)
  const [tracing, setTracing] = useState(false)
  const pixels = useRef(null)   // greyscale plan, kept for repeated tracing

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
  const categories = useQuery({
    queryKey: ['asset-categories'], queryFn: () => api.get('/campus/asset-categories'),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['floor-plan', floorId] })
    qc.invalidateQueries({ queryKey: ['assets'] })
  }

  const createRoom = useMutation({
    mutationFn: (body) => api.post(`/campus/floors/${floorId}/rooms`, body),
    onSuccess: (r) => {
      toast.success(`${r.code} created.`)
      setDraft([]); setRoomForm(null); setMode('select'); refresh()
    },
    onError: (e) => toast.error(e.detail || 'Could not create the room'),
  })

  const updateRoom = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/campus/rooms/${id}`, body),
    onSuccess: (r) => { toast.success(`${r.code} updated.`); setRoomForm(null); refresh() },
    onError: (e) => toast.error(e.detail || 'Could not update the room'),
  })

  const deleteRoom = useCascadingDelete({
    path: '/campus/rooms',
    onDone: () => { setSelectedRoom(null); refresh() },
  })


  const moveAsset = useMutation({
    mutationFn: ({ id, pos }) => api.patch(`/campus/assets/${id}/position`, pos),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e.detail),
  })

  const uploadPlan = useMutation({
    mutationFn: async (file) => {
      const body = new FormData()
      body.append('file', file)
      const data = await upload('/uploads/image', body, { params: { purpose: 'floorplan' } })
      return api.patch(`/campus/floors/${floorId}/plan-image`, {
        floor_plan_url: data.url, plan_width: data.width, plan_height: data.height,
      })
    },
    onSuccess: () => { toast.success('Floor plan uploaded.'); refresh() },
    onError: (e) => toast.error(e.detail || e.message || 'Could not upload the plan'),
  })

  const addFloor = useMutation({
    mutationFn: (body) => api.post(`/campus/buildings/${buildingId}/floors`, body),
    onSuccess: (f) => {
      toast.success(`${f.name} added. Upload its plan to start outlining rooms.`)
      setFloorForm(null)
      qc.invalidateQueries({ queryKey: ['floors', buildingId] })
      setFloorId(f.id)
    },
    onError: (e) => toast.error(e.detail || 'Could not add the floor'),
  })

  const rooms = plan.data?.rooms || []
  const planImage = plan.data?.floor?.floor_plan_url
  const planW = plan.data?.floor?.plan_width
  const planH = plan.data?.floor?.plan_height

  // The canvas takes the plan's own proportions so the image fills it exactly.
  // A fixed square viewBox letterboxed a wide plan inside the canvas, which put
  // every traced and hand-drawn outline out by the size of the empty margin.
  const vbH = planW && planH ? Math.round((VB * planH) / planW) : VB

  /**
   * Convert a click into normalised 0..1 plan coordinates.
   *
   * Via the SVG's own screen matrix rather than the element's bounding box:
   * the viewBox is scaled and centred inside the element, so box arithmetic is
   * only right when the two happen to share an aspect ratio.
   */
  const pointFromEvent = useCallback((e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const local = pt.matrixTransform(svg.getScreenCTM().inverse())
    const clamp = (n) => Math.min(1, Math.max(0, n))
    return { x: clamp(local.x / VB), y: clamp(local.y / vbH) }
  }, [vbH])

  // The plan is decoded once per floor and kept, so tracing the fiftieth room
  // costs a flood fill rather than another decode of a multi-megabyte scan.
  useEffect(() => {
    pixels.current = null
    if (!planImage) return
    let cancelled = false
    loadPlanPixels(mediaUrl(planImage))
      .then((px) => { if (!cancelled) pixels.current = px })
      .catch(() => { /* reported when tracing is actually attempted */ })
    return () => { cancelled = true }
  }, [planImage])

  const traceAt = async (p) => {
    setTracing(true)
    try {
      if (!pixels.current) {
        pixels.current = await loadPlanPixels(mediaUrl(planImage))
      }
      const hit = traceRoomAt(pixels.current, p.x, p.y)
      if (!hit) {
        toast.error(
          'No enclosed room found there. Click inside a room rather than on a '
          + 'wall, or use Draw room to outline it by hand.',
        )
        return
      }
      setRoomForm({ boundary: hit.boundary, kind: 'classroom', traced: true })
    } catch {
      toast.error('That plan image could not be read for tracing. Draw the room by hand instead.')
    } finally {
      setTracing(false)
    }
  }

  const onCanvasClick = (e) => {
    if (mode === 'trace') {
      if (!tracing) traceAt(pointFromEvent(e))
      return
    }
    if (mode === 'draw') {
      const p = pointFromEvent(e)
      setDraft((d) => [...d, [round5(p.x), round5(p.y)]])
      return
    }
    if (mode === 'place') {
      const p = pointFromEvent(e)
      const room = roomAtPoint(plan.data?.rooms || [], p)
      if (!room) {
        toast.error('Click inside a room — assets belong to a room.')
        return
      }
      // Store the position normalised within the room, which is how the twin
      // renders it, rather than against the whole plan.
      const xs = room.boundary.map((q) => q[0])
      const ys = room.boundary.map((q) => q[1])
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      setPlacingAsset({
        room,
        x: round5((p.x - minX) / (maxX - minX || 1)),
        y: round5((p.y - minY) / (maxY - minY || 1)),
      })
      setAssetForm({ category_id: categories.data?.[0]?.id || '' })
      return
    }
    if (e.target === svgRef.current) setSelectedRoom(null)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Floor Plan Editor</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Upload a plan, outline the rooms, and place the equipment inside them.
          </p>
        </div>
        <Select value={buildingId}
                onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setSelectedRoom(null) }}
                className="w-auto min-w-[190px]">
          <option value="">Select building</option>
          {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </header>

      {/* Floors as a switcher rather than a dropdown. A plan is drawn one floor
          at a time and the work moves between them constantly, so which floors
          exist — and which are still missing a diagram — belongs on screen
          rather than behind a closed menu. */}
      {buildingId && (
        <Widget bodyClass="p-widget">
          <div className="flex flex-wrap items-center gap-2">
            <Layers size={16} className="text-ink-faint" />
            {floors.isLoading && <span className="text-body-md text-ink-faint">Loading floors…</span>}
            {(floors.data || []).map((f) => (
              <button key={f.id}
                      onClick={() => { setFloorId(f.id); setSelectedRoom(null); setDraft([]); setMode('select') }}
                      className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-body-md font-medium transition-colors ${
                        floorId === f.id
                          ? 'bg-brand text-white'
                          : 'bg-surface-sunken text-ink-muted hover:text-ink'
                      }`}>
                {f.name}
                <span
                  title={f.floor_plan_url ? 'Plan uploaded' : 'No plan uploaded yet'}
                  className={`w-1.5 h-1.5 rounded-full ${
                    f.floor_plan_url ? 'bg-success' : 'bg-warning'
                  }`}
                />
              </button>
            ))}
            {floors.data?.length === 0 && (
              <span className="text-body-md text-ink-faint">This building has no floors yet.</span>
            )}
            <Button variant="secondary" size="sm" icon={Plus} className="ml-auto"
                    onClick={() => setFloorForm({
                      level: (Math.max(0, ...(floors.data || []).map((f) => f.level)) || 0) + 1,
                    })}>
              Add floor
            </Button>
          </div>
        </Widget>
      )}

      {!floorId ? (
        <Widget>
          <EmptyState icon={Square}
                      title={buildingId ? 'Pick a floor' : 'Choose a building'}
                      description={buildingId
                        ? 'Choose a floor above, then upload its plan or start outlining rooms.'
                        : 'Pick a building to see its floors.'} />
        </Widget>
      ) : (
        <>
          {/* Toolbar */}
          <Widget bodyClass="p-widget">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex p-1 bg-surface-sunken rounded-lg">
                {Object.entries(MODES).map(([k, m]) => (
                  <button key={k}
                          disabled={m.needsPlan && !planImage}
                          title={m.needsPlan && !planImage
                            ? 'Upload a plan image for this floor first' : undefined}
                          onClick={() => { setMode(k); setDraft([]); setPlacingAsset(null) }}
                          className={`flex items-center gap-1.5 h-9 px-3 rounded text-body-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            mode === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                          }`}>
                    <m.icon size={15} /> {m.label}
                  </button>
                ))}
              </div>

              {mode === 'trace' && (
                <span className="text-body-md text-ink-muted">
                  {tracing
                    ? 'Reading the plan…'
                    : 'Click inside a room on the plan — its walls become the outline'}
                </span>
              )}

              {mode === 'draw' && (
                <div className="flex items-center gap-2">
                  <span className="text-body-md text-ink-muted">
                    {draft.length === 0
                      ? 'Click to place the first corner'
                      : `${draft.length} corner${draft.length === 1 ? '' : 's'} — at least 3 needed`}
                  </span>
                  {draft.length > 0 && (
                    <Button variant="ghost" size="sm" icon={Undo2}
                            onClick={() => setDraft((d) => d.slice(0, -1))}>Undo</Button>
                  )}
                  {draft.length >= 3 && (
                    <Button size="sm" icon={Check}
                            onClick={() => setRoomForm({ boundary: draft, kind: 'classroom' })}>
                      Finish room
                    </Button>
                  )}
                  {draft.length > 0 && (
                    <Button variant="ghost" size="sm" icon={X} onClick={() => setDraft([])}>Cancel</Button>
                  )}
                </div>
              )}

              {mode === 'place' && (
                <span className="text-body-md text-ink-muted">
                  Click inside a room to place a new asset there
                </span>
              )}

              <label className="btn-secondary btn-sm ml-auto cursor-pointer">
                <ImageIcon size={15} />
                {planImage ? 'Replace plan image' : 'Upload plan image'}
                <input type="file" accept="image/*" className="hidden"
                       onChange={(e) => { if (e.target.files[0]) uploadPlan.mutate(e.target.files[0]); e.target.value = '' }} />
              </label>
            </div>
          </Widget>

          <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
            {/* Canvas */}
            <Widget bodyClass="p-0" className="overflow-hidden">
              {plan.isLoading ? <Spinner label="Loading plan…" />
                : plan.error ? <ErrorState error={plan.error} onRetry={plan.refetch} />
                : (
                  <div className="relative bg-surface-sunken">
                    <svg
                      ref={svgRef} viewBox={`0 0 ${VB} ${vbH}`}
                      style={{ aspectRatio: `${VB} / ${vbH}`, maxHeight: '620px' }}
                      className={`w-full mx-auto ${
                        tracing ? 'cursor-wait' : mode === 'select' ? '' : 'cursor-crosshair'
                      }`}
                      onClick={onCanvasClick}
                      role="img" aria-label="Floor plan editor canvas"
                    >
                      <defs>
                        <pattern id="editgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                          <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border-subtle" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width={VB} height={vbH} fill="url(#editgrid)" />

                      {/* The plan fills the canvas exactly — the viewBox above
                          carries its aspect ratio — so a room's normalised
                          outline lands on the walls it was traced from. */}
                      {planImage && (
                        <image href={mediaUrl(planImage)} x="0" y="0" width={VB} height={vbH}
                               preserveAspectRatio="none"
                               opacity={mode === 'trace' ? 0.85 : 0.55} />
                      )}

                      {rooms.map((room) => {
                        const pts = (room.boundary || []).map(([x, y]) => `${x * VB},${y * vbH}`).join(' ')
                        if (!pts) return null
                        const selected = selectedRoom?.id === room.id
                        const anchor = {
                          x: Math.min(...room.boundary.map((p) => p[0])) * VB + 12,
                          y: Math.min(...room.boundary.map((p) => p[1])) * vbH + 24,
                        }
                        return (
                          <g key={room.id}
                             onClick={(e) => { if (mode === 'select') { e.stopPropagation(); setSelectedRoom(room) } }}
                             className={mode === 'select' ? 'cursor-pointer' : ''}>
                            <polygon points={pts}
                                     fill={room.aggregate_colour} fillOpacity={selected ? 0.3 : 0.12}
                                     stroke={selected ? '#3b82f6' : room.aggregate_colour}
                                     strokeWidth={selected ? 3 : 1.8} />
                            <text x={anchor.x} y={anchor.y} fontSize="18"
                                  className="fill-ink font-mono pointer-events-none">{room.code}</text>
                            <text x={anchor.x} y={anchor.y + 18} fontSize="14"
                                  className="fill-ink-faint pointer-events-none">{room.name}</text>
                          </g>
                        )
                      })}

                      {/* Assets */}
                      {rooms.flatMap((room) => (room.assets || []).map((a) => {
                        if (a.pos_x == null || !room.boundary?.length) return null
                        const xs = room.boundary.map((p) => p[0])
                        const ys = room.boundary.map((p) => p[1])
                        const x = (Math.min(...xs) + a.pos_x * (Math.max(...xs) - Math.min(...xs))) * VB
                        const y = (Math.min(...ys) + a.pos_y * (Math.max(...ys) - Math.min(...ys))) * vbH
                        return (
                          <g key={a.id} transform={`translate(${x},${y})`}>
                            <circle r="11" fill={a.colour} className="stroke-surface" strokeWidth="2" />
                            <text y="26" textAnchor="middle" fontSize="12"
                                  className="fill-ink-muted font-mono pointer-events-none">{a.tag}</text>
                          </g>
                        )
                      }))}

                      {/* Polygon in progress */}
                      {draft.length > 0 && (
                        <>
                          <polyline
                            points={draft.map(([x, y]) => `${x * VB},${y * vbH}`).join(' ')}
                            fill={draft.length >= 3 ? '#3b82f6' : 'none'} fillOpacity="0.15"
                            stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 4" />
                          {draft.map(([x, y], i) => (
                            <circle key={i} cx={x * VB} cy={y * vbH} r="6"
                                    fill="#3b82f6" className="stroke-surface" strokeWidth="2" />
                          ))}
                        </>
                      )}
                    </svg>

                    {rooms.length === 0 && draft.length === 0 && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <div className="text-center px-6">
                          <p className="text-headline-md text-ink-faint">
                            {planImage ? 'No rooms on this floor yet' : 'No plan for this floor yet'}
                          </p>
                          <p className="text-body-md text-ink-faint mt-1 max-w-sm mx-auto">
                            {planImage
                              ? 'Switch to “Trace room” and click inside a room on the plan.'
                              : 'Upload this floor’s diagram above — then a click inside any room '
                                + 'on it becomes that room’s outline.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </Widget>

            {/* Inspector */}
            <div className="space-y-4">
              <Widget title="Rooms" subtitle={`${rooms.length} on this floor`} bodyClass="p-0">
                {rooms.length === 0 ? (
                  <p className="text-body-sm text-ink-faint px-widget py-6 text-center">None yet</p>
                ) : (
                  <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto">
                    {rooms.map((r) => (
                      <button key={r.id} onClick={() => setSelectedRoom(r)}
                              className={`w-full text-left px-widget py-2.5 hover:bg-surface-sunken transition-colors ${
                                selectedRoom?.id === r.id ? 'bg-info-bg' : ''
                              }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-mono-data text-secondary">{r.code}</span>
                          <span className="w-2 h-2 rounded-full" style={{ background: r.aggregate_colour }} />
                        </div>
                        <p className="text-body-md text-ink truncate">{r.name}</p>
                        <p className="text-body-sm text-ink-faint">
                          {titleCase(r.kind)} · {r.assets?.length || 0} assets
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </Widget>

              {selectedRoom && (
                <Widget title={selectedRoom.code} subtitle={selectedRoom.name}>
                  <dl className="space-y-2.5 text-body-md">
                    <Row label="Type" value={titleCase(selectedRoom.kind)} />
                    <Row label="Capacity" value={selectedRoom.capacity} />
                    <Row label="Area" value={selectedRoom.area_sqft && `${selectedRoom.area_sqft} sq ft`} />
                    <Row label="Assets" value={selectedRoom.assets?.length || 0} />
                    <Row label="Outline" value={`${selectedRoom.boundary?.length || 0} points`} />
                  </dl>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="secondary" icon={Pencil} className="flex-1"
                            onClick={() => setRoomForm({ ...selectedRoom, editingId: selectedRoom.id })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-danger-text"
                            loading={deleteRoom.pendingId === selectedRoom.id}
                            onClick={() => deleteRoom.remove(
                              selectedRoom.id, `${selectedRoom.code} — ${selectedRoom.name}`)}>
                      Delete
                    </Button>
                  </div>
                </Widget>
              )}
            </div>
          </div>
        </>
      )}

      {/* Room details modal — used for both create and edit */}
      <Modal
        open={!!roomForm} onClose={() => setRoomForm(null)}
        title={roomForm?.editingId ? `Edit ${roomForm.code}` : 'New room'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoomForm(null)}>Cancel</Button>
            <Button icon={Save} loading={createRoom.isPending || updateRoom.isPending}
                    disabled={!roomForm?.name || !roomForm?.code}
                    onClick={() => {
                      const body = {
                        name: roomForm.name, code: roomForm.code, kind: roomForm.kind,
                        capacity: roomForm.capacity ? Number(roomForm.capacity) : null,
                        area_sqft: roomForm.area_sqft ? Number(roomForm.area_sqft) : null,
                        boundary: roomForm.boundary,
                      }
                      if (roomForm.editingId) updateRoom.mutate({ id: roomForm.editingId, body })
                      else createRoom.mutate(body)
                    }}>
              {roomForm?.editingId ? 'Save' : 'Create room'}
            </Button>
          </>
        }
      >
        {roomForm && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Room name" required>
                <Input value={roomForm.name || ''} placeholder="Seminar Hall"
                       onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Room code" required hint="Unique on this floor">
                <Input value={roomForm.code || ''} placeholder="A-301"
                       onChange={(e) => setRoomForm((f) => ({ ...f, code: e.target.value }))} />
              </Field>
              <Field label="Type">
                <Select value={roomForm.kind || 'classroom'}
                        onChange={(e) => setRoomForm((f) => ({ ...f, kind: e.target.value }))}>
                  {ROOM_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
                </Select>
              </Field>
              <Field label="Capacity">
                <Input type="number" min="0" value={roomForm.capacity ?? ''}
                       onChange={(e) => setRoomForm((f) => ({ ...f, capacity: e.target.value }))} />
              </Field>
              <Field label="Area (sq ft)" className="sm:col-span-2">
                <Input type="number" min="0" value={roomForm.area_sqft ?? ''}
                       onChange={(e) => setRoomForm((f) => ({ ...f, area_sqft: e.target.value }))} />
              </Field>
            </div>
            <p className="text-body-sm text-ink-faint">
              Outline: {roomForm.boundary?.length || 0} points
              {roomForm.traced && ' — traced from the plan'}
              {roomForm.editingId && ' (unchanged — redraw the room to alter its shape)'}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!floorForm} onClose={() => setFloorForm(null)} title="Add a floor" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFloorForm(null)}>Cancel</Button>
            <Button icon={Save} loading={addFloor.isPending}
                    disabled={!floorForm?.name}
                    onClick={() => addFloor.mutate({
                      name: floorForm.name, level: Number(floorForm.level),
                    })}>
              Add floor
            </Button>
          </>
        }
      >
        {floorForm && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-[1fr_110px] gap-4">
              <Field label="Floor name" required>
                <Input value={floorForm.name || ''} placeholder="Second Floor"
                       onChange={(e) => setFloorForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Level" hint="0 is ground">
                <Input type="number" value={floorForm.level ?? ''}
                       onChange={(e) => setFloorForm((f) => ({ ...f, level: e.target.value }))} />
              </Field>
            </div>
            <p className="text-body-sm text-ink-faint">
              Upload this floor’s own diagram once it exists — each floor is traced
              from its own plan.
            </p>
          </div>
        )}
      </Modal>

      {/* The registry's own dialog, rather than a thinner copy: an asset placed
          on the plan is the same asset, and the copy here asked for five fields
          where the registry asks for the purchase, warranty and service detail
          that make the cost reporting work at all. */}
      <AssetModal
        open={!!assetForm}
        asset={null}
        roomId={placingAsset?.room?.id}
        categories={categories.data || []}
        onClose={() => { setAssetForm(null); setPlacingAsset(null); setMode('select') }}
        onSaved={async (created) => {
          // Pin it where the click landed, so it appears under the cursor
          // rather than at the room's default position.
          const first = Array.isArray(created) ? created[0] : created
          if (placingAsset && first?.id) {
            try {
              await api.patch(`/campus/assets/${first.id}/position`, {
                pos_x: placingAsset.x, pos_y: placingAsset.y,
              })
            } catch {
              // The asset exists either way; only its marker position is lost.
            }
          }
          setAssetForm(null); setPlacingAsset(null); setMode('select'); refresh()
        }}
      />
    </div>
  )
}

const round5 = (n) => Math.round(n * 1e5) / 1e5

/** Ray casting — is the point inside the room polygon? */
function roomAtPoint(rooms, p) {
  return rooms.find((room) => {
    const poly = room.boundary
    if (!poly?.length) return false
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    return inside
  })
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value ?? '—'}</dd>
    </div>
  )
}
