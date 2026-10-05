import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, CheckCircle2, Loader2, MessageSquare, Package, Play, Plus, Send } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Avatar, Button, ErrorState, Field, Input, Modal, PriorityPill, Select, Spinner,
  StatusPill, Textarea, Widget, toast,
} from '@/components/ui'
import { api, upload } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, dt, money, slaLabel, slaOutcome, titleCase } from '@/lib/format'
import { useAuthedImage } from '@/hooks/useAuthedImage'
import AdminDeleteButton from '@/components/AdminDeleteButton'
import { WARRANTY_PERIODS, addMonths } from '@/features/twin/AssetRoomModals'

// The one obvious next move for each status, so nobody has to find it in the
// "Update status" dropdown. [target status, button label, icon]
const NEXT_STEP = {
  assigned: ['accepted', 'Accept work order', CheckCircle2],
  accepted: ['in_progress', 'Start work', Play],
  in_progress: ['completed', 'Mark complete', CheckCircle2],
  completed: ['verified', 'Verify work', CheckCircle2],
  verified: ['closed', 'Close work order', CheckCircle2],
}

/** 135 -> "2 hr 15 min", 40 -> "40 min", 1500 -> "1 day 1 hr". */
function duration(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} hr` : ''}`
  if (h) return `${h} hr${mm ? ` ${mm} min` : ''}`
  return `${mm} min`
}

// Once the work is done (or called off) there is nothing left to order parts for.
const FINISHED = ['completed', 'verified', 'closed', 'cancelled']

// Plain-language names for the less common moves in the "Other actions" menu.
const STATUS_ACTION = {
  in_progress: 'Back to In Progress (resume / reopen)',
  on_hold: 'Put on hold',
  awaiting_parts: 'Waiting for parts',
  open: 'Unassign (back to Open)',
  cancelled: 'Cancel work order',
  accepted: 'Accept',
  completed: 'Mark complete',
  verified: 'Verify work',
  closed: 'Close',
}

