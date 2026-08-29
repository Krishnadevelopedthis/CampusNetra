import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle, Boxes, ChevronRight, CircleDollarSign, Copy, Layers,
  Pencil, Plus, Trash2, Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Button, EmptyState, ErrorState, Field, Input, Metric, Modal, Select,
  SkeletonRows, Widget, toast,
} from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { dt, money } from '@/lib/format'

const ROOM_KINDS = [
  'classroom', 'lab', 'office', 'washroom', 'corridor',
  'library', 'auditorium', 'canteen', 'hostel_room', 'other',
]

/**
 * Days until the next service falls due — negative when overdue, null when the
 * asset has no schedule at all.
 *
 * An asset that has never been serviced counts from its install date, not from
 * nothing. Treating "no service record" as infinitely overdue marks equipment
 * installed last week as neglected, which is how an overdue list stops being
 * read: if everything is red, nothing is.
 */
function serviceDue(asset) {
  if (!asset.service_interval_days) return null
  const baseline = asset.last_service_at || asset.purchase_date
  if (!baseline) return null
  const due = new Date(baseline)
  due.setDate(due.getDate() + asset.service_interval_days)
  return Math.round((due - new Date()) / 86400000)
}

function DueBadge({ asset }) {
  const days = serviceDue(asset)
  if (days === null) {
    return (
      <span className="text-body-sm text-ink-faint">
        {asset.service_interval_days ? 'No install date' : 'No schedule'}
      </span>
    )
  }
  const first = !asset.last_service_at
  if (days < 0) {
    return (
      <span className="pill bg-danger-bg text-danger-text">
        {Math.abs(days)}d overdue{first ? ' · first' : ''}
      </span>
    )
  }
  if (days <= 14) {
    return <span className="pill bg-warning-bg text-warning-text">Due in {days}d</span>
  }
  return <span className="text-body-sm text-ink-muted">In {days}d</span>
}

