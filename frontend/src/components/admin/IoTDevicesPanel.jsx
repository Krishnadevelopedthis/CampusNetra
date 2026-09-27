import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Cable, Check, Copy, Plus, Radio } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button, confirmDialog, EmptyState, Field, Input, Modal, Select, SkeletonRows, toast, Widget } from '@/components/ui'
import { api } from '@/lib/api'
import { ago } from '@/lib/format'

/**
 * Admin IoT device registry + room assignment. Sits above the existing
 * Campus->Room health tree in AdminHealth.jsx as its own self-contained
 * panel -- the room-health display below it is untouched.
 *
 * ESP32-001 -> room mapping is the one manual step the whole telemetry
 * pipeline hinges on (see backend/app/services/iot_health.py): once set
 * here, every MQTT/HTTP telemetry message resolves to this room on its
 * own, automatically, for good.
 */

// Builds a flat room_id -> "Building / Floor / Room" label map from the
// same tree shape GET /health/tree already returns -- reused rather than
// adding a second endpoint just for a room picker.
function useRoomIndex() {
  const tree = useQuery({ queryKey: ['health-tree', '', '', '', ''], queryFn: () => api.get('/health/tree') })
  const { labelByRoomId, options } = useMemo(() => {
    const labelByRoomId = new Map()
    const options = []
    for (const c of tree.data?.campuses || []) {
      for (const b of c.buildings) {
        for (const f of b.floors) {
          for (const r of f.rooms) {
            const label = `${c.name} / ${b.name} / ${f.name} / ${r.code} · ${r.name}`
            labelByRoomId.set(r.id, label)
            options.push({ id: r.id, label })
          }
        }
      }
    }
    return { labelByRoomId, options }
  }, [tree.data])
  return { labelByRoomId, options, isLoading: tree.isLoading }
}

