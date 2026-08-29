import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, Image as ImageIcon, MousePointer2, Pencil, Plus, Save, Square, Trash2, Undo2, X,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import {
  Button, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner, Widget, toast,
} from '@/components/ui'
import { api, readAuth } from '@/lib/api'
import { TWIN_STATE, titleCase } from '@/lib/format'

const VB = 1000
const ROOM_KINDS = [
  'classroom', 'lecture_hall', 'laboratory', 'office', 'library', 'washroom',
  'corridor', 'cafeteria', 'auditorium', 'hostel_room', 'server_room', 'store',
  'utility', 'other',
]

/** select · draw a room · place an asset */
const MODES = {
  select: { label: 'Select', icon: MousePointer2 },
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

  const deleteRoom = useMutation({
    mutationFn: (id) => api.del(`/campus/rooms/${id}`),
    onSuccess: (d) => { toast.success(d.detail); setSelectedRoom(null); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  const createAsset = useMutation({
    mutationFn: ({ roomId, body }) => api.post(`/campus/rooms/${roomId}/assets`, body),
    onSuccess: async (a) => {
      // Place it where the user clicked, then refresh once.
      if (placingAsset) {
        await api.patch(`/campus/assets/${a.id}/position`, {
          pos_x: placingAsset.x, pos_y: placingAsset.y,
        })
      }
      toast.success(`${a.tag} added.`)
      setAssetForm(null); setPlacingAsset(null); setMode('select'); refresh()
    },
    onError: (e) => toast.error(e.detail || 'Could not add the asset'),
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
      const token = readAuth()?.access_token
      const res = await fetch('/api/v1/uploads/image?purpose=floorplan', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      return api.patch(`/campus/floors/${floorId}/plan-image`, {
        floor_plan_url: data.url, plan_width: data.width, plan_height: data.height,
      })
    },
    onSuccess: () => { toast.success('Floor plan uploaded.'); refresh() },
    onError: (e) => toast.error(e.message || 'Could not upload the plan'),
  })

  /** Convert a click into normalised 0..1 plan coordinates. */
  const pointFromEvent = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }, [])

  const onCanvasClick = (e) => {
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

  const rooms = plan.data?.rooms || []
  const planImage = plan.data?.floor?.floor_plan_url

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Floor Plan Editor</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Upload a plan, outline the rooms, and place the equipment inside them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={buildingId}
                  onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setSelectedRoom(null) }}
                  className="w-auto min-w-[190px]">
            <option value="">Select building</option>
            {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select value={floorId} disabled={!buildingId}
                  onChange={(e) => { setFloorId(e.target.value); setSelectedRoom(null); setDraft([]) }}
                  className="w-auto min-w-[140px]">
            <option value="">Select floor</option>
            {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
      </header>

      {!floorId ? (
        <Widget>
          <EmptyState icon={Square} title="Choose a building and floor"
                      description="Pick where you want to work, then upload a plan or start outlining rooms." />
        </Widget>
      ) : (
        <>
          {/* Toolbar */}
          <Widget bodyClass="p-widget">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex p-1 bg-surface-sunken rounded-lg">
                {Object.entries(MODES).map(([k, m]) => (
                  <button key={k}
                          onClick={() => { setMode(k); setDraft([]); setPlacingAsset(null) }}
                          className={`flex items-center gap-1.5 h-9 px-3 rounded text-body-md font-medium transition-colors ${
                            mode === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                          }`}>
                    <m.icon size={15} /> {m.label}
                  </button>
                ))}
              </div>

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
                      ref={svgRef} viewBox={`0 0 ${VB} ${VB}`}
                      className={`w-full h-[560px] ${mode === 'select' ? '' : 'cursor-crosshair'}`}
                      onClick={onCanvasClick}
                      role="img" aria-label="Floor plan editor canvas"
                    >
                      <defs>
                        <pattern id="editgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width={VB} height={VB} fill="url(#editgrid)" />

                      {/* Uploaded plan sits under everything as a tracing guide */}
                      {planImage && (
                        <image href={planImage} x="0" y="0" width={VB} height={VB}
                               preserveAspectRatio="xMidYMid meet" opacity="0.55" />
                      )}

                      {rooms.map((room) => {
                        const pts = (room.boundary || []).map(([x, y]) => `${x * VB},${y * VB}`).join(' ')
                        if (!pts) return null
                        const selected = selectedRoom?.id === room.id
                        const anchor = {
                          x: Math.min(...room.boundary.map((p) => p[0])) * VB + 12,
                          y: Math.min(...room.boundary.map((p) => p[1])) * VB + 24,
                        }
                        return (
                          <g key={room.id}
                             onClick={(e) => { if (mode === 'select') { e.stopPropagation(); setSelectedRoom(room) } }}
                             className={mode === 'select' ? 'cursor-pointer' : ''}>
                            <polygon points={pts}
                                     fill={room.aggregate_colour} fillOpacity={selected ? 0.3 : 0.12}
                                     stroke={selected ? '#3b82f6' : room.aggregate_colour}
                                     strokeWidth={selected ? 3 : 1.8} />
                            <text x={anchor.x} y={anchor.y} fontSize="18" fill="#0b1c30"
                                  className="font-mono pointer-events-none">{room.code}</text>
                            <text x={anchor.x} y={anchor.y + 18} fontSize="14" fill="#64748b"
                                  className="pointer-events-none">{room.name}</text>
                          </g>
                        )
                      })}

                      {/* Assets */}
                      {rooms.flatMap((room) => (room.assets || []).map((a) => {
                        if (a.pos_x == null || !room.boundary?.length) return null
                        const xs = room.boundary.map((p) => p[0])
                        const ys = room.boundary.map((p) => p[1])
                        const x = (Math.min(...xs) + a.pos_x * (Math.max(...xs) - Math.min(...xs))) * VB
                        const y = (Math.min(...ys) + a.pos_y * (Math.max(...ys) - Math.min(...ys))) * VB
                        return (
                          <g key={a.id} transform={`translate(${x},${y})`}>
                            <circle r="11" fill={a.colour} stroke="white" strokeWidth="2" />
                            <text y="26" textAnchor="middle" fontSize="12" fill="#475569"
                                  className="font-mono pointer-events-none">{a.tag}</text>
                          </g>
                        )
                      }))}

                      {/* Polygon in progress */}
                      {draft.length > 0 && (
                        <>
                          <polyline
                            points={draft.map(([x, y]) => `${x * VB},${y * VB}`).join(' ')}
                            fill={draft.length >= 3 ? '#3b82f6' : 'none'} fillOpacity="0.15"
                            stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 4" />
                          {draft.map(([x, y], i) => (
                            <circle key={i} cx={x * VB} cy={y * VB} r="6"
                                    fill="#3b82f6" stroke="white" strokeWidth="2" />
                          ))}
                        </>
                      )}
                    </svg>

                    {rooms.length === 0 && draft.length === 0 && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <div className="text-center">
                          <p className="text-headline-md text-ink-faint">No rooms on this floor yet</p>
                          <p className="text-body-md text-ink-faint mt-1">
                            Switch to “Draw room” and click out the corners.
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
                            loading={deleteRoom.isPending}
                            onClick={() => deleteRoom.mutate(selectedRoom.id)}>
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
              {roomForm.editingId && ' (unchanged — redraw the room to alter its shape)'}
            </p>
          </div>
        )}
      </Modal>

      {/* New asset modal */}
      <Modal
        open={!!assetForm} onClose={() => { setAssetForm(null); setPlacingAsset(null) }}
        title={placingAsset ? `Add an asset to ${placingAsset.room.code}` : 'Add asset'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssetForm(null); setPlacingAsset(null) }}>
              Cancel
            </Button>
            <Button loading={createAsset.isPending}
                    disabled={!assetForm?.tag || !assetForm?.name || !assetForm?.category_id}
                    onClick={() => createAsset.mutate({
                      roomId: placingAsset.room.id,
                      body: {
                        category_id: assetForm.category_id,
                        tag: assetForm.tag, name: assetForm.name,
                        manufacturer: assetForm.manufacturer || null,
                        model: assetForm.model || null,
                      },
                    })}>
              Add asset
            </Button>
          </>
        }
      >
        {assetForm && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Asset tag" required hint="Unique across the campus">
                <Input value={assetForm.tag || ''} placeholder="PRJ-301-1"
                       onChange={(e) => setAssetForm((f) => ({ ...f, tag: e.target.value }))} />
              </Field>
              <Field label="Category" required>
                <Select value={assetForm.category_id || ''}
                        onChange={(e) => setAssetForm((f) => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Name" required className="sm:col-span-2">
                <Input value={assetForm.name || ''} placeholder="Projector — Seminar Hall"
                       onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Manufacturer">
                <Input value={assetForm.manufacturer || ''}
                       onChange={(e) => setAssetForm((f) => ({ ...f, manufacturer: e.target.value }))} />
              </Field>
              <Field label="Model">
                <Input value={assetForm.model || ''}
                       onChange={(e) => setAssetForm((f) => ({ ...f, model: e.target.value }))} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
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
