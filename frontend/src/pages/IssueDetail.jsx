import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Copy, MapPin, Sparkles, ThumbsUp, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  Button,
  ErrorState,
  Modal,
  PriorityPill,
  Select,
  Spinner,
  StatusPill,
  Textarea,
  Widget,
  toast,
} from '@/components/ui'
import { api, mediaUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, dt, slaLabel, titleCase } from '@/lib/format'

export default function IssueDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, isStaff } = useAuth()
  const staff = isStaff()

  const [transitionTo, setTransitionTo] = useState(null)
  const [note, setNote] = useState('')

  const { data: issue, isLoading, error, refetch } = useQuery({
    queryKey: ['issue', id],
    queryFn: () => api.get(`/issues/${id}`),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['issue', id] })
    qc.invalidateQueries({ queryKey: ['issues'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const transition = useMutation({
    mutationFn: ({ status, note }) => api.post(`/issues/${id}/transition`, { status, note }),
    onSuccess: (d) => {
      toast.success(`Moved to ${titleCase(d.status)}.`)
      setTransitionTo(null); setNote(''); invalidate()
    },
    onError: (err) => toast.error(err.detail || 'Could not update status'),
  })

  const upvote = useMutation({
    mutationFn: () => api.post(`/issues/${id}/upvote`),
    onSuccess: (d) => { toast.success(d.detail); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  const createWO = useMutation({
    mutationFn: () => api.post('/work-orders', {
      title: issue.title, description: issue.description, issue_id: id,
      room_id: issue.location.room_id, asset_id: issue.location.asset_id,
      priority: issue.priority,
    }),
    onSuccess: (wo) => { toast.success(`${wo.reference} created.`); navigate(`/work-orders/${wo.id}`) },
    onError: (err) => toast.error(err.detail || 'Could not create work order'),
  })

  if (isLoading) return <Spinner label="Loading issue…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const overdue = issue.sla_minutes_remaining != null && issue.sla_minutes_remaining < 0

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/issues" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to issues
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => { navigator.clipboard?.writeText(issue.reference); toast.success('Reference copied') }}
              className="font-mono text-mono-data text-secondary hover:underline inline-flex items-center gap-1"
            >
              {issue.reference} <Copy size={12} />
            </button>
            <StatusPill status={issue.status} />
            <PriorityPill priority={issue.priority} />
            {issue.sla_breached && <span className="pill bg-danger-bg text-danger-text">SLA breached</span>}
          </div>
          <h1 className="text-headline-lg text-ink mt-2">{issue.title}</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Reported {ago(issue.created_at)}
            {issue.reporter && ` by ${issue.reporter.full_name}`}
            {issue.is_anonymous && ' (anonymous)'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!staff && issue.status !== 'closed' && (
            <Button variant="secondary" icon={ThumbsUp} loading={upvote.isPending}
                    onClick={() => upvote.mutate()}>
              Also affected {issue.upvote_count > 0 && `(${issue.upvote_count})`}
            </Button>
          )}
          {staff && !issue.work_order_reference && issue.status !== 'closed' && (
            <Button variant="secondary" icon={Wrench} loading={createWO.isPending}
                    onClick={() => createWO.mutate()}>
              Create work order
            </Button>
          )}
          {staff && issue.allowed_transitions?.length > 0 && (
            <Select
              value="" className="w-auto min-w-[180px]"
              onChange={(e) => e.target.value && setTransitionTo(e.target.value)}
            >
              <option value="">Change status…</option>
              {issue.allowed_transitions.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* Duplicate banners */}
      {issue.duplicate_of_reference && (
        <div className="widget bg-surface-sunken p-widget flex items-center gap-2 text-body-md">
          <Copy size={16} className="text-ink-muted" />
          Merged into <Link to={`/issues/${issue.duplicate_of}`} className="font-mono text-secondary hover:underline">
            {issue.duplicate_of_reference}
          </Link>
        </div>
      )}
      {staff && issue.duplicate_candidates?.length > 0 && (
        <DuplicatePanel issueId={id} candidates={issue.duplicate_candidates} onDone={invalidate} />
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Widget title="Description">
            <p className="text-body-lg text-ink whitespace-pre-wrap">{issue.description}</p>

            {issue.attachments?.length > 0 && (
              <div className="mt-5">
                <p className="text-label-caps uppercase text-ink-muted mb-2">Evidence</p>
                <div className="flex flex-wrap gap-2">
                  {issue.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                       className="block w-28 h-28 rounded overflow-hidden border border-border-subtle hover:opacity-90">
                      <img src={mediaUrl(a.thumb_url || a.url)} alt={a.filename || 'Evidence'}
                           className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Widget>

          <Widget title="Issue Timeline" bodyClass="p-0">
            <ol className="p-widget space-y-0">
              {issue.timeline.map((e, i) => {
                const last = i === issue.timeline.length - 1
                return (
                  <li key={e.id} className="flex gap-3 pb-5 last:pb-0 relative">
                    {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border-subtle" />}
                    <span className="w-8 h-8 rounded-full bg-surface-sunken grid place-items-center shrink-0 z-10 border border-border-subtle">
                      <Check size={14} className="text-ink-muted" />
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-body-md text-ink">
                        {e.from_status
                          ? <>Moved from <strong>{titleCase(e.from_status)}</strong> to <strong>{titleCase(e.to_status)}</strong></>
                          : <strong>{titleCase(e.to_status || 'Updated')}</strong>}
                      </p>
                      {e.note && <p className="text-body-md text-ink-muted mt-0.5">{e.note}</p>}
                      <p className="text-body-sm text-ink-faint mt-1">
                        {e.actor?.full_name || 'System'} · {dt(e.created_at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Widget>
        </div>

        <div className="space-y-5">
          <Widget title={<span className="flex items-center gap-2"><MapPin size={17} className="text-secondary" /> Location</span>}>
            <dl className="space-y-3">
              <Row label="Building" value={issue.location.building_name} />
              <Row label="Floor" value={issue.location.floor_name} />
              <Row label="Room" value={issue.location.room_name
                ? `${issue.location.room_name} (${issue.location.room_code})` : null} />
              {issue.location.zone_id && (
                <Row label="Zone" value={<span className="font-mono text-mono-data">{issue.location.zone_id}</span>} />
              )}
              {issue.location.asset_tag && (
                <Row label="Asset" value={
                  <Link to="/twin" className="text-secondary hover:underline">
                    <span className="font-mono text-mono-data">{issue.location.asset_tag}</span>
                    {' — '}{issue.location.asset_name}
                  </Link>
                } />
              )}
              {issue.location.note && <Row label="Detail" value={issue.location.note} />}
            </dl>
          </Widget>

          {issue.ai && (
            <div className="ai-surface p-widget">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center">
                  <Sparkles size={14} className="text-white" />
                </div>
                <p className="text-body-md font-medium text-ink">AI Classification</p>
              </div>
              <dl className="space-y-2.5 text-body-md">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Category</dt>
                  <dd className="font-medium">{issue.ai.category_name || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Confidence</dt>
                  <dd className="pill bg-info-bg text-info-text">
                    {Math.round((issue.ai.confidence || 0) * 100)}%
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Model</dt>
                  <dd className="font-mono text-[11px] text-ink-muted">{issue.ai.model}</dd>
                </div>
              </dl>
              {issue.ai.reasoning && (
                <p className="text-body-sm text-ink-muted mt-3 pt-3 border-t border-ai-border">
                  {issue.ai.reasoning}
                </p>
              )}
              {issue.ai.was_overridden && (
                <p className="text-body-sm text-warning-text mt-2">Manually reclassified by staff.</p>
              )}
            </div>
          )}

          <Widget title="Assignment">
            <dl className="space-y-3">
              <Row label="Department" value={issue.department_name} />
              <Row label="Technician" value={issue.assignee_name} />
              <Row label="Work order" value={issue.work_order_reference
                ? <span className="font-mono text-mono-data text-secondary">{issue.work_order_reference}</span>
                : null} />
              <Row label="SLA deadline" value={
                issue.sla_due_at ? (
                  <span className={overdue ? 'text-danger-text font-medium' : ''}>
                    {dt(issue.sla_due_at)}
                    <span className="block text-body-sm">{slaLabel(issue.sla_minutes_remaining)}</span>
                  </span>
                ) : null
              } />
            </dl>
          </Widget>
        </div>
      </div>

      {/* Status change modal */}
      <Modal
        open={!!transitionTo} onClose={() => { setTransitionTo(null); setNote('') }}
        title={`Move to ${titleCase(transitionTo || '')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setTransitionTo(null); setNote('') }}>Cancel</Button>
            <Button loading={transition.isPending}
                    onClick={() => transition.mutate({ status: transitionTo, note: note.trim() || null })}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted mb-3">
          This is recorded on the issue timeline and the reporter is notified.
        </p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional) — what was done, or what is blocking it." />
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

function DuplicatePanel({ issueId, candidates, onDone }) {
  const merge = useMutation({
    mutationFn: (masterId) => api.post(`/issues/${issueId}/mark-duplicate`, { master_issue_id: masterId }),
    onSuccess: () => { toast.success('Merged into the original issue.'); onDone() },
    onError: (err) => toast.error(err.detail),
  })
  const dismiss = useMutation({
    mutationFn: () => api.post(`/issues/${issueId}/dismiss-duplicates`),
    onSuccess: (d) => { toast.success(d.detail); onDone() },
  })

  return (
    <div className="widget border-warning-border bg-warning-bg p-widget">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-body-lg font-medium text-warning-text">
            Possible duplicate{candidates.length > 1 ? 's' : ''} detected
          </p>
          <p className="text-body-md text-ink-muted mt-0.5">
            The AI found {candidates.length} similar open issue{candidates.length > 1 ? 's' : ''} nearby.
          </p>
        </div>
        <Button variant="ghost" size="sm" loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Not duplicates
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {candidates.map((c) => (
          <div key={c.issue_id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-surface border border-border-subtle">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link to={`/issues/${c.issue_id}`} className="font-mono text-mono-data text-secondary hover:underline">
                  {c.reference}
                </Link>
                <span className={`pill text-body-sm ${
                  c.verdict === 'likely' ? 'bg-danger-bg text-danger-text' : 'bg-warning-bg text-warning-text'
                }`}>
                  {Math.round(c.score * 100)}% {c.verdict}
                </span>
              </div>
              <p className="text-body-md text-ink truncate mt-0.5">{c.title}</p>
              <p className="text-body-sm text-ink-faint mt-0.5">
                {Object.entries(c.signals)
                  .filter(([k]) => k !== 'time_gate')
                  .map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')}
              </p>
            </div>
            <Button size="sm" variant="secondary" loading={merge.isPending}
                    onClick={() => merge.mutate(c.issue_id)}>
              Merge into this
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
