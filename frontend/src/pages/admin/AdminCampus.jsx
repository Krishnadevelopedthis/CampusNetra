import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, ChevronRight, Layers, MapPin, Pencil, Plus, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Field, Input, Modal, Spinner, Widget, toast,
} from '@/components/ui'
import { CampusLocationPicker } from '@/features/twin/CampusLocationPicker'
import { useCascadingDelete } from '@/hooks/useCascadingDelete'
import { api } from '@/lib/api'
import { TWIN_STATE } from '@/lib/format'

export default function AdminCampus() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(null)
  const [buildingForm, setBuildingForm] = useState(null)
  const [floorForm, setFloorForm] = useState(null)
  const [locationForm, setLocationForm] = useState(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const overview = useQuery({
    queryKey: ['campus-overview', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/overview`),
    enabled: !!campusId,
  })
  const floors = useQuery({
    queryKey: ['floors', expanded],
    queryFn: () => api.get(`/campus/buildings/${expanded}/floors`),
    enabled: !!expanded,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['campus-overview'] })
    qc.invalidateQueries({ queryKey: ['buildings'] })
    qc.invalidateQueries({ queryKey: ['floors'] })
  }

  const saveBuilding = useMutation({
    mutationFn: (f) => f.id
      ? api.patch(`/campus/buildings/${f.id}`, body(f))
      : api.post(`/campus/campuses/${campusId}/buildings`, body(f)),
    onSuccess: (b) => { toast.success(`${b.name} saved.`); setBuildingForm(null); refresh() },
    onError: (e) => toast.error(e.detail || 'Could not save the building'),
  })

  const deleteBuilding = useCascadingDelete({ path: '/campus/buildings', onDone: refresh })

  const addFloor = useMutation({
    mutationFn: ({ buildingId, ...f }) =>
      api.post(`/campus/buildings/${buildingId}/floors`, { name: f.name, level: Number(f.level) }),
    onSuccess: (f) => { toast.success(`${f.name} added.`); setFloorForm(null); refresh() },
    onError: (e) => toast.error(e.detail || 'Could not add the floor'),
  })

  const deleteFloor = useCascadingDelete({ path: '/campus/floors', onDone: refresh })

  const saveLocation = useMutation({
    mutationFn: (payload) => api.patch(`/campus/campuses/${campusId}`, payload),
    onSuccess: () => {
      toast.success('Campus location saved.')
      setLocationForm(null)
      qc.invalidateQueries({ queryKey: ['campuses'] })
      qc.invalidateQueries({ queryKey: ['campus-overview'] })
    },
    onError: (e) => toast.error(e.detail || 'Could not save the location'),
  })

  if (campuses.isLoading || overview.isLoading) return <Spinner label="Loading campus…" />
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.refetch} />

  const campus = campuses.data?.[0]
  const buildings = overview.data?.buildings || []

  return (
    <div className="space-y-5">
      <Widget
        title={campus?.name || 'Campus'}
        subtitle={campus?.address}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary" icon={MapPin}
              onClick={() => setLocationForm({
                latitude: campus?.latitude ?? null, longitude: campus?.longitude ?? null,
                map_bounds: campus?.map_bounds ?? null,
              })}
            >
              {campus?.latitude != null ? 'Edit location' : 'Set location'}
            </Button>
            <Button icon={Plus} onClick={() => setBuildingForm({ floors_count: 1 })}>
              Add building
            </Button>
          </div>
        }
      >
        <dl className="grid sm:grid-cols-4 gap-4">
          {[
            ['Buildings', overview.data?.totals.buildings],
            ['Rooms', overview.data?.totals.rooms],
            ['Assets', overview.data?.totals.assets],
            ['Open issues', overview.data?.totals.open_issues],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-label-caps uppercase text-ink-muted">{k}</dt>
              <dd className="text-headline-lg tabular text-ink mt-1">{v ?? 0}</dd>
            </div>
          ))}
        </dl>
        {campus?.latitude == null && (
          <p className="text-body-sm text-ink-faint mt-3">
            No location set — the Campus Map page shows an abstract layout instead of the
            real outdoor map. Set this campus's coordinates to enable it.
          </p>
        )}
      </Widget>

      <Widget title="Buildings & Floors"
              subtitle="Rooms are drawn onto floors in the Floor Plan editor"
              bodyClass="p-0">
        {buildings.length === 0 ? (
          <EmptyState icon={Building2} title="No buildings yet"
                      description="Add your first building — its floors are created with it."
                      action={<Button onClick={() => setBuildingForm({ floors_count: 1 })}>Add building</Button>} />
        ) : (
          <div className="divide-y divide-border-subtle">
            {buildings.map((b) => (
              <div key={b.id}>
                <div className="flex flex-wrap items-center gap-3 px-widget py-3">
                  <button
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <ChevronRight size={16}
                                  className={`text-ink-faint transition-transform ${expanded === b.id ? 'rotate-90' : ''}`} />
                    <Building2 size={17} className="text-ink-muted shrink-0" />
                    <div className="min-w-0">
                      <p className="text-body-md text-ink">
                        <span className="font-mono text-mono-data text-secondary">{b.code}</span>
                        <span className="ml-2">{b.name}</span>
                      </p>
                      <p className="text-body-sm text-ink-faint">
                        {b.asset_count} assets · {b.open_issues} open
                        {b.map_x != null && (
                          <span className="inline-flex items-center gap-1 ml-2">
                            <MapPin size={11} /> positioned
                          </span>
                        )}
                      </p>
                    </div>
                  </button>

                  <span className="pill shrink-0" style={{
                    background: `${b.aggregate_colour}1a`, color: b.aggregate_colour }}>
                    {TWIN_STATE[b.aggregate_state]?.label || b.aggregate_state}
                  </span>

                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" icon={Pencil}
                            onClick={() => setBuildingForm({ ...b })} />
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-danger-text"
                            loading={deleteBuilding.isPending}
                            onClick={() => deleteBuilding.remove(b.id, `${b.name}`)} />
                  </div>
                </div>

                {expanded === b.id && (
                  <div className="bg-surface-sunken px-widget py-3">
                    {floors.isLoading ? <Spinner label="Loading floors…" /> : (
                      <>
                        <div className="space-y-1.5">
                          {(floors.data || []).map((f) => (
                            <div key={f.id}
                                 className="flex items-center gap-3 bg-surface rounded border border-border-subtle px-3 py-2">
                              <Layers size={15} className="text-ink-faint" />
                              <span className="text-body-md text-ink flex-1">{f.name}</span>
                              <span className="text-body-sm text-ink-faint">level {f.level}</span>
                              {f.floor_plan_url && (
                                <span className="pill bg-info-bg text-info-text text-body-sm">plan uploaded</span>
                              )}
                              <Link to="/admin/floor-plans" className="btn-ghost btn-sm">Edit rooms</Link>
                              <Button size="sm" variant="ghost" icon={Trash2}
                                      className="text-danger-text"
                                      loading={deleteFloor.isPending}
                                      onClick={() => deleteFloor.remove(f.id, `${f.name}`)} />
                            </div>
                          ))}
                          {floors.data?.length === 0 && (
                            <p className="text-body-sm text-ink-faint py-2">No floors yet.</p>
                          )}
                        </div>
                        <Button size="sm" variant="secondary" icon={Plus} className="mt-3"
                                onClick={() => setFloorForm({
                                  buildingId: b.id,
                                  level: (floors.data?.length || 0) + 1,
                                  name: `Floor ${(floors.data?.length || 0) + 1}`,
                                })}>
                          Add floor
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Widget>

      <Modal
        open={!!buildingForm} onClose={() => setBuildingForm(null)}
        title={buildingForm?.id ? `Edit ${buildingForm.code}` : 'Add a building'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBuildingForm(null)}>Cancel</Button>
            <Button loading={saveBuilding.isPending}
                    disabled={!buildingForm?.name || !buildingForm?.code}
                    onClick={() => saveBuilding.mutate(buildingForm)}>
              {buildingForm?.id ? 'Save' : 'Create building'}
            </Button>
          </>
        }
      >
        {buildingForm && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Building name" required>
                <Input value={buildingForm.name || ''} placeholder="Science Block E"
                       onChange={(e) => setBuildingForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Code" required hint="Short, unique on this campus">
                <Input value={buildingForm.code || ''} placeholder="E"
                       onChange={(e) => setBuildingForm((f) => ({ ...f, code: e.target.value }))} />
              </Field>
            </div>

            {!buildingForm.id && (
              <Field label="Number of floors" required
                     hint="Floors are created with the building; you can add more later.">
                <Input type="number" min="1" max="100" value={buildingForm.floors_count ?? 1}
                       onChange={(e) => setBuildingForm((f) => ({ ...f, floors_count: Number(e.target.value) }))} />
              </Field>
            )}

            <div>
              <p className="label">Position on the campus map</p>
              <p className="hint mb-2">
                Coordinates from 0 to 1, measured from the top-left. Leave blank to
                omit the building from the map.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="X">
                  <Input type="number" step="0.01" min="0" max="1"
                         value={buildingForm.map_x ?? ''}
                         onChange={(e) => setBuildingForm((f) => ({
                           ...f, map_x: e.target.value === '' ? null : Number(e.target.value) }))} />
                </Field>
                <Field label="Y">
                  <Input type="number" step="0.01" min="0" max="1"
                         value={buildingForm.map_y ?? ''}
                         onChange={(e) => setBuildingForm((f) => ({
                           ...f, map_y: e.target.value === '' ? null : Number(e.target.value) }))} />
                </Field>
              </div>
            </div>

            <div>
              <p className="label">Real-world coordinates</p>
              <p className="hint mb-2">
                Only needed if the campus has a location set (see "Edit location" above) —
                places this building's footprint on the outdoor 3D map. Leave blank to have
                it positioned automatically instead.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Latitude">
                  <Input type="number" step="0.000001" min="-90" max="90"
                         value={buildingForm.latitude ?? ''}
                         onChange={(e) => setBuildingForm((f) => ({
                           ...f, latitude: e.target.value === '' ? null : Number(e.target.value) }))} />
                </Field>
                <Field label="Longitude">
                  <Input type="number" step="0.000001" min="-180" max="180"
                         value={buildingForm.longitude ?? ''}
                         onChange={(e) => setBuildingForm((f) => ({
                           ...f, longitude: e.target.value === '' ? null : Number(e.target.value) }))} />
                </Field>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!floorForm} onClose={() => setFloorForm(null)} title="Add a floor"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFloorForm(null)}>Cancel</Button>
            <Button loading={addFloor.isPending} disabled={!floorForm?.name}
                    onClick={() => addFloor.mutate(floorForm)}>Add floor</Button>
          </>
        }
      >
        {floorForm && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Floor name" required>
              <Input value={floorForm.name || ''}
                     onChange={(e) => setFloorForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Level" required hint="0 is ground, negatives are basements">
              <Input type="number" value={floorForm.level ?? ''}
                     onChange={(e) => setFloorForm((f) => ({ ...f, level: e.target.value }))} />
            </Field>
          </div>
        )}
      </Modal>
      <Modal
        open={!!locationForm} onClose={() => setLocationForm(null)} title="Campus location" size="lg"
      >
        {locationForm && (
          <CampusLocationPicker
            initial={locationForm}
            saving={saveLocation.isPending}
            onCancel={() => setLocationForm(null)}
            onSave={(payload) => saveLocation.mutate(payload)}
          />
        )}
      </Modal>
    </div>
  )
}

/** Only the fields the API accepts; the overview adds display-only extras.
 *
 * floors_count is only sent when creating a building. Editing one no longer
 * includes it at all — PATCH only applies keys actually present in the
 * request body, so this stops every edit (even just moving the map pin)
 * from silently resetting the building's floor count back to 1.
 */
const body = (f) => ({
  name: f.name, code: f.code,
  ...(f.id ? {} : { floors_count: f.floors_count ?? 1 }),
  map_x: f.map_x ?? null, map_y: f.map_y ?? null,
  latitude: f.latitude ?? null, longitude: f.longitude ?? null,
})
