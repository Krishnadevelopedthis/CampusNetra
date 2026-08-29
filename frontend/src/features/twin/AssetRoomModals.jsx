import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button, Field, Input, Modal, Select, toast } from '@/components/ui'
import { api } from '@/lib/api'

/**
 * Room and asset editors, shared by the admin registry and the Digital Twin.
 *
 * They live here rather than in either page because both need the identical
 * dialog: the twin is where someone notices a room is missing, and the admin
 * registry is where they go to manage the estate in bulk. Two copies would
 * drift, and the one that drifted would be the one nobody was testing.
 */


const BLANK = {
  tag: '', name: '', category_id: '', manufacturer: '', model: '', serial_no: '',
  purchase_date: '', warranty_expiry: '', warranty_months: '', cost: '',
  annual_maintenance_cost: '', service_interval_days: '',
  expected_life_months: '', last_service_at: '', quantity: 1,
}

// Warranties are sold in whole years far more often than they are quoted as an
// end date, so the period is what gets asked for and the date is derived.
const WARRANTY_PERIODS = [
  ['', 'No warranty'],
  ['12', '1 year'],
  ['24', '2 years'],
  ['36', '3 years'],
  ['60', '5 years'],
  ['120', '10 years'],
  ['custom', 'Other — pick a date'],
]