export default function WorkOrderDetail() {
  const role = useAuth((st) => st.user?.role)
  const { id } = useParams()
  const qc = useQueryClient()
  const [transitionTo, setTransitionTo] = useState(null)
  const [form, setForm] = useState({})
  const [comment, setComment] = useState('')
  const [partsOpen, setPartsOpen] = useState(false)
  const [part, setPart] = useState({ item_name: '', quantity: 1, justification: '' })

  const { data: wo, isLoading, error, refetch } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api.get(`/work-orders/${id}`),
  })

  // Resolves once this page's own data has reloaded, so a caller can keep its
  // placeholder up until the fresh data replaces it.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['work-orders'] })
    qc.invalidateQueries({ queryKey: ['wo-board'] })
    return qc.invalidateQueries({ queryKey: ['work-order', id] })
  }

  const transition = useMutation({
    mutationFn: (payload) => api.post(`/work-orders/${id}/transition`, payload),
    onSuccess: (d) => {
      toast.success(`Moved to ${titleCase(d.status)}.`)
      setTransitionTo(null); setForm({}); invalidate()
    },
    onError: (err) => toast.error(err.detail || 'Could not update'),
  })

  const addComment = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/comments`, { body: comment.trim() }),
    onSuccess: () => { setComment(''); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  const canDecideParts = ['facility_manager', 'admin', 'super_admin'].includes(role)
  const decidePart = useMutation({
    mutationFn: ({ partId, approve }) => api.post(`/work-orders/parts/${partId}/decision?approve=${approve}`),
    onSuccess: (d) => { toast.success(d.detail || 'Done.'); invalidate() },
    onError: (err) => toast.error(err.detail || 'Could not record the decision'),
  })

  const requestParts = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/parts`, part),
    onSuccess: () => {
      toast.success('Parts request submitted for approval.')
      setPartsOpen(false); setPart({ item_name: '', quantity: 1, justification: '' }); invalidate()
    },
    onError: (err) => toast.error(err.detail),
  })

  if (isLoading) return <Spinner label="Loading work order…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const completing = transitionTo === 'completed'
  // First time it was accepted; the timeline is the record of that.
  const acceptedAt = (wo.timeline || []).find((e) => e.to_status === 'accepted')?.created_at
    || wo.started_at
  const missingAfterPhoto = completing && !(wo.after_photos?.length)

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/work-orders" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to work orders
          </Link>
          <AdminDeleteButton path={`/work-orders/${id}`} queryKey={['work-order', id]} backTo="/work-orders" noun="work order"
            warning="Its comments, photos, part requests and timeline are deleted with it." className="ml-3 mb-2" />
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-mono-data text-secondary">{wo.reference}</span>
            <StatusPill status={wo.status} />
            <PriorityPill priority={wo.priority} />
            {wo.is_predictive && <span className="pill bg-ai-bg text-info-text">Predictive</span>}
            {wo.sla_breached && <span className="pill bg-danger-bg text-danger-text">SLA breached</span>}
          </div>
          <h1 className="text-headline-lg text-ink mt-2">{wo.title}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {(() => {
            const step = NEXT_STEP[wo.status]
            // Checking and closing the work is for managers, not the person who did it.
            const checking = step && ['verified', 'closed'].includes(step[0])
            if (!step || !wo.allowed_transitions?.includes(step[0]) || (checking && role === 'technician')) return null
            const [target, label, Icon] = step
            const needsPhoto = target === 'completed' && !(wo.after_photos?.length)
            return (
              <Button icon={Icon} disabled={needsPhoto}
                      title={needsPhoto ? 'Upload an After photo first' : undefined}
                      onClick={() => setTransitionTo(target)}>
                {label}
              </Button>
            )
          })()}
          {!FINISHED.includes(wo.status) && (
            <Button variant="secondary" icon={Package} onClick={() => setPartsOpen(true)}>Request parts</Button>
          )}
          {wo.allowed_transitions?.some((s) => s !== NEXT_STEP[wo.status]?.[0]
            && !(role === 'technician' && ['verified', 'closed', 'cancelled'].includes(s))) && (
            <Select value="" className="w-auto min-w-[180px]"
                    onChange={(e) => e.target.value && setTransitionTo(e.target.value)}>
              <option value="">Other actions…</option>
              {wo.allowed_transitions
                // The main button already offers the next step; don't list it twice.
                .filter((s) => s !== NEXT_STEP[wo.status]?.[0])
                // Verifying and closing are for managers, not the person who did the work.
                .filter((s) => !(role === 'technician' && ['verified', 'closed', 'cancelled'].includes(s)))
                .map((s) => <option key={s} value={s}>{STATUS_ACTION[s] || titleCase(s)}</option>)}
            </Select>
          )}
        </div>
      </div>

      {wo.status === 'in_progress' && !(wo.after_photos?.length) && (
        <p className="text-body-sm text-warning-text bg-warning-bg border border-border-subtle rounded px-3 py-2">
          Upload an <strong>After</strong> photo (in the Evidence section below) to enable "Mark complete".
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {wo.description && (
            <Widget title="Task"><p className="text-body-lg whitespace-pre-wrap">{wo.description}</p></Widget>
          )}

          {wo.resolution_note && (
            <Widget title="Resolution">
              <p className="text-body-lg whitespace-pre-wrap">{wo.resolution_note}</p>
            </Widget>
          )}
          {wo.blocked_reason && (
            <div className="widget border-warning-border bg-warning-bg p-widget">
              <p className="text-body-md font-medium text-warning-text">Blocked</p>
              <p className="text-body-md text-ink mt-1">{wo.blocked_reason}</p>
            </div>
          )}

          <Widget title={<span className="flex items-center gap-2"><Camera size={17} /> Before / After Evidence</span>}>
            <div className="grid sm:grid-cols-2 gap-5">
              {[['Before', 'before', wo.before_photos], ['After', 'after', wo.after_photos]].map(
                ([label, purpose, photos]) => (
                  <EvidenceSection
                    key={purpose}
                    label={label}
                    purpose={purpose}
                    photos={photos}
                    workOrderId={id}
                    onUploaded={invalidate}
                  />
                ),
              )}
            </div>
          </Widget>

          <Widget title="Timeline" bodyClass="p-0">
            <ol className="p-widget space-y-4">
              {wo.timeline.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-2 h-2 rounded-full bg-border-strong mt-2 shrink-0" />
                  <div>
                    <p className="text-body-md text-ink">
                      {e.from_status
                        ? <>{titleCase(e.from_status)} → <strong>{titleCase(e.to_status)}</strong></>
                        : <strong>{titleCase(e.to_status)}</strong>}
                    </p>
                    {e.note && <p className="text-body-md text-ink-muted">{e.note}</p>}
                    <p className="text-body-sm text-ink-faint mt-0.5">
                      {e.actor?.full_name || 'System'} · {dt(e.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Widget>

          <Widget title={<span className="flex items-center gap-2"><MessageSquare size={17} /> Comments</span>}>
            <div className="space-y-4">
              {wo.comments.length === 0 && (
                <p className="text-body-md text-ink-faint">No comments yet.</p>
              )}
              {wo.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar name={c.author?.full_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-md">
                      <strong className="text-ink">{c.author?.full_name || 'Unknown'}</strong>{' '}
                      <span className="text-ink-faint text-body-sm">{ago(c.created_at)}</span>
                      {c.is_internal && <span className="pill bg-neutral-bg text-neutral-text ml-2 text-body-sm">Internal</span>}
                    </p>
                    <p className="text-body-md text-ink mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}

              <form
                onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate() }}
                className="flex gap-2 pt-3 border-t border-border-subtle"
              >
                <Input value={comment} onChange={(e) => setComment(e.target.value)}
                       placeholder="Add a comment…" />
                <Button type="submit" icon={Send} loading={addComment.isPending}
                        disabled={!comment.trim()}>Post</Button>
              </form>
            </div>
          </Widget>
        </div>

        <div className="space-y-5">
          <Widget title="Details">
            <dl className="space-y-3">
              <Row label="Location" value={wo.location_summary && <span className="font-mono text-mono-data">{wo.location_summary}</span>} />
              {wo.department_name && <Row label="Department" value={wo.department_name} />}
              <Row label="Technician" value={wo.assignee?.full_name} />
              <Row label="Source issue" value={wo.issue_reference && <span className="font-mono text-mono-data text-secondary">{wo.issue_reference}</span>} />
              <Row label="SLA" value={wo.sla_minutes_remaining != null && (
                ['completed', 'verified', 'closed'].includes(wo.status) ? (() => {
                  const o = slaOutcome(wo.sla_minutes_remaining, wo.sla_breached)
                  return <span className={`font-medium ${o.missed ? 'text-danger-text' : 'text-success-text'}`}>{o.text}</span>
                })() : (
                  <span className={wo.sla_minutes_remaining < 0 ? 'text-danger-text font-medium' : ''}>
                    {slaLabel(wo.sla_minutes_remaining)}
                  </span>
                )
              )} />
              <Row label="Started" value={wo.started_at && dt(wo.started_at)} />
              <Row label="Completed" value={wo.completed_at && dt(wo.completed_at)} />
              <Row label="Accepted" value={acceptedAt && dt(acceptedAt)} />
              <Row label="Time taken" value={wo.actual_mins != null ? duration(wo.actual_mins) : null} />
            </dl>
          </Widget>

          <Widget title="Cost">
            <dl className="space-y-3">
              <Row label="Labour" value={<span className="tabular">{money(wo.labour_cost)}</span>} />
              <Row label="Parts" value={<span className="tabular">{money(wo.parts_cost)}</span>} />
              <div className="flex justify-between pt-3 border-t border-border-subtle">
                <dt className="text-body-md font-medium">Total</dt>
                <dd className="text-body-lg font-semibold tabular">{money(wo.total_cost)}</dd>
              </div>
            </dl>
          </Widget>

          {wo.part_requests.length > 0 && (
            <Widget title="Part Requests">
              <div className="space-y-2">
                {wo.part_requests.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body-md text-ink truncate">{p.quantity} × {p.item_name}</p>
                      <p className="text-body-sm text-ink-faint">{ago(p.created_at)}</p>
                    </div>
                    {canDecideParts && p.status === 'pending' ? (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="ghost"
                                loading={decidePart.isPending && decidePart.variables?.partId === p.id}
                                onClick={() => decidePart.mutate({ partId: p.id, approve: false })}>
                          Reject
                        </Button>
                        <Button size="sm"
                                loading={decidePart.isPending && decidePart.variables?.partId === p.id}
                                onClick={() => decidePart.mutate({ partId: p.id, approve: true })}>
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <StatusPill status={p.status} />
                    )}
                  </div>
                ))}
              </div>
            </Widget>
          )}
        </div>
      </div>

      {/* Status modal */}
      <Modal
        open={!!transitionTo} onClose={() => { setTransitionTo(null); setForm({}) }}
        title={`Move to ${titleCase(transitionTo || '')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setTransitionTo(null); setForm({}) }}>Cancel</Button>
            <Button loading={transition.isPending} disabled={missingAfterPhoto || (completing && form.replaced && !replacementReady(form))} onClick={() => transition.mutate({
              status: transitionTo,
              note: form.note?.trim() || null,
              resolution_note: form.resolution_note?.trim() || null,
              labour_cost: form.labour_cost ? Number(form.labour_cost) : null,
              parts_cost: form.parts_cost ? Number(form.parts_cost) : null,
              blocked_reason: form.blocked_reason?.trim() || null,
              replacement: completing && form.replaced ? replacementPayload(form) : null,
            })}>Confirm</Button>
          </>
        }
      >
        <div className="space-y-4">
          {missingAfterPhoto && (
            <p className="text-body-md text-danger-text">
              An After photo is needed as proof of the repair. Close this, upload one, then try again.
            </p>
          )}
          {completing && (
            <>
              <Field label="What did you do?" required>
                <Textarea value={form.resolution_note || ''}
                          onChange={(e) => setForm((f) => ({ ...f, resolution_note: e.target.value }))}
                          placeholder="Describe the repair, parts used, and anything to watch." />
              </Field>
              <p className="text-body-sm text-ink-muted">
                Time taken is recorded automatically, from when the work order was accepted until now
                {acceptedAt && <> — about <strong className="text-ink">{duration((Date.now() - new Date(acceptedAt)) / 60000)}</strong></>}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Labour ₹">
                  <Input type="number" min="0" value={form.labour_cost || ''}
                         onChange={(e) => setForm((f) => ({ ...f, labour_cost: e.target.value }))} />
                </Field>
                <Field label="Parts ₹">
                  <Input type="number" min="0" value={form.parts_cost || ''}
                         onChange={(e) => setForm((f) => ({ ...f, parts_cost: e.target.value }))} />
                </Field>
              </div>
            </>
          )}

          {completing && wo.asset_id && (
            <ReplacementFields form={form} setForm={setForm} assetName={wo.asset_name} />
          )}

          {['on_hold', 'awaiting_parts'].includes(transitionTo) && (
            <Field label="What's blocking this?" required>
              <Textarea value={form.blocked_reason || ''}
                        onChange={(e) => setForm((f) => ({ ...f, blocked_reason: e.target.value }))}
                        placeholder="e.g. Waiting on a replacement lamp module." />
            </Field>
          )}

          {!completing && (
            <Field label="Note" hint="Optional — appears on the timeline">
              <Textarea value={form.note || ''}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </Field>
          )}
        </div>
      </Modal>

      {/* Parts modal */}
      <Modal
        open={partsOpen} onClose={() => setPartsOpen(false)} title="Request parts or resources"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPartsOpen(false)}>Cancel</Button>
            <Button loading={requestParts.isPending} disabled={!part.item_name.trim()}
                    onClick={() => requestParts.mutate()}>Submit request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Item" required>
            <Input value={part.item_name} onChange={(e) => setPart((p) => ({ ...p, item_name: e.target.value }))}
                   placeholder="e.g. Projector lamp module — BenQ MW550" />
          </Field>
          <Field label="Quantity" required>
            <Input type="number" min="1" value={part.quantity}
                   onChange={(e) => setPart((p) => ({ ...p, quantity: Number(e.target.value) }))} />
          </Field>
          <Field label="Justification" hint="Helps the manager approve faster">
            <Textarea value={part.justification}
                      onChange={(e) => setPart((p) => ({ ...p, justification: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function EvidenceThumb({ photo, label }) {
  const thumbSrc = useAuthedImage(photo.thumb_url || photo.url)
  const fullSrc = useAuthedImage(photo.url)
  return (
    <a href={fullSrc || undefined} target="_blank" rel="noreferrer"
       className="w-24 h-24 rounded overflow-hidden border border-border-subtle bg-surface-2">
      {thumbSrc && <img loading="lazy" decoding="async" src={thumbSrc} alt={label} className="w-full h-full object-cover" />}
    </a>
  )
}

// Backend's max upload size (see MAX_UPLOAD_MB in uploads.py) -- checked
// client-side too, so a technician isn't left waiting through an upload
// just to be told after the fact it was too big.
const MAX_EVIDENCE_MB = 10
const MAX_EVIDENCE_PHOTOS = 6

/**
 * Before/After evidence, one photo at a time: picks a file, uploads it to
 * storage, then immediately attaches it to the work order (purpose:
 * "before"/"after") -- there's no separate "save" step, each photo lands as
 * soon as it finishes uploading, same as the reporter-facing ImageUpload
 * component but simpler since a work order attachment has nothing else to
 * fill in alongside it.
 */
function EvidenceSection({ label, purpose, photos, workOrderId, onUploaded }) {
  const [busy, setBusy] = useState(false)
  // The photo is shown the moment it is picked; the upload finishes behind it.
  const [preview, setPreview] = useState(null)
  const inputRef = useRef(null)
  const atLimit = photos.length >= MAX_EVIDENCE_PHOTOS

  const pick = async (files) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files can be attached.')
      return
    }
    if (file.size > MAX_EVIDENCE_MB * 1024 * 1024) {
      toast.error(`Image is over ${MAX_EVIDENCE_MB} MB — please choose a smaller photo.`)
      return
    }
    setBusy(true)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const body = new FormData()
      body.append('file', file)
      await upload(`/work-orders/${workOrderId}/evidence`, body, { params: { purpose } })
      await onUploaded()
    } catch (err) {
      toast.error(err.detail || err.message || 'Could not upload photo')
    } finally {
      setBusy(false)
      setPreview(null)
      URL.revokeObjectURL(local)
    }
  }

  return (
    <div>
      <p className="text-label-caps uppercase text-ink-muted mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <EvidenceThumb key={p.id} photo={p} label={label} />
        ))}

        {preview && (
          <div className="relative w-24 h-28 rounded overflow-hidden border border-border-subtle">
            <img src={preview} alt={`${label} photo uploading`} className="w-full h-full object-cover opacity-70" />
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 size={18} className="animate-spin text-white drop-shadow" />
            </span>
          </div>
        )}

        <input
          ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { pick(e.target.files); e.target.value = '' }}
        />

        {!atLimit && !busy && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-24 h-28 rounded border border-dashed border-border grid place-items-center gap-1 text-body-sm text-ink-faint hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {photos.length === 0
              ? <span>No {label.toLowerCase()}<br />photo</span>
              : <span>Add</span>}
          </button>
        )}
      </div>
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

/** Enough to identify the new unit: a make, a model or a serial number. */
function replacementReady(f) {
  return !!(f.r_manufacturer?.trim() || f.r_model?.trim() || f.r_serial?.trim())
}

function replacementPayload(f) {
  const num = (v) => (v === '' || v == null ? null : Number(v))
  return {
    manufacturer: f.r_manufacturer?.trim() || null,
    model: f.r_model?.trim() || null,
    serial_no: f.r_serial?.trim() || null,
    purchase_date: f.r_purchase_date || today(),
    cost: num(f.r_cost),
    warranty_months: f.r_warranty_months && f.r_warranty_months !== 'custom' ? Number(f.r_warranty_months) : null,
    warranty_expiry: f.r_warranty_expiry || null,
    expected_life_months: num(f.r_life),
    service_interval_days: num(f.r_service),
  }
}

/**
 * "Did you fit a new one?" on the completion form. When the technician swaps a
 * dead unit for a new one, the asset keeps its place, tag and QR code but its
 * make, serial, purchase date, cost and warranty become the new unit's.
 */
function ReplacementFields({ form, setForm, assetName }) {
  const set = (k) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [k]: value }
      const purchase = k === 'r_purchase_date' ? value : (f.r_purchase_date || today())
      const months = k === 'r_warranty_months' ? value : f.r_warranty_months
      if ((k === 'r_purchase_date' || k === 'r_warranty_months') && months && months !== 'custom') {
        next.r_warranty_expiry = addMonths(purchase, months)
      }
      if (k === 'r_warranty_months' && !value) next.r_warranty_expiry = ''
      return next
    })
  }
  const name = assetName || 'unit'

  return (
    <div className="rounded border border-border-subtle p-3 space-y-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--c-brand))]"
               checked={!!form.replaced}
               onChange={(e) => setForm((f) => ({ ...f, replaced: e.target.checked, r_purchase_date: f.r_purchase_date || today() }))} />
        <span>
          <span className="text-body-md font-medium text-ink">New {name} installed?</span>
          <span className="block text-body-sm text-ink-faint">
            Tick this if you replaced the old one with a new unit. Its details and warranty replace the old ones;
            the old unit's details are kept in the asset's history.
          </span>
        </span>
      </label>

      {form.replaced && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Make / manufacturer" required>
              <Input value={form.r_manufacturer || ''} onChange={set('r_manufacturer')} placeholder="e.g. Philips" />
            </Field>
            <Field label="Model">
              <Input value={form.r_model || ''} onChange={set('r_model')} />
            </Field>
            <Field label="Serial number">
              <Input value={form.r_serial || ''} onChange={set('r_serial')} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Installed on">
              <Input type="date" value={form.r_purchase_date || today()} onChange={set('r_purchase_date')} />
            </Field>
            <Field label="Price ₹" hint="Counted as the parts cost unless you enter one">
              <Input type="number" min="0" value={form.r_cost || ''} onChange={set('r_cost')} />
            </Field>
            <Field label="Warranty period">
              <Select value={form.r_warranty_months || ''} onChange={set('r_warranty_months')}>
                {WARRANTY_PERIODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Warranty ends">
              <Input type="date" value={form.r_warranty_expiry || ''} onChange={set('r_warranty_expiry')}
                     disabled={!!form.r_warranty_months && form.r_warranty_months !== 'custom'} />
            </Field>
            <Field label="Expected life (months)">
              <Input type="number" min="1" value={form.r_life || ''} onChange={set('r_life')} placeholder="Keep current" />
            </Field>
            <Field label="Service every (days)">
              <Input type="number" min="1" value={form.r_service || ''} onChange={set('r_service')} placeholder="Keep current" />
            </Field>
          </div>
          {!replacementReady(form) && (
            <p className="text-body-sm text-warning-text">Enter at least the make, model or serial number of the new unit.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-body-md text-ink-muted shrink-0">{label}</dt>
      <dd className="text-body-md text-ink text-right min-w-0">{value || '—'}</dd>
    </div>
  )
}
