import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Cpu, Gauge, HeartPulse } from 'lucide-react'
import { useState } from 'react'

import { EmptyState, ErrorState, Field, Modal, Select, SkeletonRows, Widget } from '@/components/ui'
import { api } from '@/lib/api'
import { dt, TWIN_STATE } from '@/lib/format'

/**
 * Admin-only Health page: Campus -> Building -> Floor -> Room -> electronic
 * asset, rolled up from the same Asset.state the Digital Twin already uses
 * (see backend/app/api/v1/health.py). The four selects narrow the tree;
 * left on their defaults, the whole organisation scrolls in one view with
 * a heading break between each building and each floor, exactly as asked.
 */

const NO_SENSORS = { colour: '#94a3b8', label: 'No sensors' }

function StateDot({ status }) {
  const s = TWIN_STATE[status] || NO_SENSORS
  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm" style={{ color: s.colour }}>
      <span className="h-2 w-2 rounded-full" style={{ background: s.colour }} />
      {s.label}
    </span>
  )
}

function AssetRow({ asset, onSelect }) {
  const s = TWIN_STATE[asset.state] || NO_SENSORS
  return (
    <button
      type="button"
      onClick={() => onSelect(asset.id)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-hover"
    >
      <span className="flex items-center gap-2 min-w-0">
        <Cpu size={14} className="text-ink-faint shrink-0" />
        <span className="truncate text-body-sm text-ink">{asset.name}</span>
        <span className="text-body-xs text-ink-faint shrink-0">{asset.tag}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {!asset.has_sensor && <span className="pill bg-neutral-bg text-neutral-text">No sensor</span>}
        {asset.has_sensor && (
          <span className="pill" style={{ background: `${s.colour}1a`, color: s.colour }}>
            {s.label}
          </span>
        )}
      </span>
    </button>
  )
}

function RoomCard({ room, onSelectAsset }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-ink truncate">{room.code} · {room.name}</p>
        </div>
        <StateDot status={room.status} />
      </div>
      {!room.has_electronic_assets ? (
        <p className="text-body-xs text-ink-faint">No electronic assets in this room.</p>
      ) : room.status === 'no_sensors' ? (
        <p className="text-body-xs text-ink-faint">No sensors installed on this room's assets yet.</p>
      ) : (
        <div className="divide-y divide-border-subtle -mx-1">
          {room.assets.map((a) => (
            <AssetRow key={a.id} asset={a} onSelect={onSelectAsset} />
          ))}
        </div>
      )}
    </div>
  )
}

function FloorSection({ floor, onSelectAsset }) {
  if (!floor.rooms.length) return null
  return (
    <div className="space-y-2">
      <p className="text-label-sm uppercase tracking-wide text-ink-faint border-t border-border-subtle pt-3">
        Floor {floor.level} · {floor.name}
      </p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {floor.rooms.map((r) => (
          <RoomCard key={r.id} room={r} onSelectAsset={onSelectAsset} />
        ))}
      </div>
    </div>
  )
}

function BuildingSection({ building, onSelectAsset }) {
  const floorsWithRooms = building.floors.filter((f) => f.rooms.length)
  if (!floorsWithRooms.length) return null
  return (
    <div className="space-y-3">
      <h3 className="text-headline-sm text-ink pt-2">{building.name}</h3>
      {floorsWithRooms.map((f) => (
        <FloorSection key={f.id} floor={f} onSelectAsset={onSelectAsset} />
      ))}
    </div>
  )
}