/** Purchase date + months, as YYYY-MM-DD. */
function addMonths(dateStr, months) {
  if (!dateStr || !months) return ''
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  d.setMonth(d.getMonth() + Number(months))
  // Rolling 31 Jan forward by one month must not land in March.
  if (d.getDate() < day) d.setDate(0)
  // Formatted from local parts, not toISOString(): the date was parsed as local
  // midnight, and converting that to UTC moves it to the previous day for
  // anywhere east of Greenwich — a three-year warranty would end a day early.
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function warrantyState(expiry) {
  if (!expiry) return null
  const days = Math.round((new Date(`${expiry}T00:00:00`) - new Date()) / 86400000)
  if (days < 0) return { ok: false, text: `Out of warranty — expired ${Math.abs(days)} days ago` }
  if (days <= 60) return { ok: true, warn: true, text: `In warranty — ${days} days left` }
  return { ok: true, text: `In warranty until ${expiry}` }
}

/**
 * Building → floor → room, for the callers that do not already have one.
 *
 * The twin and the floor plan editor open this dialog with a room in hand
 * because you picked it on the plan; the registry does the same from its own
 * selector. Everywhere else — an asset added from a list, or moved — has to be
 * able to say where it goes, and an asset without a room cannot be pinned to
 * the twin at all.
 */
function LocationPicker({ campusId, value, onChange }) {
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')

  const campuses = useQuery({
    queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses'),
  })
  const campus = campusId || campuses.data?.[0]?.id

  const buildings = useQuery({
    queryKey: ['buildings', campus],
    queryFn: () => api.get(`/campus/campuses/${campus}/buildings`),
    enabled: !!campus,
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

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <Field label="Building" required>
        <Select
          value={buildingId}
          onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); onChange('') }}
        >
          <option value="">Select</option>
          {(buildings.data || []).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Floor" required>
        <Select
          value={floorId} disabled={!buildingId}
          onChange={(e) => { setFloorId(e.target.value); onChange('') }}
        >
          <option value="">Select</option>
          {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </Field>

      <Field label="Room / Lab" required>
        <Select value={value} disabled={!floorId} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select</option>
          {(plan.data?.rooms || []).map((r) => (
            <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

export function AssetModal({ open, asset, roomId, campusId, categories, onClose, onSaved }) {
  // A caller that already knows the room passes it; otherwise it is chosen here.
  const [pickedRoom, setPickedRoom] = useState('')
  const targetRoom = roomId || pickedRoom
  const isEdit = !!asset
  const [form, setForm] = useState(BLANK)
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState({})

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
      annual_maintenance_cost: asset.annual_maintenance_cost ?? '',
      warranty_months: asset.warranty_months != null ? String(asset.warranty_months)
        : (asset.warranty_expiry ? 'custom' : ''),
      quantity: 1,
    } : { ...BLANK, category_id: categories[0]?.id || '' })
  }

  const set = (k) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [k]: value }
      // Moving the purchase date under a fixed period must move the end date
      // with it, or the two quietly stop agreeing.
      if (k === 'purchase_date' && f.warranty_months && f.warranty_months !== 'custom') {
        next.warranty_expiry = addMonths(value, f.warranty_months)
      }
      return next
    })
    setErrors((x) => ({ ...x, [k]: undefined }))
    setTouched(true)
  }

  const warranty = warrantyState(form.warranty_expiry)

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
        annual_maintenance_cost: form.annual_maintenance_cost === ''
          ? null : Number(form.annual_maintenance_cost),
        warranty_months: form.warranty_months && form.warranty_months !== 'custom'
          ? Number(form.warranty_months) : null,
      }
      if (isEdit) {
        return api.patch(`/campus/assets/${asset.id}`, {
          ...payload,
          last_service_at: form.last_service_at
            ? new Date(form.last_service_at).toISOString() : null,
        })
      }
      return api.post(`/campus/rooms/${targetRoom}/assets/bulk`, {
        ...payload,
        quantity: Math.max(1, Number(form.quantity) || 1),
      })
    },
    onSuccess: (res) => {
      toast.success(isEdit
        ? `${form.tag} updated.`
        : `${Array.isArray(res) ? res.length : 1} asset(s) registered.`)
      // Handed back so a caller that placed it on a plan can pin the marker.
      onSaved(res)
    },
    onError: (e) => {
      if (e.fields) setErrors(e.fields)
      toast.error(e.detail || 'Could not save the asset.')
    },
  })

  const quantity = Math.max(1, Number(form.quantity) || 1)
  const valid = form.tag.trim() && form.name.trim() && form.category_id
    && (isEdit || targetRoom)

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
        {!isEdit && !roomId && (
          <>
            <LocationPicker campusId={campusId} value={pickedRoom} onChange={setPickedRoom} />
            <hr className="border-border-subtle" />
          </>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Asset name" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} error={errors.name}
                   placeholder="e.g. Ceiling Fan" />
          </Field>
          <Field label="Category" required error={errors.category_id}>
            <Select value={form.category_id} onChange={set('category_id')}
                    error={errors.category_id}>
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
          <Field label="Purchased / installed" error={errors.purchase_date}>
            <Input type="date" value={form.purchase_date} onChange={set('purchase_date')}
                   error={errors.purchase_date} />
          </Field>
          <Field label="Purchase cost" hint={quantity > 1 ? 'Per unit.' : undefined}>
            <Input type="number" min={0} step="0.01" value={form.cost} onChange={set('cost')}
                   placeholder="0.00" />
          </Field>
          <Field
            label="Maintenance cost / year"
            hint="Optional — the AMC or service contract, if there is one."
          >
            <Input type="number" min={0} step="0.01" value={form.annual_maintenance_cost}
                   onChange={set('annual_maintenance_cost')} placeholder="0.00" />
          </Field>
          <Field label="Expected life (months)">
            <Input type="number" min={1} value={form.expected_life_months}
                   onChange={set('expected_life_months')} />
          </Field>
        </div>

        {/* Warranty is quoted as a length far more often than as an end date,
            so the length is what gets asked for and the date follows from it. */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Warranty period">
            <Select
              value={form.warranty_months}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => ({
                  ...f,
                  warranty_months: v,
                  warranty_expiry: v && v !== 'custom'
                    ? addMonths(f.purchase_date, v)
                    : (v === 'custom' ? f.warranty_expiry : ''),
                }))
                setTouched(true)
              }}
            >
              {WARRANTY_PERIODS.map(([v, label]) => (
                <option key={v || 'none'} value={v}>{label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Warranty ends"
            hint={form.warranty_months && form.warranty_months !== 'custom'
              ? 'Worked out from the purchase date.'
              : undefined}
          >
            <Input
              type="date"
              value={form.warranty_expiry}
              onChange={set('warranty_expiry')}
              disabled={!!form.warranty_months && form.warranty_months !== 'custom'}
            />
          </Field>
        </div>

        {warranty && (
          <p className={clsx(
            'text-body-md rounded-xl px-3.5 py-2.5 border',
            warranty.ok
              ? warranty.warn
                ? 'bg-warning-bg border-warning-border text-warning-text'
                : 'bg-success-bg border-success-border text-success-text'
              : 'bg-danger-bg border-danger-border text-danger-text',
          )}>
            {warranty.text}
          </p>
        )}

        {form.warranty_months && form.warranty_months !== 'custom' && !form.purchase_date && (
          <p className="text-body-sm text-ink-faint">
            Set the purchase date and the warranty end date fills itself in.
          </p>
        )}

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
            {!isEdit && !targetRoom
              ? 'Choose where this goes — building, floor and room.'
              : 'A name, tag and category are required.'}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function RoomModal({ open, room, floorId, onClose, onSaved }) {
  // Served rather than hardcoded: a local copy of this list had 'lab' and
  // 'canteen', neither of which the enum accepts, so every save of those two
  // failed validation with nothing on screen to say why.
  const kinds = useQuery({
    queryKey: ['room-kinds'],
    queryFn: () => api.get('/campus/room-kinds'),
    staleTime: Infinity,
  })

  const isEdit = !!room
  const [form, setForm] = useState({ name: '', code: '', kind: 'classroom', capacity: '' })
  const [errors, setErrors] = useState({})
  const key = room?.id || (open ? 'new' : 'closed')
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setForm(room
      ? { name: room.name, code: room.code, kind: room.kind, capacity: room.capacity ?? '' }
      : { name: '', code: '', kind: 'classroom', capacity: '' })
    setErrors({})
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

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
    onError: (e) => {
      // A 422 names the offending field. Showing only the summary toast leaves
      // the user staring at a form with no indication of what to change.
      if (e.fields) setErrors(e.fields)
      toast.error(e.detail || 'Could not save the room.')
    },
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
          <Field label="Room name" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} error={errors.name}
                   placeholder="e.g. Physics Lab" />
          </Field>
          <Field label="Room code" required hint="Shown on the floor plan." error={errors.code}>
            <Input value={form.code} onChange={set('code')} error={errors.code}
                   placeholder="e.g. A-201" className="font-mono" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Kind" error={errors.kind}>
            <Select value={form.kind} onChange={set('kind')} error={errors.kind}>
              {(kinds.data || [{ value: 'classroom', label: 'Classroom' }]).map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity" error={errors.capacity}>
            <Input type="number" min={0} value={form.capacity} onChange={set('capacity')}
                   error={errors.capacity} />
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
