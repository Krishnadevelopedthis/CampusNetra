import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, MessageSquare, Package, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Avatar, Button, ErrorState, Field, Input, Modal, PriorityPill, Select, Spinner,
  StatusPill, Textarea, Widget, toast,
} from '@/components/ui'
import { api, mediaUrl } from '@/lib/api'
import { ago, dt, money, slaLabel, titleCase } from '@/lib/format'

export default function WorkOrderDetail() {
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['work-order', id] })
    qc.invalidateQueries({ queryKey: ['work-orders'] })
    qc.invalidateQueries({ queryKey: ['wo-board'] })
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

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/work-orders" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to work orders
          </Link>
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
          <Button variant="secondary" icon={Package} onClick={() => setPartsOpen(true)}>Request parts</Button>
          {wo.allowed_transitions?.length > 0 && (
            <Select value="" className="w-auto min-w-[180px]"
                    onChange={(e) => e.target.value && setTransitionTo(e.target.value)}>
              <option value="">Update status…</option>
              {wo.allowed_transitions.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          )}
        </div>
      </div>

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
              {[['Before', wo.before_photos], ['After', wo.after_photos]].map(([label, photos]) => (
                <div key={label}>
                  <p className="text-label-caps uppercase text-ink-muted mb-2">{label}</p>
                  {photos.length === 0 ? (
                    <div className="h-28 rounded border border-dashed border-border grid place-items-center text-body-sm text-ink-faint">
                      No {label.toLowerCase()} photo
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p) => (
                        <a key={p.id} href={p.url} target="_blank" rel="noreferrer"
                           className="w-24 h-24 rounded overflow-hidden border border-border-subtle">
                          <img src={mediaUrl(p.thumb_url || p.url)} alt={label} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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
              <Row label="Department" value={wo.department_name} />
              <Row label="Technician" value={wo.assignee?.full_name} />
              <Row label="Source issue" value={wo.issue_reference && <span className="font-mono text-mono-data text-secondary">{wo.issue_reference}</span>} />
              <Row label="SLA" value={wo.sla_minutes_remaining != null && (
                <span className={wo.sla_minutes_remaining < 0 ? 'text-danger-text font-medium' : ''}>
                  {slaLabel(wo.sla_minutes_remaining)}
                </span>
              )} />
              <Row label="Started" value={wo.started_at && dt(wo.started_at)} />
              <Row label="Completed" value={wo.completed_at && dt(wo.completed_at)} />
              <Row label="Time taken" value={wo.actual_mins ? `${wo.actual_mins} min` : null} />
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
                    <StatusPill status={p.status} />
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
            <Button loading={transition.isPending} onClick={() => transition.mutate({
              status: transitionTo,
              note: form.note?.trim() || null,
              resolution_note: form.resolution_note?.trim() || null,
              actual_mins: form.actual_mins ? Number(form.actual_mins) : null,
              labour_cost: form.labour_cost ? Number(form.labour_cost) : null,
              parts_cost: form.parts_cost ? Number(form.parts_cost) : null,
              blocked_reason: form.blocked_reason?.trim() || null,
            })}>Confirm</Button>
          </>
        }
      >
        <div className="space-y-4">
          {completing && (
            <>
              <Field label="What did you do?" required>
                <Textarea value={form.resolution_note || ''}
                          onChange={(e) => setForm((f) => ({ ...f, resolution_note: e.target.value }))}
                          placeholder="Describe the repair, parts used, and anything to watch." />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Minutes">
                  <Input type="number" min="0" value={form.actual_mins || ''}
                         onChange={(e) => setForm((f) => ({ ...f, actual_mins: e.target.value }))} />
                </Field>
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

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-body-md text-ink-muted shrink-0">{label}</dt>
      <dd className="text-body-md text-ink text-right min-w-0">{value || '—'}</dd>
    </div>
  )
}