function DeviceRegisterModal({ open, onClose, onRegistered }) {
  const [deviceId, setDeviceId] = useState('')
  const [label, setLabel] = useState('')
  const [issuedKey, setIssuedKey] = useState(null)
  const [copied, setCopied] = useState(false)

  const register = useMutation({
    mutationFn: () => api.post('/iot/devices', { device_id: deviceId.trim(), label: label.trim() || null }),
    onSuccess: (device) => {
      setIssuedKey(device.api_key)
      onRegistered()
    },
    onError: (e) => toast.error(e.detail || 'Could not register device'),
  })

  function handleClose() {
    setDeviceId(''); setLabel(''); setIssuedKey(null); setCopied(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Register IoT device" size="sm">
      {!issuedKey ? (
        <div className="space-y-3">
          <Field label="Device ID" hint="Must match the ESP32's own device_id, e.g. ESP32-001" required>
            <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="ESP32-001" />
          </Field>
          <Field label="Label" hint="Optional, for your own reference">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Block A pilot unit" />
          </Field>
          <Button
            variant="primary" className="w-full" loading={register.isPending}
            disabled={!deviceId.trim()}
            onClick={() => register.mutate()}
          >
            Register
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-body-sm text-ink-muted">
            Device registered. This API key is shown <strong>once</strong> — flash it onto the
            device now; it cannot be retrieved again.
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
            <code className="flex-1 text-body-sm text-ink break-all">{issuedKey}</code>
            <button
              type="button"
              className="text-ink-faint hover:text-ink shrink-0"
              onClick={() => { navigator.clipboard.writeText(issuedKey); setCopied(true) }}
              aria-label="Copy API key"
            >
              {copied ? <Check size={16} className="text-success-text" /> : <Copy size={16} />}
            </button>
          </div>
          <Button variant="primary" className="w-full" onClick={handleClose}>Done</Button>
        </div>
      )}
    </Modal>
  )
}

function RoomAssignModal({ device, onClose }) {
  const qc = useQueryClient()
  const { options, isLoading } = useRoomIndex()
  const [roomId, setRoomId] = useState(device?.room_id || '')

  // The select's initial value is only read once, on this component's own
  // first mount -- reopening the same modal instance for a different (or
  // the same, externally-changed) device would otherwise show whatever
  // was left over from the last time it was open, not that device's
  // actual current assignment.
  useEffect(() => {
    setRoomId(device?.room_id || '')
  }, [device?.id, device?.room_id])

  // Only the true no-op (still unassigned, still nothing picked) blocks
  // Save -- re-picking the room it's ALREADY assigned to is a legitimate
  // action, not a no-op: assign_device_room drops and rebuilds every
  // Fan/Light sensor mapping for that room from what's actually there
  // right now, so it's the fix for "I added a Light asset after the room
  // was already assigned and it still shows No sensor" (only the original
  // assignment auto-provisions; a re-save re-scans).
  const isNoOpUnassign = !device?.room_id && !roomId
  const isResync = !!roomId && roomId === device?.room_id

  const assign = useMutation({
    mutationFn: () => api.patch(`/iot/devices/${device.id}/room`, { room_id: roomId || null }),
    onSuccess: () => {
      toast.success(isResync ? 'Sensors re-synced to this room\'s current assets.' : roomId ? 'Room assigned.' : 'Device unassigned.')
      qc.invalidateQueries({ queryKey: ['iot-devices'] })
      qc.invalidateQueries({ queryKey: ['health-tree'] })
      onClose()
    },
    onError: (e) => toast.error(e.detail || 'Could not update room assignment'),
  })

  return (
    <Modal open={!!device} onClose={onClose} title={`Assign ${device?.device_id || ''}`} size="sm">
      <div className="space-y-3">
        <Field
          label="Classroom / Room"
          hint={
            isNoOpUnassign ? 'This device isn\'t assigned to a room yet — pick one below.'
              : isResync ? 'Already assigned here. Saving again re-scans this room\'s Fan/Light assets and re-syncs their sensor mappings — use this if an asset added after assignment still shows "No sensor".'
              : 'Every future telemetry message from this device updates this room\'s Health status automatically.'
          }
        >
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={isLoading}>
            <option value="">Unassigned</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary" className="w-full" loading={assign.isPending}
          disabled={isNoOpUnassign}
          onClick={() => assign.mutate()}
        >
          {isResync ? 'Re-sync sensors' : 'Save assignment'}
        </Button>
      </div>
    </Modal>
  )
}

export function IoTDevicesPanel() {
  const qc = useQueryClient()
  const [registerOpen, setRegisterOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)

  const devices = useQuery({
    queryKey: ['iot-devices'], queryFn: () => api.get('/iot/devices'),
    refetchInterval: 10_000,
  })
  const { labelByRoomId } = useRoomIndex()

  const remove = useMutation({
    mutationFn: (id) => api.del(`/iot/devices/${id}`),
    onSuccess: () => { toast.success('Device removed.'); qc.invalidateQueries({ queryKey: ['iot-devices'] }) },
    onError: (e) => toast.error(e.detail || 'Could not remove device'),
  })

  return (
    <Widget
      title="IoT Devices"
      action={<Button size="sm" icon={Plus} onClick={() => setRegisterOpen(true)}>Register device</Button>}
    >
      {devices.isLoading && <SkeletonRows rows={2} />}
      {!devices.isLoading && !devices.data?.length && (
        <EmptyState
          icon={Radio}
          title="No IoT devices registered"
          description="Register an ESP32 here, then assign it to the classroom it's physically installed in."
        />
      )}
      {!!devices.data?.length && (
        <div className="divide-y divide-border-subtle -mx-1">
          {devices.data.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Cable size={14} className="text-ink-faint shrink-0" />
                  <span className="text-body-sm font-medium text-ink truncate">{d.device_id}</span>
                  {d.label && <span className="text-body-xs text-ink-faint truncate">· {d.label}</span>}
                  <span className={clsx('pill', d.is_online ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-neutral-text')}>
                    {d.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-body-xs text-ink-faint mt-0.5 truncate">
                  {d.room_id ? (labelByRoomId.get(d.room_id) || 'Assigned room') : 'Unassigned — needs a room'}
                  {d.last_seen_at ? ` · last seen ${ago(d.last_seen_at)}` : ' · never seen'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => setAssignTarget(d)}>
                  {d.room_id ? 'Change room' : 'Assign room'}
                </Button>
                <Button
                  size="sm" variant="danger"
                  onClick={async () => {
                    if (await confirmDialog(`Remove ${d.device_id}? This cannot be undone.`, { danger: true, confirmLabel: 'Remove' })) {
                      remove.mutate(d.id)
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeviceRegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onRegistered={() => qc.invalidateQueries({ queryKey: ['iot-devices'] })}
      />
      <RoomAssignModal device={assignTarget} onClose={() => setAssignTarget(null)} />
    </Widget>
  )
}