function AssetDetailModal({ assetId, onClose }) {
  const detail = useQuery({
    queryKey: ['health-asset', assetId],
    queryFn: () => api.get(`/health/assets/${assetId}`),
    enabled: !!assetId,
  })

  const a = detail.data?.asset

  return (
    <Modal open={!!assetId} onClose={onClose} title={a?.name || 'Asset health'} size="lg">
      {detail.isLoading && <SkeletonRows rows={4} />}
      {detail.isError && <ErrorState error={detail.error} onRetry={detail.refetch} />}
      {a && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <StateDot status={a.state} />
            <span className="text-body-sm text-ink-muted">{a.tag} · {a.category || 'Uncategorised'}</span>
          </div>

          <div>
            <p className="text-label-sm text-ink-faint mb-1.5">Sensors</p>
            {!detail.data.sensors.length ? (
              <p className="text-body-sm text-ink-faint">No sensors mapped to this asset.</p>
            ) : (
              <div className="space-y-1.5">
                {detail.data.sensors.map((s) => (
                  <div key={s.id} className="rounded-md border border-border-subtle px-3 py-2 text-body-sm flex items-center justify-between">
                    <span className="uppercase text-ink">{s.sensor_type}</span>
                    <span className="text-ink-muted">
                      {s.last_value != null ? `${s.last_value}A` : 'No reading yet'}
                      {s.last_reading_at ? ` · ${dt(s.last_reading_at)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!!detail.data.devices.length && (
            <div>
              <p className="text-label-sm text-ink-faint mb-1.5">Room device</p>
              {detail.data.devices.map((d) => (
                <div key={d.id} className="rounded-md border border-border-subtle px-3 py-2 text-body-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink">{d.device_id}</span>
                    <span className={clsx('pill', d.is_online ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-neutral-text')}>
                      {d.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {d.last_environment && (
                    <p className="text-body-xs text-ink-faint mt-1">
                      {d.last_environment.temperature_c != null && `Temp: ${d.last_environment.temperature_c}°C `}
                      {d.last_environment.humidity_pct != null && `· Humidity: ${d.last_environment.humidity_pct}% `}
                      {d.last_environment.ldr_value != null && `· Light: ${d.last_environment.ldr_value}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-label-sm text-ink-faint mb-1.5">Health event history</p>
            {!detail.data.events.length ? (
              <p className="text-body-sm text-ink-faint">No anomalies recorded for this asset.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {detail.data.events.map((e) => (
                  <div key={e.id} className="rounded-md border border-border-subtle px-3 py-2 text-body-sm space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-ink">{e.reference} · {e.kind.replaceAll('_', ' ')}</span>
                      <span className="pill bg-neutral-bg text-neutral-text">{e.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="text-body-xs text-ink-faint">{dt(e.detected_at)}</p>
                    {e.inspection_reference && (
                      <p className="text-body-xs text-ink-faint">
                        Inspection {e.inspection_reference} · {e.inspection_status}
                      </p>
                    )}
                    {e.work_order_reference && (
                      <p className="text-body-xs text-ink-faint">
                        Work order {e.work_order_reference} · {e.work_order_status}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AdminHealth() {
  const [campusId, setCampusId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [selectedAsset, setSelectedAsset] = useState(null)

  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: () => api.get('/campus/campuses'),
  })
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
  const rooms = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`),
    enabled: !!floorId,
  })

  const tree = useQuery({
    queryKey: ['health-tree', campusId, buildingId, floorId, roomId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (campusId) params.set('campus_id', campusId)
      if (buildingId) params.set('building_id', buildingId)
      if (floorId) params.set('floor_id', floorId)
      if (roomId) params.set('room_id', roomId)
      const qs = params.toString()
      return api.get(`/health/tree${qs ? `?${qs}` : ''}`)
    },
  })

  const campusesOut = tree.data?.campuses || []
  const anyRooms = campusesOut.some((c) => c.buildings.some((b) => b.floors.some((f) => f.rooms.length)))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-headline-md text-ink flex items-center gap-2">
          <HeartPulse size={22} className="text-danger-text" /> Health
        </h2>
        <p className="text-body-md text-ink-muted mt-0.5">
          Live equipment health across every campus, rolled up from sensor readings, room by room.
          Narrow with the selectors below, or leave them on "All" to scroll the whole organisation.
        </p>
      </div>

      <Widget title="Where">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Campus">
            <Select
              value={campusId}
              onChange={(e) => { setCampusId(e.target.value); setBuildingId(''); setFloorId(''); setRoomId('') }}
            >
              <option value="">All campuses</option>
              {(campuses.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Building">
            <Select
              value={buildingId}
              onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setRoomId('') }}
              disabled={!campusId}
            >
              <option value="">All buildings</option>
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
              <option value="">All floors</option>
              {(floors.data || []).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Room / Lab / Office">
            <Select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={!floorId}
            >
              <option value="">All rooms</option>
              {(rooms.data?.rooms || []).map((r) => (
                <option key={r.id} value={r.id}>{r.code} · {r.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Widget>

      <Widget title="Campus health" bodyClass="max-h-[70vh] overflow-y-auto">
        {tree.isLoading && <SkeletonRows rows={6} />}
        {tree.isError && <ErrorState error={tree.error} onRetry={tree.refetch} />}
        {!tree.isLoading && !tree.isError && !anyRooms && (
          <EmptyState
            icon={Gauge}
            title="No electronic assets found"
            description="Nothing in this selection has electronic equipment mapped yet, or nothing matches the current filters."
          />
        )}
        {!tree.isLoading && anyRooms && (
          <div className="space-y-6">
            {campusesOut.map((c) => (
              <div key={c.id} className="space-y-3">
                <h2 className="text-headline-sm text-ink">{c.name}</h2>
                {c.buildings.map((b) => (
                  <BuildingSection key={b.id} building={b} onSelectAsset={setSelectedAsset} />
                ))}
              </div>
            ))}
          </div>
        )}
      </Widget>

      <AssetDetailModal assetId={selectedAsset} onClose={() => setSelectedAsset(null)} />
    </div>
  )
}