export default function AdminAssets() {
  const qc = useQueryClient()
  const [campusId, setCampusId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [editing, setEditing] = useState(null)   // asset | 'new' | null
  const [roomModal, setRoomModal] = useState(null)

  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: () => api.get('/campus/campuses'),
  })
  const activeCampus = campusId || campuses.data?.[0]?.id || ''

  const buildings = useQuery({
    queryKey: ['buildings', activeCampus],
    queryFn: () => api.get(`/campus/campuses/${activeCampus}/buildings`),
    enabled: !!activeCampus,
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
  const assets = useQuery({
    queryKey: ['room-assets', roomId],
    queryFn: () => api.get(`/campus/rooms/${roomId}/assets`),
    enabled: !!roomId,
  })
  const categories = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => api.get('/campus/asset-categories'),
  })

  const rooms = plan.data?.rooms || []
  const room = rooms.find((r) => r.id === roomId)

  const { refresh, refreshing } = useRefresh(
    buildings.refetch, floors.refetch, plan.refetch, assets.refetch,
  )

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['room-assets', roomId] })
    qc.invalidateQueries({ queryKey: ['floor-plan', floorId] })
    qc.invalidateQueries({ queryKey: ['assets'] })
  }

  const removeAsset = useMutation({
    mutationFn: (id) => api.del(`/campus/assets/${id}`),
    onSuccess: (r) => { toast.success(r.detail); invalidate() },
    onError: (e) => toast.error(e.detail),
  })

  const removeRoom = useMutation({
    mutationFn: (id) => api.del(`/campus/rooms/${id}`),
    onSuccess: (r) => {
      toast.success(r.detail)
      setRoomId('')
      qc.invalidateQueries({ queryKey: ['floor-plan', floorId] })
    },
    onError: (e) => toast.error(e.detail),
  })

  const totals = useMemo(() => {
    const list = assets.data || []
    return {
      count: list.length,
      value: list.reduce((s, a) => s + Number(a.cost || 0), 0),
      overdue: list.filter((a) => {
        const d = serviceDue(a)
        return d !== null && d < 0
      }).length,
    }
  }, [assets.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-headline-md text-ink">Asset Registry</h2>
          <p className="text-body-md text-ink-muted mt-0.5">
            Add, edit and retire the equipment on each floor, with its purchase,
            warranty and service schedule.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} loading={refreshing}>Refresh</Button>
      </div>

      {/* Location picker: campus → building → floor → room */}
      <Widget title="Where">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Campus">
            <Select
              value={activeCampus}
              onChange={(e) => {
                setCampusId(e.target.value)
                setBuildingId(''); setFloorId(''); setRoomId('')
              }}
            >
              {(campuses.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Building">
            <Select
              value={buildingId}
              onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setRoomId('') }}
            >
              <option value="">Select building</option>
              {(buildings.data || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Floor">
            <Select
              value={floorId}
              onChange={(e) => { setFloorId(e.target.value); setRoomId('') }}
              disabled={!buildingId}
            >
              <option value="">Select floor</option>
              {(floors.data || []).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Room / Lab">
            <Select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={!floorId}
            >
              <option value="">Select room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {floorId && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
            <span className="text-body-sm text-ink-faint mr-1">
              {rooms.length} room{rooms.length === 1 ? '' : 's'} on this floor
            </span>
            <Button size="sm" variant="secondary" icon={Plus}
                    onClick={() => setRoomModal({ floor_id: floorId })}>
              Add room
            </Button>
            {room && (
              <>
                <Button size="sm" variant="ghost" icon={Pencil}
                        onClick={() => setRoomModal(room)}>
                  Edit {room.code}
                </Button>
                <Button
                  size="sm" variant="ghost" icon={Trash2}
                  onClick={() => {
                    if (confirm(`Remove ${room.code} — ${room.name}?`)) removeRoom.mutate(room.id)
                  }}
                >
                  Delete room
                </Button>
              </>
            )}
          </div>
        )}
      </Widget>

      {!roomId ? (
        <Widget bodyClass="p-0">
          <EmptyState
            icon={Layers}
            title="Pick a room to manage its assets"
            description="Assets belong to a room, so choose a building, floor and room above."
          />
        </Widget>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Metric label="Assets in room" value={totals.count} icon={Boxes} />
            <Metric label="Purchase value" value={money(totals.value)} icon={CircleDollarSign} />
            <Metric
              label="Service overdue" value={totals.overdue} icon={AlertTriangle}
              accent={totals.overdue ? 'rgb(var(--c-danger))' : undefined}
            />
          </div>

          <Widget
            title={`Assets in ${room?.code || ''}`}
            subtitle={room?.name}
            bodyClass="p-0"
            action={
              <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
                Add assets
              </Button>
            }
          >
            {assets.isLoading || refreshing ? (
              <SkeletonRows rows={5} cols={6} />
            ) : assets.error ? (
              <ErrorState error={assets.error} onRetry={assets.refetch} />
            ) : (assets.data || []).length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="No assets recorded here"
                description="Register the equipment in this room so faults can be pinned to it."
                action={<Button icon={Plus} onClick={() => setEditing('new')}>Add assets</Button>}
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Asset</th>
                      <th>State</th>
                      <th>Purchased</th>
                      <th>Warranty</th>
                      <th>Cost</th>
                      <th>Next service</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(assets.data || []).map((a) => (
                      <tr key={a.id}>
                        <td className="font-mono text-body-sm">{a.tag}</td>
                        <td>
                          <p className="text-ink font-medium">{a.name}</p>
                          {a.manufacturer && (
                            <p className="text-body-sm text-ink-faint">
                              {a.manufacturer}{a.model ? ` · ${a.model}` : ''}
                            </p>
                          )}
                        </td>
                        <td><StatePill state={a.state} /></td>
                        <td className="text-body-sm">
                          {a.purchase_date ? dt(a.purchase_date, 'd MMM yyyy') : '—'}
                        </td>
                        <td className="text-body-sm">
                          {a.warranty_expiry ? <Warranty until={a.warranty_expiry} /> : '—'}
                        </td>
                        <td className="tabular">{a.cost ? money(a.cost) : '—'}</td>
                        <td><DueBadge asset={a} /></td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(a)}
                            className="btn-ghost btn-sm" aria-label={`Edit ${a.tag}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove asset ${a.tag}? Costs already booked against it stay in the ledger.`)) {
                                removeAsset.mutate(a.id)
                              }
                            }}
                            className="btn-ghost btn-sm text-danger-text" aria-label={`Delete ${a.tag}`}
                          >
                            <Trash2 size={14} />
                          </button>
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

      <AssetModal
        open={!!editing}
        asset={editing === 'new' ? null : editing}
        roomId={roomId}
        categories={categories.data || []}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); invalidate() }}
      />

      <RoomModal
        open={!!roomModal}
        room={roomModal?.id ? roomModal : null}
        floorId={floorId}
        onClose={() => setRoomModal(null)}
        onSaved={() => {
          setRoomModal(null)
          qc.invalidateQueries({ queryKey: ['floor-plan', floorId] })
        }}
      />
    </div>
  )
}

