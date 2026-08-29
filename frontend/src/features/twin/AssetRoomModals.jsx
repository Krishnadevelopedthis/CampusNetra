import { useMutation, useQuery } from '@tanstack/react-query'
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
  purchase_date: '', warranty_expiry: '', cost: '', service_interval_days: '',
  expected_life_months: '', last_service_at: '', quantity: 1,
}

export function AssetModal({ open, asset, roomId, categories, onClose, onSaved }) {
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
      quantity: 1,
    } : { ...BLANK, category_id: categories[0]?.id || '' })
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
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
    onError: (e) => {
      if (e.fields) setErrors(e.fields)
      toast.error(e.detail || 'Could not save the asset.')
    },
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
