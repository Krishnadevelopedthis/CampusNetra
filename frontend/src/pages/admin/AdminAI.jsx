import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Metric, Select, Spinner, Widget, toast,
} from '@/components/ui'
import { api } from '@/lib/api'
import { ago } from '@/lib/format'

export default function AdminAI() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('uncertain')

  const perf = useQuery({ queryKey: ['ai-performance'], queryFn: () => api.get('/ai/performance') })
  const queue = useQuery({ queryKey: ['ai-review-queue'], queryFn: () => api.get('/ai/review-queue') })
  const categories = useQuery({
    queryKey: ['issue-categories'], queryFn: () => api.get('/issues/categories'),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ai-review-queue'] })
    qc.invalidateQueries({ queryKey: ['ai-performance'] })
    qc.invalidateQueries({ queryKey: ['issues'] })
  }

  const reclassify = useMutation({
    mutationFn: ({ issueId, categoryId }) =>
      api.post(`/issues/${issueId}/reclassify`, { category_id: categoryId }),
    onSuccess: () => { toast.success('Reclassified — recorded as training signal.'); refresh() },
    onError: (e) => toast.error(e.detail || 'Could not reclassify'),
  })

  const confirmClassification = useMutation({
    // Reclassifying to the same category records the AI as correct.
    mutationFn: ({ issueId, categoryId }) =>
      api.post(`/issues/${issueId}/reclassify`, { category_id: categoryId, reason: 'Confirmed correct' }),
    onSuccess: () => { toast.success('Confirmed.'); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  const mergeDuplicate = useMutation({
    mutationFn: ({ issueId, masterId }) =>
      api.post(`/issues/${issueId}/mark-duplicate`, { master_issue_id: masterId }),
    onSuccess: () => { toast.success('Merged.'); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  const dismissDuplicates = useMutation({
    mutationFn: (issueId) => api.post(`/issues/${issueId}/dismiss-duplicates`),
    onSuccess: (d) => { toast.success(d.detail); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  if (perf.isLoading || queue.isLoading) return <Spinner label="Loading AI activity…" />
  if (perf.error) return <ErrorState error={perf.error} onRetry={perf.refetch} />

  const tasks = perf.data?.tasks || []
  const totalCalls = tasks.reduce((s, t) => s + t.invocations, 0)
  const reviewed = tasks.reduce((s, t) => s + t.human_reviewed, 0)
  const accuracyTask = tasks.find((t) => t.accuracy != null)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Model" value={perf.data?.mode === 'live' ? 'Live' : 'Heuristic'}
                accent={perf.data?.mode === 'live' ? '#10b981' : '#f59e0b'} icon={Sparkles} />
        <Metric label="Decisions made" value={totalCalls} accent="#3b82f6" />
        <Metric label="Awaiting review" value={queue.data?.counts?.uncertain ?? 0}
                accent={(queue.data?.counts?.uncertain ?? 0) > 0 ? '#f59e0b' : '#10b981'} />
        <Metric label="Accuracy"
                value={accuracyTask ? `${Math.round(accuracyTask.accuracy * 100)}%` : '—'}
                accent="#10b981" />
      </div>

      <div className="ai-surface p-widget">
        <p className="text-body-md text-ink">
          {perf.data?.mode === 'live' ? (
            <>Running on <strong>{perf.data.model}</strong>. Every decision is logged, and
              corrections you make below become the accuracy figures above.</>
          ) : (
            <>Running on the <strong>deterministic heuristic</strong> — no API key is configured,
              so nothing leaves this server. Set <code>ANTHROPIC_API_KEY</code> to switch to live
              model calls; the behaviour and this screen are unchanged either way.</>
          )}
        </p>
      </div>

      <Widget title="Performance by task" bodyClass="p-0">
        {tasks.length === 0 ? (
          <p className="text-body-md text-ink-faint text-center py-10">
            No AI activity recorded in this window.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th><th className="text-right">Decisions</th>
                  <th className="text-right">Avg confidence</th><th className="text-right">Latency</th>
                  <th className="text-right">Fallback</th><th className="text-right">Reviewed</th>
                  <th className="text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.task}>
                    <td className="text-ink">{t.task.replace(/_/g, ' ')}</td>
                    <td className="text-right tabular">{t.invocations}</td>
                    <td className="text-right tabular">
                      {t.avg_confidence != null ? `${Math.round(t.avg_confidence * 100)}%` : '—'}
                    </td>
                    <td className="text-right tabular">
                      {t.avg_latency_ms != null ? `${t.avg_latency_ms}ms` : '—'}
                    </td>
                    <td className="text-right tabular">{Math.round(t.fallback_rate * 100)}%</td>
                    <td className="text-right tabular">{t.human_reviewed || '—'}</td>
                    <td className="text-right tabular">
                      {t.accuracy != null ? (
                        <span className={t.accuracy >= 0.8 ? 'text-success-text' : 'text-warning-text'}>
                          {Math.round(t.accuracy * 100)}%
                        </span>
                      ) : <span className="text-ink-faint">unreviewed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>

      <Widget bodyClass="p-0">
        <div className="flex gap-2 p-widget border-b border-border-subtle">
          <div className="flex p-1 bg-surface-sunken rounded-lg">
            {[
              ['uncertain', `Low confidence (${queue.data?.counts?.uncertain ?? 0})`],
              ['duplicates', `Possible duplicates (${queue.data?.counts?.duplicates ?? 0})`],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                      className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                        tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                      }`}>{label}</button>
            ))}
          </div>
        </div>

        {tab === 'uncertain' ? (
          !queue.data?.uncertain?.length ? (
            <EmptyState icon={Check} title="Nothing needs review"
                        description="Every open issue was classified with reasonable confidence." />
          ) : (
            <div className="divide-y divide-border-subtle">
              {queue.data.uncertain.map((u) => (
                <div key={u.id} className="p-widget">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/issues/${u.id}`}
                              className="font-mono text-mono-data text-secondary hover:underline">
                          {u.reference}
                        </Link>
                        <span className={`pill ${
                          u.confidence < 0.5 ? 'bg-danger-bg text-danger-text' : 'bg-warning-bg text-warning-text'
                        }`}>
                          {Math.round((u.confidence || 0) * 100)}% confident
                        </span>
                        <span className="text-body-sm text-ink-faint">{ago(u.created_at)}</span>
                      </div>
                      <p className="text-body-lg text-ink mt-1">{u.title}</p>
                      <p className="text-body-md text-ink-muted mt-0.5 line-clamp-2">{u.description}</p>
                      {u.reasoning && (
                        <p className="text-body-sm text-ink-faint mt-1.5 italic">{u.reasoning}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-body-sm text-ink-muted block">
                          AI chose <strong className="text-ink">{u.ai_category || 'nothing'}</strong>
                        </span>
                        {u.was_rerouted && (
                          <span className="text-body-sm text-ink-muted block">
                            now filed as{' '}
                            <strong className="text-secondary">{u.current_category || 'unclassified'}</strong>
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value="" className="w-auto min-w-[170px] h-9"
                          onChange={(e) => e.target.value &&
                            reclassify.mutate({ issueId: u.id, categoryId: e.target.value })}
                        >
                          <option value="">Reclassify as…</option>
                          {(categories.data || []).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                        <Button
                          size="sm" variant="secondary" icon={ThumbsUp}
                          loading={confirmClassification.isPending}
                          onClick={() => {
                            // Confirm the category actually in effect. Where routing
                            // has already overridden the AI, endorsing its original
                            // pick would file the issue back under the wrong team.
                            const id = u.current_category_id
                              || (categories.data || []).find((c) => c.name === u.ai_category)?.id
                            if (!id) return toast.error('That category no longer exists.')
                            confirmClassification.mutate({ issueId: u.id, categoryId: id })
                          }}
                        >
                          Correct
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          !queue.data?.duplicates?.length ? (
            <EmptyState icon={Copy} title="No duplicate suggestions"
                        description="Nothing currently looks like a repeat of an existing report." />
          ) : (
            <div className="divide-y divide-border-subtle">
              {queue.data.duplicates.map((d) => (
                <div key={d.id} className="p-widget">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`pill ${
                      d.verdict === 'likely' ? 'bg-danger-bg text-danger-text' : 'bg-warning-bg text-warning-text'
                    }`}>
                      {Math.round(d.score * 100)}% {d.verdict}
                    </span>
                    <span className="text-body-sm text-ink-muted">
                      {Object.entries(d.signals)
                        .filter(([k]) => k !== 'time_gate')
                        .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
                        .join(' · ')}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      ['New report', d.issue_reference, d.issue_title, d.issue_id],
                      ['Existing', d.candidate_reference, d.candidate_title, d.candidate_id],
                    ].map(([label, ref, title, id]) => (
                      <div key={label} className="rounded border border-border-subtle p-3">
                        <p className="text-label-caps uppercase text-ink-muted">{label}</p>
                        <Link to={`/issues/${id}`}
                              className="font-mono text-mono-data text-secondary hover:underline">
                          {ref}
                        </Link>
                        <p className="text-body-md text-ink mt-0.5">{title}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 mt-3">
                    <Button size="sm" variant="ghost" icon={X}
                            loading={dismissDuplicates.isPending}
                            onClick={() => dismissDuplicates.mutate(d.issue_id)}>
                      Not a duplicate
                    </Button>
                    <Button size="sm" icon={Copy} loading={mergeDuplicate.isPending}
                            onClick={() => mergeDuplicate.mutate({
                              issueId: d.issue_id, masterId: d.candidate_id })}>
                      Merge into {d.candidate_reference}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Widget>
    </div>
  )
}