function StatePill({ state }) {
  const tone = {
    healthy: 'bg-success-bg text-success-text',
    warning: 'bg-warning-bg text-warning-text',
    fault: 'bg-danger-bg text-danger-text',
    under_maintenance: 'bg-info-bg text-info-text',
    inspection_required: 'bg-info-bg text-info-text',
    decommissioned: 'bg-neutral-bg text-neutral-text',
  }[state] || 'bg-neutral-bg text-neutral-text'
  return <span className={clsx('pill', tone)}>{String(state).replace(/_/g, ' ')}</span>
}

function Warranty({ until }) {
  const expired = new Date(until) < new Date()
  return (
    <span className={expired ? 'text-danger-text' : 'text-ink'}>
      {dt(until, 'd MMM yyyy')}{expired ? ' · expired' : ''}
    </span>
  )
}

/* ------------------------------------------------------------------ */

const BLANK = {
  tag: '', name: '', category_id: '', manufacturer: '', model: '', serial_no: '',
  purchase_date: '', warranty_expiry: '', cost: '', service_interval_days: '',
  expected_life_months: '', last_service_at: '', quantity: 1,
}

function AssetModal({ open, asset, roomId, categories, onClose, onSaved }) {
  const isEdit = !!asset
  const [form, setForm] = useState(BLANK)
  const [touched, setTouched] = useState(false)

  // Reset whenever the modal is opened for a different subject.
  const key = asset?.id || (open ? 'new' : 'closed')
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setTouched(false)
    setForm(asset ? {
      ...BLANK,
      ...asset,
      category_id: asset.category_id || '',
      cost: asset.cost ?? '',
      purchase_date: asset.purchase_date?.slice(0, 10) || '',
      warranty_expiry: asset.warranty_expiry?.slice(0, 10) || '',
      last_service_at: asset.last_service_at?.slice(0, 16) || '',
      service_interval_days: asset.service_interval_days ?? '',
      expected_life_months: asset.expected_life_months ?? '',
      quantity: 1,
    } : { ...BLANK, category_id: categories[0]?.id || '' })
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setTouched(true)
  }

  const save = useMutation({
    mutationFn: () => {
      // Empty strings would clear columns that were never edited; only send
      // what has a value, and let the server keep the rest.
      const payload = {
        category_id: form.category_id,
        name: form.name.trim(),
        tag: form.tag.trim(),
        manufacturer: form.manufacturer?.trim() || null,
        model: form.model?.trim() || null,
        serial_no: form.serial_no?.trim() || null,
        purchase_date: form.purchase_date ? `${form.purchase_date}T00:00:00Z` : null,
        warranty_expiry: form.warranty_expiry ? `${form.warranty_expiry}T00:00:00Z` : null,
        cost: form.cost === '' ? null : Number(form.cost),
        service_interval_days: form.service_interval_days === ''
          ? null : Number(form.service_interval_days),
        expected_life_months: form.expected_life_months === ''
          ? null : Number(form.expected_life_months),
      }
      if (isEdit) {
        return api.patch(`/campus/assets/${asset.id}`, {
          ...payload,
          last_service_at: form.last_service_at
            ? new Date(form.last_service_at).toISOString() : null,
        })
      }
      return api.post(`/campus/rooms/${roomId}/assets/bulk`, {
        ...payload,
        quantity: Math.max(1, Number(form.quantity) || 1),
      })
    },
    onSuccess: (res) => {
      toast.success(isEdit
        ? `${form.tag} updated.`
        : `${Array.isArray(res) ? res.length : 1} asset(s) registered.`)
      onSaved()
    },
    onError: (e) => toast.error(e.detail || 'Could not save the asset.'),
  })

  const quantity = Math.max(1, Number(form.quantity) || 1)
  const valid = form.tag.trim() && form.name.trim() && form.category_id

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${asset?.tag}` : 'Register assets'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!valid}
          >
            {isEdit ? 'Save changes' : `Register ${quantity > 1 ? `${quantity} assets` : 'asset'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Asset name" required>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Ceiling Fan" />
          </Field>
          <Field label="Category" required>
            <Select value={form.category_id} onChange={set('category_id')}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label={isEdit ? 'Asset tag' : 'Tag stem'}
            required
            hint={!isEdit && quantity > 1
              ? `Units will be tagged ${form.tag || 'TAG'}-01 … ${form.tag || 'TAG'}-${String(quantity).padStart(2, '0')}`
              : 'Unique across the campus.'}
          >
            <Input value={form.tag} onChange={set('tag')} placeholder="e.g. FAN-101"
                   className="font-mono" />
          </Field>

          {!isEdit && (
            <Field label="Quantity" hint="How many identical units are in this room.">
              <Input type="number" min={1} max={200} value={form.quantity}
                     onChange={set('quantity')} />
            </Field>
          )}

          {isEdit && (
            <Field label="Last serviced" hint="Drives the next-service countdown.">
              <Input type="datetime-local" value={form.last_service_at}
                     onChange={set('last_service_at')} />
            </Field>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Manufacturer">
            <Input value={form.manufacturer || ''} onChange={set('manufacturer')} />
          </Field>
          <Field label="Model">
            <Input value={form.model || ''} onChange={set('model')} />
          </Field>
          <Field label="Serial number" hint={!isEdit && quantity > 1 ? 'Shared — edit units individually after.' : undefined}>
            <Input value={form.serial_no || ''} onChange={set('serial_no')} className="font-mono" />
          </Field>
        </div>

        <hr className="border-border-subtle" />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Installed on">
            <Input type="date" value={form.purchase_date} onChange={set('purchase_date')} />
          </Field>
          <Field label="Warranty until">
            <Input type="date" value={form.warranty_expiry} onChange={set('warranty_expiry')} />
          </Field>
          <Field label="Unit cost" hint={quantity > 1 ? 'Per unit.' : undefined}>
            <Input type="number" min={0} step="0.01" value={form.cost} onChange={set('cost')} />
          </Field>
          <Field label="Expected life (months)">
            <Input type="number" min={1} value={form.expected_life_months}
                   onChange={set('expected_life_months')} />
          </Field>
        </div>

        <Field
          label="Service every (days)"
          hint="Leave blank for equipment with no routine schedule."
        >
          <Input type="number" min={1} value={form.service_interval_days}
                 onChange={set('service_interval_days')} className="sm:w-48" />
        </Field>

        {!isEdit && quantity > 1 && (
          <p className="text-body-md text-info-text bg-info-bg border border-info-border rounded-xl px-3.5 py-2.5 flex items-start gap-2">
            <Copy size={15} className="shrink-0 mt-0.5" />
            {quantity} identical units will be created, each with its own tag and
            its own maintenance history from here on.
          </p>
        )}

        {touched && !valid && (
          <p className="text-body-sm text-ink-faint">
            A name, tag and category are required.
          </p>
        )}
      </div>
    </Modal>
  )
}

function RoomModal({ open, room, floorId, onClose, onSaved }) {
  const isEdit = !!room
  const [form, setForm] = useState({ name: '', code: '', kind: 'classroom', capacity: '' })
  const key = room?.id || (open ? 'new' : 'closed')
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setForm(room
      ? { name: room.name, code: room.code, kind: room.kind, capacity: room.capacity ?? '' }
      : { name: '', code: '', kind: 'classroom', capacity: '' })
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        code: form.code.trim(),
        kind: form.kind,
        capacity: form.capacity === '' ? null : Number(form.capacity),
      }
      return isEdit
        ? api.patch(`/campus/rooms/${room.id}`, body)
        : api.post(`/campus/floors/${floorId}/rooms`, body)
    },
    onSuccess: () => { toast.success(isEdit ? 'Room updated.' : 'Room added.'); onSaved() },
    onError: (e) => toast.error(e.detail || 'Could not save the room.'),
  })

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${room?.code}` : 'Add a room'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}
                  disabled={!form.name.trim() || !form.code.trim()}>
            {isEdit ? 'Save changes' : 'Add room'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Room name" required>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Physics Lab" />
          </Field>
          <Field label="Room code" required hint="Shown on the floor plan.">
            <Input value={form.code} onChange={set('code')} placeholder="e.g. A-201"
                   className="font-mono" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Kind">
            <Select value={form.kind} onChange={set('kind')}>
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity">
            <Input type="number" min={0} value={form.capacity} onChange={set('capacity')} />
          </Field>
        </div>
        {!isEdit && (
          <p className="text-body-sm text-ink-faint flex items-start gap-1.5">
            <ChevronRight size={14} className="shrink-0 mt-0.5" />
            Draw its outline afterwards in Floor Plans so it appears on the twin.
          </p>
        )}
      </div>
    </Modal>
  )
}
