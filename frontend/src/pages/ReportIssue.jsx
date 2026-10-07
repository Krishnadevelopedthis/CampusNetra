import { useMutation, useQuery } from '@tanstack/react-query'
import { AssetFilterBar, useAssetFilter } from '@/features/twin/RoomAssetList'
import {
  Armchair, CheckCircle2, Droplet, Fan, HelpCircle, Lightbulb, MapPin, Monitor, Send, Sparkles, Video, Wifi, Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  Button, Field, Input, Modal, PriorityPill, Select, Textarea, Widget, toast,
} from '@/components/ui'
import { ImageUpload } from '@/components/ImageUpload'
import { api } from '@/lib/api'

// Assets shown before "See more"; the list can be 40+ long in a big room.
const COLLAPSED_COUNT = 4
const ONE_ASSET_MESSAGE =
  'Only one asset can be reported at a time. Submit this report, then create a new report for the other asset.'

/** Category icon name (from the DB) → lucide component. */
const ICONS = {
  projector: Video, snowflake: Fan, lightbulb: Lightbulb, armchair: Armchair,
  wifi: Wifi, wrench: Wrench, fan: Fan, monitor: Monitor, droplet: Droplet,
}

export default function ReportIssue() {
  const navigate = useNavigate()
  // Present only on the /scan/asset/:assetId route (see App.jsx) — a QR
  // code scanned on the physical asset, never a manually-typed URL param.
  const { assetId: qrAssetId } = useParams()

  const [campusId, setCampusId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [assetId, setAssetId] = useState('')
  // null = not reporting an unlisted item; a string = its name, possibly blank.
  const [otherAsset, setOtherAsset] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [aiPreview, setAiPreview] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  useEffect(() => {
    // A QR scan resolves its own campus from the asset below — defaulting
    // to the org's first campus here would race it and flash the wrong one.
    if (!campusId && campuses.data?.length && !qrAssetId) setCampusId(campuses.data[0].id)
  }, [campuses.data, campusId, qrAssetId])

  // The asset a QR code was scanned for — resolved server-side, org-scoped
  // and auth-gated by the existing /campus/assets/{id} endpoint, so a scan
  // can never leak or claim an asset outside the scanner's own organisation.
  const qrAsset = useQuery({
    queryKey: ['qr-asset-detail', qrAssetId],
    queryFn: () => api.get(`/campus/assets/${qrAssetId}`),
    enabled: !!qrAssetId,
  })
  const [qrApplied, setQrApplied] = useState(false)
  useEffect(() => {
    if (!qrAsset.data || qrApplied) return
    const { asset, room } = qrAsset.data
    if (room?.campus_id) setCampusId(room.campus_id)
    if (room?.building_id) setBuildingId(room.building_id)
    if (room?.floor_id) setFloorId(room.floor_id)
    if (room?.id) setRoomId(room.id)
    setAssetId(asset.id)
    setTitle((t) => t || `Issue with ${asset.name}`)
    setQrApplied(true)
  }, [qrAsset.data, qrApplied])

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

  const assetFilter = useAssetFilter(selectedRoom?.assets || [])
  useEffect(() => { setShowAll(false) }, [roomId])

  // Exactly one thing can be reported per report: a listed asset OR "Something else".
  const hasChoice = !!assetId || otherAsset !== null
  const toggleAsset = (a) => {
    if (assetId === a.id) { setAssetId(''); return }
    if (hasChoice) { toast.info(ONE_ASSET_MESSAGE); return }
    setAssetId(a.id)
    setShowAll(false)   // picking one folds the list away; "See more" brings it back
  }
  const toggleOther = () => {
    if (otherAsset !== null) { setOtherAsset(null); return }
    if (hasChoice) { toast.info(ONE_ASSET_MESSAGE); return }
    setOtherAsset('')
    setShowAll(false)
  }
  // Folded: only the chosen asset is listed. Open: the filtered list. Default: the first few.
  const folded = !showAll && hasChoice
  const roomAssets = selectedRoom?.assets || []
  const visibleAssets = showAll
    ? assetFilter.shown
    : folded
      ? roomAssets.filter((a) => a.id === assetId)
      : assetFilter.shown.slice(0, COLLAPSED_COUNT)
  const hiddenCount = showAll
    ? 0
    : folded
      ? roomAssets.length - (assetId ? 1 : 0)
      : Math.max(assetFilter.shown.length - COLLAPSED_COUNT, 0)

  // Live AI classification preview, debounced while the reporter types.
  useEffect(() => {
    if (title.trim().length < 4 || description.trim().length < 10) {
      setAiPreview(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        setAiPreview(await api.post('/ai/classify-preview', { title, description, asset_id: assetId || null }))
      } catch {
        setAiPreview(null)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [title, description, assetId])

  const submit = useMutation({
    mutationFn: (payload) => api.post('/issues', payload),
    onSuccess: (data) => {
      if (data.duplicate_warning) {
        toast.info(data.duplicate_warning)
        navigate(`/issues/${data.issue.id}`)
        return
      }
      setSubmitted(data.issue)
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
      // No asset row to point at, so the name goes where a human will read it,
      // marked so whoever maintains the register can act on the gap.
      description: otherAsset?.trim()
        ? `${description.trim()}\n\n[Unlisted equipment: ${otherAsset.trim()}]`
        : description.trim(),
      campus_id: campusId,
      building_id: buildingId || null,
      floor_id: floorId || null,
      room_id: roomId || null,
      asset_id: assetId || null,
      location_note: locationNote.trim() || null,
      attachments: photos.map((p) => ({
        url: p.url, thumb_url: p.thumb_url, filename: p.filename,
        mime_type: p.mime_type, size_bytes: p.size_bytes,
        // Drives duplicate detection's image signal.
        phash: p.phash, purpose: 'report',
      })),
    })
  }


  if (qrAssetId && qrAsset.isLoading) {
    return <p className="text-body-md text-ink-faint py-10 text-center">Loading asset…</p>
  }
  if (qrAssetId && qrAsset.error) {
    return (
      <p className="text-body-md text-danger-text py-10 text-center">
        This QR code doesn't match a known asset — {qrAsset.error.detail || 'it may have been removed.'}
      </p>
    )
  }

  return (
    <>
    <form onSubmit={onSubmit} className="space-y-5 max-w-6xl min-w-0">
      <header>
        <h1 className="text-headline-lg text-ink">Report an Issue</h1>
        <p className="text-body-md text-ink-muted mt-1">
          {qrAssetId
            ? "Scanned from the asset's QR code — its location is filled in for you. Just describe the problem below."
            : "Report a faulty asset or facility problem. It's routed to the right team automatically."}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5 min-w-0">
          {/* 1. Location */}
          <Widget title={<span className="flex items-center gap-2"><MapPin size={18} className="text-secondary" /> 1. Identify Location</span>}>
            <p className="text-body-sm text-ink-faint -mt-1 mb-3">
              {qrAssetId
                ? 'Auto-filled from the scanned QR code.'
                : "Don't know the exact building, floor or room? Leave those blank and describe where it is in the note below instead — only the campus is required."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Campus" error={errors.campus_id} required>
                <Select value={campusId} disabled={!!qrAssetId} onChange={(e) => setCampusId(e.target.value)}>
                  {(campuses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Building">
                <Select
                  value={buildingId} disabled={!!qrAssetId}
                  onChange={(e) => { setBuildingId(e.target.value); setFloorId(''); setRoomId(''); setAssetId('') }}
                >
                  <option value="">Select building — or leave blank if unsure</option>
                  {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Floor">
                <Select
                  value={floorId} disabled={!buildingId || !!qrAssetId}
                  onChange={(e) => { setFloorId(e.target.value); setRoomId(''); setAssetId('') }}
                >
                  <option value="">Select floor</option>
                  {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Room / Area">
                <Select
                  value={roomId} disabled={!floorId || !!qrAssetId}
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
                   hint="e.g. 'near the back wall, second row' — or, if you skipped building/floor above, describe the location here instead">
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

            <Field label="Evidence / Photo" className="mt-4">
              <ImageUpload
                value={photos} onChange={setPhotos} purpose="report" max={5}
                hint="Up to 5 images. A photo speeds up diagnosis, and lets the AI spot duplicate reports of the same fault."
              />
            </Field>
          </Widget>
        </div>

        {/* 2. Asset picker + AI preview */}
        <div className="space-y-5 min-w-0">
          <Widget
            title="2. Select Asset"
            subtitle={selectedRoom ? `Assets in ${selectedRoom.code}` : 'Choose a room first'}
          >
            {!selectedRoom ? (
              <p className="text-body-md text-ink-faint py-6 text-center">
                Pick a building, floor and room above to list the equipment
                there — or skip that and just describe what's affected in
                the Issue Details on the left.
              </p>
            ) : (
              <>
              <AssetFilterBar filter={assetFilter} />
              <p className="text-body-xs text-ink-faint pb-2">
                One asset per report. To report another, submit this one and start a new report.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                {visibleAssets.map((a) => {
                  const Icon = ICONS[a.category_icon] || Wrench
                  const selected = assetId === a.id
                  return (
                    <button
                      key={a.id} type="button"
                      onClick={() => toggleAsset(a)}
                      aria-pressed={selected}
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
                      <span className="text-body-sm text-center text-ink leading-tight break-words max-w-full">{a.name}</span>
                      <span className="font-mono text-[11px] text-ink-faint text-center break-words max-w-full">{a.tag}</span>
                      <span className="w-2 h-2 rounded-full" style={{ background: a.colour }} />
                    </button>
                  )
                })}

                {/* Registers are never complete, and the person standing in
                    front of the broken thing is the one who found the gap.
                    Naming it here keeps the report attached to the room, and
                    gives whoever maintains the register something to act on. */}
                {(otherAsset !== null || !folded) && (
                <button
                  type="button"
                  onClick={toggleOther}
                  aria-pressed={otherAsset !== null}
                  className={`relative flex flex-col items-center justify-center gap-2 p-3
                              rounded-xl border border-dashed transition-colors ${
                    otherAsset !== null
                      ? 'border-secondary bg-info-bg ring-1 ring-secondary'
                      : 'border-border-strong bg-surface hover:bg-surface-sunken'
                  }`}
                >
                  <HelpCircle size={22} className={otherAsset !== null ? 'text-secondary' : 'text-ink-muted'} />
                  <span className="text-body-sm text-center text-ink leading-tight">
                    Something else
                  </span>
                  <span className="text-[11px] text-ink-faint text-center">
                    Not in this list
                  </span>
                </button>
                )}
              </div>
              {(hiddenCount > 0 || showAll) && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-3 w-full h-10 rounded-lg border border-border-subtle bg-surface text-body-sm
                             font-medium text-secondary hover:bg-surface-sunken transition-colors"
                >
                  {showAll ? 'Show less' : `See more (${hiddenCount} more)`}
                </button>
              )}
              {assetFilter.shown.length === 0 && (
                <p className="text-body-sm text-ink-faint pt-2">No assets match.</p>
              )}
              </>
            )}

            {selectedRoom && selectedRoom.assets.length === 0 && otherAsset === null && (
              <p className="text-body-md text-ink-faint pt-3 text-center">
                Nothing is mapped in this room yet — use “Something else” to name it.
              </p>
            )}

            {otherAsset !== null && (
              <div className="mt-3 space-y-3">
                <Field
                  label="What is it?"
                  hint="A name is enough — a photo below helps whoever comes to look."
                >
                  <Input
                    value={otherAsset}
                    onChange={(e) => setOtherAsset(e.target.value)}
                    placeholder="e.g. Wall socket beside the whiteboard"
                    autoFocus
                  />
                </Field>
                <p className="text-body-sm text-ink-faint">
                  This is reported against {selectedRoom.code} and flagged for the
                  register, so the equipment can be added properly.
                </p>
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
                  <dd className="font-medium text-ink text-right">{aiPreview.category_name || 'Not sure yet'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Priority</dt>
                  <dd><PriorityPill priority={aiPreview.priority} /></dd>
                </div>
                {aiPreview.category_name && aiPreview.confidence != null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Confidence</dt>
                    <dd className="pill bg-info-bg text-info-text">
                      {Math.round(aiPreview.confidence * 100)}%
                    </dd>
                  </div>
                )}
                {aiPreview.source === 'asset' && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Based on</dt>
                    <dd className="text-ink">The item you selected</dd>
                  </div>
                )}
              </dl>
              {!aiPreview.category_name ? (
                <p className="text-body-sm text-ink-muted mt-3 pt-3 border-t border-ai-border">
                  We could not tell the category from your words yet. Pick the item above or add a
                  few more details; if you submit as is, the facility team will sort it.
                </p>
              ) : aiPreview.reasoning && (
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

    <Modal
      open={!!submitted}
      onClose={() => submitted && navigate(`/issues/${submitted.id}`)}
      title=" "
      size="sm"
      footer={
        <Button type="button" className="w-full"
                onClick={() => navigate(`/issues/${submitted?.id}`)}>
          View complaint
        </Button>
      }
    >
      {submitted && (
        <div className="text-center py-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-success-bg grid place-items-center mb-4">
            <CheckCircle2 size={28} className="text-success-text" />
          </div>
          <p className="text-headline-md text-ink">Complaint Submitted Successfully</p>
          <p className="text-body-md text-ink-muted mt-2">Complaint Number</p>
          <p className="font-mono text-mono-data text-secondary text-headline-md mt-1">
            {submitted.reference}
          </p>
          {submitted.department_name && (
            <p className="text-body-sm text-ink-faint mt-3">
              Routed to {submitted.department_name}.
            </p>
          )}
        </div>
      )}
    </Modal>
    </>
  )
}
