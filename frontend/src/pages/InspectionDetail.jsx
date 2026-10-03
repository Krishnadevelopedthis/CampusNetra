import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CalendarClock, Check, MinusCircle, Play, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button, ErrorState, Field, Input, Modal, Select, Spinner, StatusPill, Textarea, Widget, toast } from '@/components/ui'
import { usePermissions } from '@/lib/permissions'
import AdminDeleteButton from '@/components/AdminDeleteButton'
import { api } from '@/lib/api'
import { dt } from '@/lib/format'

/** The four verdicts a checklist item can carry. */
const CHOICES = [
  { value: 'pass', label: 'Pass', icon: Check,
    on: 'bg-success text-white border-success', off: 'hover:bg-success-bg hover:border-success-border' },
  { value: 'fail', label: 'Fail', icon: X,
    on: 'bg-danger text-white border-danger', off: 'hover:bg-danger-bg hover:border-danger-border' },
  { value: 'needs_attention', label: 'Attention', icon: AlertTriangle,
    on: 'bg-warning text-white border-warning', off: 'hover:bg-warning-bg hover:border-warning-border' },
  { value: 'na', label: 'N/A', icon: MinusCircle,
    on: 'bg-border-strong text-white border-border-strong', off: 'hover:bg-surface-sunken' },
]

