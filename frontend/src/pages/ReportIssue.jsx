import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Armchair, Camera, Droplet, Fan, Lightbulb, MapPin, Monitor, Send, Sparkles,
  Video, Wifi, Wrench, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, PriorityPill, Select, Textarea, Widget, toast } from '@/components/ui'
import { api } from '@/lib/api'

/** Category icon name (from the DB) → lucide component. */
const ICONS = {
  projector: Video, snowflake: Fan, lightbulb: Lightbulb, armchair: Armchair,
  wifi: Wifi, wrench: Wrench, fan: Fan, monitor: Monitor, droplet: Droplet,
}

export default function ReportIssue() {
  const navigate = useNavigate()

  const [campusId, setCampusId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [aiPreview, setAiPreview] = useState(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  useEffect(() => {
    if (!campusId && campuses.data?.length) setCampusId(campuses.data[0].id)
  }, [campuses.data, campusId])

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
    queryKey: ['plan-rooms', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`).then((d) => d.rooms),
    enabled: !!floorId,
  })

  const selectedRoom = useMemo(
    () => rooms.data?.find((r) => r.id === roomId) || null,
    [rooms.data, roomId],
  )

  // Live AI classification preview, debounced while the reporter types.
  useEffect(() => {
    if (title.trim().length < 4 || description.trim().length < 10) {
      setAiPreview(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        setAiPreview(await api.post('/ai/classify-preview', { title, description }))
      } catch {
        setAiPreview(null)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [title, description])

  const submit = useMutation({
    mutationFn: (payload) => api.post('/issues', payload),
    onSuccess: (data) => {
      if (data.duplicate_warning) toast.info(data.duplicate_warning)
      else toast.success(`${data.issue.reference} submitted and routed to ${data.issue.department_name || 'the facilities team'}.`)
      navigate(`/issues/${data.issue.id}`)
    },
    onError: (err) => {
      if (err.fields) setErrors(err.fields)
      else toast.error(err.detail || 'Could not submit your report')
    },
  })

  const onSubmit = (e) => {
    e.preventDefault()
    const next = {}
    if (title.trim().length < 3) next.title = 'Give the issue a short title'
    if (description.trim().length < 10) next.description = 'Describe the problem in a little more detail'
    if (!campusId) next.campus_id = 'Select a campus'
    if (Object.keys(next).length) return setErrors(next)

    setErrors({})
    submit.mutate({
      title: title.trim(),
      description: description.trim(),
      campus_id: campusId,
      building_id: buildingId || null,
      floor_id: floorId || null,
      room_id: roomId || null,
      asset_id: assetId || null,
      location_note: locationNote.trim() || null,
      attachments: photos.map((p) => ({
        url: p.url, filename: p.name, mime_type: p.type, purpose: 'report',
      })),
    })
  }

  const addPhotos = (files) => {
    const accepted = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (accepted.length !== files.length) toast.error('Only image files can be attached.')
    setPhotos((prev) => [
      ...prev,
      // Object URLs stand in for a real upload endpoint; swap for the response
      // of POST /uploads when object storage is wired up.
      ...accepted.map((f) => ({ url: URL.createObjectURL(f), name: f.name, type: f.type })),
    ].slice(0, 5))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-6xl">
      <header>
        <h1 className="text-headline-lg text-ink">Report an Issue</h1>
        <p className="text-body-md text-ink-muted mt-1">
          Report a faulty asset or facility problem. It's routed to the right team automatically.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* 1. Location */}
          <Widget title={<span className="flex items-center gap-2"><MapPin size={18} className="text-secondary" /> 1. Identify Location</span>}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Campus" error={errors.campus_id} required>
                <Select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
                  {(campuses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Building">
                <Select
                  value={buildingId}
                  onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setRoomId(''); setAssetId('') }}
                >
                  <option value="">Select building</option>
                  {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Floor">
                <Select
                  value={floorId} disabled={!buildingId}
                  onChange={(e) => { setFloorId(e.target.value); setRoomId(''); setAssetId('') }}
                >
                  <option value="">Select floor</option>
                  {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Room / Area">
                <Select
                  value={roomId} disabled={!floorId}
                  onChange={(e) => { setRoomId(e.target.value); setAssetId('') }}
                >
                  <option value="">Select room</option>
                  {(rooms.data || []).map((r) => (
                    <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Extra location detail" className="mt-4"
                   hint="e.g. 'near the back wall, second row'">
              <Textarea
                rows={2} className="min-h-0" value={locationNote}
                onChange={(e) => setLocationNote(e.target.value)}
                placeholder="Anything that helps the technician find it"
              />
            </Field>
          </Widget>

          {/* 3. Details */}
          <Widget title={<span className="flex items-center gap-2"><Send size={18} className="text-secondary" /> 3. Issue Details</span>}>
            <Field label="Title" error={errors.title} required>
              <input
                className={`input ${errors.title ? 'input-error' : ''}`}
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Projector shows no display"
              />
            </Field>

            <Field label="Description" error={errors.description} required className="mt-4">
              <Textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail — what happens, when it started, anything you tried."
                error={errors.description}
              />
            </Field>

            <Field label="Evidence / Photo" className="mt-4"
                   hint="Up to 5 images. A photo speeds up diagnosis considerably.">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files) }}
                className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded border-2 border-dashed border-secondary/30 bg-info-bg/40 cursor-pointer hover:bg-info-bg transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-secondary/10 grid place-items-center">
                  <Camera size={20} className="text-secondary" />
                </div>
                <p className="text-body-md text-ink text-center">
                  Drag and drop photos here<br />
                  <span className="text-ink-faint">or click to browse</span>
                </p>
                <input type="file" accept="image/*" multiple className="hidden"
                       onChange={(e) => addPhotos(e.target.files)} />
              </label>

              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-24 h-24 rounded overflow-hidden border border-border-subtle">
                      <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, x) => x !== i))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary-950/70 text-white grid place-items-center"
                        aria-label={`Remove ${p.name}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </Widget>
        </div>

        {/* 2. Asset picker + AI preview */}
        <div className="space-y-5">
          <Widget
            title="2. Select Asset"
            subtitle={selectedRoom ? `Assets in ${selectedRoom.code}` : 'Choose a room first'}
          >
            {!selectedRoom ? (
              <p className="text-body-md text-ink-faint py-6 text-center">
                Pick a building, floor and room to list the equipment there.
              </p>
            ) : selectedRoom.assets.length === 0 ? (
              <p className="text-body-md text-ink-faint py-6 text-center">
                No assets are mapped in this room. You can still report a general issue.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {selectedRoom.assets.map((a) => {
                  const Icon = ICONS[a.category_icon] || Wrench
                  const selected = assetId === a.id
                  return (
                    <button
                      key={a.id} type="button"
                      onClick={() => setAssetId(selected ? '' : a.id)}
                      className={`relative flex flex-col items-center gap-2 p-3 rounded border transition-colors ${
                        selected
                          ? 'border-secondary bg-info-bg ring-1 ring-secondary'
                          : 'border-border-subtle bg-surface hover:bg-surface-sunken'
                      }`}
                    >
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-secondary grid place-items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        </span>
                      )}
                      <Icon size={22} className={selected ? 'text-secondary' : 'text-ink-muted'} />
                      <span className="text-body-sm text-center text-ink leading-tight">{a.name}</span>
                      <span className="font-mono text-[11px] text-ink-faint">{a.tag}</span>
                      <span className="w-2 h-2 rounded-full" style={{ background: a.colour }} />
                    </button>
                  )
                })}
              </div>
            )}
          </Widget>

          {aiPreview && (
            <div className="ai-surface p-widget animate-slide-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-body-md font-medium text-ink">AI Classification</p>
                  <p className="text-body-sm text-ink-faint">Preview — you can override on submit</p>
                </div>
              </div>
              <dl className="space-y-2 text-body-md">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Category</dt>
                  <dd className="font-medium text-ink">{aiPreview.category_name || 'Manual triage'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Priority</dt>
                  <dd><PriorityPill priority={aiPreview.priority} /></dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Confidence</dt>
                  <dd className="pill bg-info-bg text-info-text">
                    {Math.round((aiPreview.confidence || 0) * 100)}%
                  </dd>
                </div>
              </dl>
              {aiPreview.reasoning && (
                <p className="text-body-sm text-ink-muted mt-3 pt-3 border-t border-ai-border">
                  {aiPreview.reasoning}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1"
                    onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" icon={Send} loading={submit.isPending} className="flex-1">
              Submit
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
