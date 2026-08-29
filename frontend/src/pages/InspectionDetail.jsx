import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Check, MinusCircle, Play, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button, ErrorState, Spinner, StatusPill, Textarea, Widget, toast } from '@/components/ui'
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

  const { data: insp, isLoading, error, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api.get(`/inspections/${id}`),
  })

  // Prefill from an already-submitted inspection so the record is readable.
  useEffect(() => {
    if (!insp?.results?.length) return
    const seeded = {}
    insp.results.forEach((r) => {
      seeded[r.prompt] = { result: r.result, note: r.note || '' }
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
        result: answers[item.prompt]?.result || 'na',
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

  const editable = ['scheduled', 'in_progress', 'overdue'].includes(insp.status)
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

        <div className="flex gap-2">
          {insp.status === 'scheduled' || insp.status === 'overdue' ? (
            <Button icon={Play} loading={start.isPending} onClick={() => start.mutate()}>
              Start inspection
            </Button>
          ) : null}
        </div>
      </div>

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
          <p className="text-body-md text-ink-muted">
            {complete ? 'All checks answered.'
              : `${insp.items.length - answered} check${insp.items.length - answered === 1 ? '' : 's'} still unanswered — these will be recorded as N/A.`}
          </p>
          <Button icon={Send} loading={submit.isPending}
                  disabled={answered === 0 || insp.status === 'scheduled'}
                  onClick={() => submit.mutate()}>
            Submit inspection
          </Button>
        </div>
      )}
      {editable && insp.status === 'scheduled' && (
        <p className="text-body-sm text-ink-faint text-right -mt-3">
          Start the inspection before submitting.
        </p>
      )}
    </div>
  )
}