export default function InspectionDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [answers, setAnswers] = useState({})
  const [notes, setNotes] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const { perms } = usePermissions()
  const canSchedule = !!perms?.includes('inspections:schedule')

  const { data: insp, isLoading, error, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api.get(`/inspections/${id}`),
  })

  // Assets in the inspected room, to say which one a Fail / Attention is about.
  const roomAssets = useQuery({
    queryKey: ['room-assets', insp?.room_id],
    queryFn: () => api.get(`/campus/rooms/${insp.room_id}/assets`),
    enabled: !!insp?.room_id && !insp?.asset_id,
  })

  // Prefill from an already-submitted inspection so the record is readable.
  useEffect(() => {
    if (!insp?.results?.length) return
    const seeded = {}
    insp.results.forEach((r) => {
      seeded[r.prompt] = { result: r.result, note: r.note || '', asset_id: r.asset_id || '' }
    })
    setAnswers(seeded)
    setNotes(insp.notes || '')
  }, [insp?.results, insp?.notes])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inspection', id] })
    qc.invalidateQueries({ queryKey: ['inspections'] })
    qc.invalidateQueries({ queryKey: ['inspection-dashboard'] })
  }

  const start = useMutation({
    mutationFn: () => api.post(`/inspections/${id}/start`),
    onSuccess: () => { toast.success('Inspection started.'); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  const submit = useMutation({
    mutationFn: () => api.post(`/inspections/${id}/submit`, {
      results: insp.items.map((item) => ({
        item_id: item.id,
        prompt: item.prompt,
        result: answers[item.prompt]?.result,
        asset_id: answers[item.prompt]?.asset_id || null,
        note: answers[item.prompt]?.note || null,
      })),
      notes: notes.trim() || null,
    }),
    onSuccess: (d) => {
      toast.success(d.message)
      if (d.raised_issues?.length) {
        toast.error(`${d.raised_issues.length} critical failure escalated to a live issue.`)
      }
      invalidate()
    },
    onError: (err) => toast.error(err.detail || 'Could not submit'),
  })

  if (isLoading) return <Spinner label="Loading inspection…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  // Answers can be given only once the inspection has been started.
  const editable = insp.status === 'in_progress'
  const notStarted = ['scheduled', 'overdue'].includes(insp.status)
  const answered = insp.items.filter((i) => answers[i.prompt]?.result).length
  const complete = answered === insp.items.length && insp.items.length > 0
  const failedCritical = insp.items.filter(
    (i) => i.is_critical && answers[i.prompt]?.result === 'fail',
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/inspections" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to inspections
          </Link>
          <AdminDeleteButton path={`/inspections/${id}`} queryKey={['inspection', id]} backTo="/inspections" noun="inspection"
            warning="Its checklist results are deleted with it." className="ml-3 mb-2" />
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-mono-data text-secondary">{insp.reference}</span>
            <StatusPill status={insp.status} />
            {insp.is_overdue && <span className="pill bg-danger-bg text-danger-text">Overdue</span>}
          </div>
          <h1 className="text-headline-lg text-ink mt-2">{insp.template_name}</h1>
          <p className="text-body-md text-ink-muted mt-1">
            {insp.room_name}
            {insp.asset_tag && <span className="font-mono ml-1.5">{insp.asset_tag}</span>}
            {' · due '}{dt(insp.scheduled_for)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSchedule && notStarted && (
            <Button variant="secondary" icon={CalendarClock} onClick={() => setRescheduling(true)}>
              Reschedule
            </Button>
          )}
          {insp.status === 'scheduled' || insp.status === 'overdue' ? (
            <Button icon={Play} loading={start.isPending} onClick={() => start.mutate()}>
              Start inspection
            </Button>
          ) : null}
        </div>
      </div>

      {rescheduling && (
        <RescheduleModal insp={insp} onClose={() => setRescheduling(false)} onDone={invalidate} />
      )}

      {/* Escalation warning before they commit */}
      {editable && failedCritical.length > 0 && (
        <div className="widget border-danger-border bg-danger-bg p-widget flex gap-3">
          <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-body-lg font-medium text-danger-text">
              {failedCritical.length} critical check{failedCritical.length > 1 ? 's' : ''} failed
            </p>
            <p className="text-body-md text-ink-muted mt-0.5">
              Submitting will raise a high-priority issue for each and mark the asset as faulty
              on the Digital Twin.
            </p>
          </div>
        </div>
      )}

      {/* Raised issues, once submitted */}
      {insp.raised_issues?.length > 0 && (
        <Widget title="Issues raised from this inspection">
          <div className="space-y-2">
            {insp.raised_issues.map((r) => (
              <Link key={r.id} to={`/issues/${r.id}`}
                    className="flex items-center justify-between gap-3 p-3 rounded border border-border-subtle hover:bg-surface-sunken transition-colors">
                <div className="min-w-0">
                  <span className="font-mono text-mono-data text-secondary">{r.reference}</span>
                  <p className="text-body-md text-ink truncate">{r.title}</p>
                </div>
                <StatusPill status={r.status} />
              </Link>
            ))}
          </div>
        </Widget>
      )}

      <Widget
        title="Checklist"
        subtitle={editable ? `${answered} of ${insp.items.length} answered` : 'Submitted record'}
        action={
          insp.score != null ? (
            <span className={`pill ${insp.score >= 80 ? 'bg-success-bg text-success-text'
              : insp.score >= 60 ? 'bg-warning-bg text-warning-text' : 'bg-danger-bg text-danger-text'}`}>
              Score {insp.score}%
            </span>
          ) : null
        }
      >
        <ol className="space-y-4">
          {insp.items.map((item) => {
            const answer = answers[item.prompt]
            return (
              <li key={item.id} className="pb-4 border-b border-border-subtle last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-surface-sunken text-ink-muted grid place-items-center text-body-sm font-semibold shrink-0 mt-0.5">
                    {item.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-lg text-ink">
                      {item.prompt}
                      {item.is_critical && (
                        <span className="pill bg-danger-bg text-danger-text ml-2 text-body-sm align-middle">
                          Critical
                        </span>
                      )}
                    </p>
                    {item.help_text && (
                      <p className="text-body-sm text-ink-faint mt-0.5">{item.help_text}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                      {CHOICES.map((c) => {
                        const active = answer?.result === c.value
                        return (
                          <button
                            key={c.value} type="button" disabled={!editable}
                            onClick={() => setAnswers((a) => ({
                              ...a, [item.prompt]: { ...a[item.prompt], result: c.value },
                            }))}
                            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-body-md font-medium transition-colors
                                        disabled:opacity-60 disabled:pointer-events-none
                                        ${active ? c.on : `bg-surface border-border-subtle text-ink-muted ${c.off}`}`}
                          >
                            <c.icon size={14} /> {c.label}
                          </button>
                        )
                      })}
                    </div>

                    {(answer?.result === 'fail' || answer?.result === 'needs_attention') && !insp.asset_id
                      && (roomAssets.data?.length || 0) > 0 && (
                      <Select
                        className="mt-2" disabled={!editable} aria-label="Which asset is this about?"
                        value={answer?.asset_id || ''}
                        onChange={(e) => setAnswers((a) => ({
                          ...a, [item.prompt]: { ...a[item.prompt], asset_id: e.target.value },
                        }))}
                      >
                        <option value="">Which asset is this about? (optional)</option>
                        {roomAssets.data.map((as) => <option key={as.id} value={as.id}>{as.name}</option>)}
                      </Select>
                    )}
                    {answer?.result === 'needs_attention' && (
                      <p className="text-body-sm text-warning-text mt-1">
                        {insp.asset_id || answer?.asset_id
                          ? 'This asset will be marked Warning and managers will be told — no complaint is raised.'
                          : 'Managers will be told. Pick the asset to also mark it Warning.'}
                      </p>
                    )}
                    {(answer?.result === 'fail' || answer?.result === 'needs_attention'
                      || answer?.note) && (
                      <Textarea
                        rows={2} className="min-h-0 mt-2" disabled={!editable}
                        value={answer?.note || ''}
                        placeholder="What exactly is wrong? Be specific — this goes into the raised issue."
                        onChange={(e) => setAnswers((a) => ({
                          ...a, [item.prompt]: { ...a[item.prompt], note: e.target.value },
                        }))}
                      />
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </Widget>

      <Widget title="Inspector notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable}
                  placeholder="Overall observations, access problems, anything worth recording." />
      </Widget>

      {editable && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className={`text-body-md ${complete ? 'text-success-text' : 'text-warning-text'}`}>
            {complete ? 'All checks answered — ready to submit.'
              : `${insp.items.length - answered} check${insp.items.length - answered === 1 ? '' : 's'} still unanswered. Answer every check to submit.`}
          </p>
          <Button icon={Send} loading={submit.isPending} disabled={!complete}
                  onClick={() => submit.mutate()}>
            Submit inspection
          </Button>
        </div>
      )}
      {notStarted && (
        <p className="text-body-md text-ink-muted text-right">
          Press <strong>Start inspection</strong> at the top to begin answering the checks.
        </p>
      )}
    </div>
  )
}

/** New time (and optionally a different technician) for a missed or upcoming inspection. */
function RescheduleModal({ insp, onClose, onDone }) {
  const pad = (n) => String(n).padStart(2, '0')
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const tomorrow = new Date(Date.now() + 86_400_000)
  tomorrow.setMinutes(0, 0, 0)
  const [when, setWhen] = useState(local(new Date(insp.scheduled_for) > new Date() ? new Date(insp.scheduled_for) : tomorrow))
  const [tech, setTech] = useState('')

  const categories = useQuery({ queryKey: ['issue-categories'], queryFn: () => api.get('/issues/categories') })
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api.get('/admin/users', { params: { role: 'technician', status: 'active', page_size: 100 } })
      .then((d) => d.items),
    retry: false,
  })
  const code = categories.data?.find((c) => c.id === insp.category_id)?.code
  const eligible = (technicians.data || []).filter((t) => !code || (t.specialization || []).includes(code))

  const save = useMutation({
    mutationFn: () => api.patch(`/inspections/${insp.id}`, {
      scheduled_for: new Date(when).toISOString(), assigned_to: tech || null,
    }),
    onSuccess: (d) => {
      toast.success(`${d.reference} rescheduled to ${dt(d.scheduled_for)}${d.assignee ? ` for ${d.assignee.full_name}` : ''}.`)
      onDone(); onClose()
    },
    onError: (err) => toast.error(err.detail || 'Could not reschedule'),
  })

  return (
    <Modal open onClose={onClose} title={`Reschedule ${insp.reference}`}
           footer={
             <>
               <Button variant="secondary" onClick={onClose}>Cancel</Button>
               <Button loading={save.isPending} disabled={!when || new Date(when) <= new Date()} onClick={() => save.mutate()}>
                 Reschedule
               </Button>
             </>
           }>
      <div className="space-y-4">
        {insp.status === 'overdue' && (
          <p className="text-body-md text-warning-text">This inspection was missed. Pick a new time and it goes back to Scheduled.</p>
        )}
        <Field label="New date and time" required>
          <Input type="datetime-local" value={when} min={local(new Date())} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Technician" hint={insp.category_name ? `People who handle ${insp.category_name}` : undefined}>
          <Select value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">Keep {insp.assignee?.full_name || 'it unassigned'}</option>
            {eligible.filter((t) => t.id !== insp.assignee?.id).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}
