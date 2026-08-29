import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle, Boxes, CircleDollarSign, Layers,
  Pencil, Plus, Trash2, } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Button, EmptyState, ErrorState, Field, Metric, Select,
  SkeletonRows, Widget, toast,
} from '@/components/ui'
import { AssetModal, RoomModal } from '@/features/twin/AssetRoomModals'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { dt, money } from '@/lib/format'

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
