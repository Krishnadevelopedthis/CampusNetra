import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, PackageCheck, PackageSearch, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Field, Metric, Modal, Spinner, StatusPill,
  Textarea, Widget, toast,
} from '@/components/ui'
import { api } from '@/lib/api'
import { ago, dt } from '@/lib/format'

export default function AdminLostFound() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('claims')
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const dashboard = useQuery({
    queryKey: ['lf-dashboard'], queryFn: () => api.get('/lost-found/dashboard'),
  })
  const claims = useQuery({
    queryKey: ['lf-claims-all'], queryFn: () => api.get('/lost-found/claims'),
  })
  const matches = useQuery({
    queryKey: ['lf-matches-review'],
    queryFn: () => api.get('/lost-found/matches', { params: { min_score: 0.5, limit: 50 } }),
    enabled: tab === 'matches',
  })
  const returned = useQuery({
    queryKey: ['lf-returned'],
    queryFn: () => api.get('/lost-found/items', {
      params: { status: ['returned', 'claimed'], open_only: false, page_size: 50 },
    }),
    enabled: tab === 'recovery',
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['lf-claims-all'] })
    qc.invalidateQueries({ queryKey: ['lf-dashboard'] })
    qc.invalidateQueries({ queryKey: ['lf-matches-review'] })
    qc.invalidateQueries({ queryKey: ['lf-returned'] })
  }

  const decide = useMutation({
    mutationFn: ({ id, approve, reason }) =>
      api.post(`/lost-found/claims/${id}/decide`, { approve, reason: reason || null }),
    onSuccess: (d) => { toast.success(d.detail); setRejecting(null); setReason(''); refresh() },
    onError: (e) => toast.error(e.detail || 'Could not record the decision'),
  })

  const collected = useMutation({
    mutationFn: (id) => api.post(`/lost-found/claims/${id}/collected`),
    onSuccess: (d) => { toast.success(d.detail); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  const decideMatch = useMutation({
    mutationFn: ({ id, accept }) => api.post(`/lost-found/matches/${id}/decide`, { accept }),
    onSuccess: (d) => { toast.success(d.detail); refresh() },
    onError: (e) => toast.error(e.detail),
  })

  if (dashboard.isLoading) return <Spinner label="Loading Lost & Found…" />
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />

  const t = dashboard.data.totals
  const pending = (claims.data || []).filter(
    (c) => c.status === 'submitted' || c.status === 'under_review')
  const approved = (claims.data || []).filter((c) => c.status === 'approved')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Lost — open" value={t.lost_open} accent="#f59e0b" />
        <Metric label="Found — unclaimed" value={t.found_open} accent="#3b82f6" />
        <Metric label="Claims to verify" value={t.pending_claims}
                accent={t.pending_claims > 0 ? '#ef4444' : '#10b981'} icon={ShieldCheck} />
        <Metric label="Returned to owners" value={t.returned} accent="#10b981" icon={PackageCheck} />
      </div>

      <Widget bodyClass="p-0">
        <div className="flex gap-2 p-widget border-b border-border-subtle">
          <div className="flex p-1 bg-surface-sunken rounded-lg">
            {[
              ['claims', `Claims (${pending.length})`],
              ['matches', `AI matches (${t.pending_matches})`],
              ['recovery', 'Recovery history'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                      className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                        tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                      }`}>{label}</button>
            ))}
          </div>
        </div>

        {/* ---- Claims awaiting verification ---- */}
        {tab === 'claims' && (
          claims.isLoading ? <Spinner />
            : pending.length === 0 && approved.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No claims to verify"
                          description="When someone claims a found item, their ownership evidence appears here." />
            ) : (
              <div className="divide-y divide-border-subtle">
                {[...pending, ...approved].map((c) => (
                  <div key={c.id} className="p-widget">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-mono-data text-secondary">{c.reference}</span>
                          <StatusPill status={c.status} />
                          <span className="text-body-sm text-ink-faint">{ago(c.created_at)}</span>
                        </div>
                        <p className="text-body-lg text-ink mt-1">
                          <Link to={`/lost-found/items/${c.item_id}`} className="hover:underline">
                            {c.item_title}
                          </Link>
                          <span className="font-mono text-mono-data text-ink-faint ml-2">
                            {c.item_reference}
                          </span>
                        </p>
                        <p className="text-body-md text-ink-muted mt-0.5">
                          Claimed by <strong className="text-ink">{c.claimant?.full_name}</strong>
                        </p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {c.status === 'approved' ? (
                          <Button size="sm" icon={PackageCheck} loading={collected.isPending}
                                  onClick={() => collected.mutate(c.id)}>
                            Mark collected
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" icon={X} className="text-danger-text"
                                    onClick={() => setRejecting(c)}>
                              Reject
                            </Button>
                            <Button size="sm" icon={Check} loading={decide.isPending}
                                    onClick={() => decide.mutate({ id: c.id, approve: true })}>
                              Approve release
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* The evidence is the whole point of the screen. */}
                    <div className="ai-surface p-3 mt-3">
                      <p className="text-label-caps uppercase text-ink-muted mb-1">
                        Ownership evidence
                      </p>
                      <p className="text-body-md text-ink whitespace-pre-wrap">{c.proof_note}</p>
                      {c.proof_urls?.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {c.proof_urls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer"
                               className="w-16 h-16 rounded overflow-hidden border border-border-subtle">
                              <img src={u} alt="Evidence" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {c.rejection_reason && (
                      <p className="text-body-md text-danger-text mt-2">
                        Rejected: {c.rejection_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
        )}

        {/* ---- AI match review ---- */}
        {tab === 'matches' && (
          matches.isLoading ? <Spinner />
            : !matches.data?.length ? (
              <EmptyState icon={Sparkles} title="No matches to review"
                          description="Suggested pairings appear here once both a lost and a found report exist." />
            ) : (
              <div className="divide-y divide-border-subtle">
                {matches.data.map((m) => (
                  <div key={m.id} className="p-widget">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`pill ${
                        m.band === 'high' ? 'bg-success-bg text-success-text'
                        : m.band === 'medium' ? 'bg-warning-bg text-warning-text'
                        : 'bg-slate-100 text-slate-600'}`}>
                        {m.score_pct}% {m.band}
                      </span>
                      <StatusPill status={m.status} />
                      {Object.entries(m.factors).map(([k, v]) => (
                        <span key={k} className="text-body-sm text-ink-muted">
                          {k} <strong className="text-ink tabular">{v}%</strong>
                        </span>
                      ))}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      {[['Lost', m.lost_preview, m.lost_item_id],
                        ['Found', m.found_preview, m.found_item_id]].map(([label, p, id]) => (
                        <Link key={label} to={`/lost-found/items/${id}`}
                              className="flex gap-3 rounded border border-border-subtle p-3 hover:bg-surface-sunken transition-colors">
                          <div className="w-14 h-14 rounded bg-surface-sunken overflow-hidden shrink-0 grid place-items-center">
                            {p?.image ? <img src={p.image} alt="" className="w-full h-full object-cover" />
                              : <PackageSearch size={18} className="text-ink-faint" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-label-caps uppercase text-ink-muted">{label}</p>
                            <p className="text-body-md text-ink truncate">{p?.title}</p>
                            <p className="font-mono text-[11px] text-secondary">{p?.reference}</p>
                          </div>
                        </Link>
                      ))}
                    </div>

                    {m.status !== 'accepted' && m.status !== 'rejected' && (
                      <div className="flex justify-end gap-2 mt-3">
                        <Button size="sm" variant="ghost" icon={X} loading={decideMatch.isPending}
                                onClick={() => decideMatch.mutate({ id: m.id, accept: false })}>
                          Not a match
                        </Button>
                        <Button size="sm" icon={Check} loading={decideMatch.isPending}
                                onClick={() => decideMatch.mutate({ id: m.id, accept: true })}>
                          Confirm match
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
        )}

        {/* ---- Recovery history ---- */}
        {tab === 'recovery' && (
          returned.isLoading ? <Spinner />
            : !returned.data?.items?.length ? (
              <EmptyState icon={PackageCheck} title="Nothing returned yet"
                          description="Items reunited with their owners are listed here." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Reference</th><th>Item</th><th>Category</th>
                        <th>Found at</th><th>Status</th><th>Reported</th></tr>
                  </thead>
                  <tbody>
                    {returned.data.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`/lost-found/items/${i.id}`}
                                className="font-mono text-mono-data text-secondary hover:underline">
                            {i.reference}
                          </Link>
                        </td>
                        <td className="text-ink">{i.title}</td>
                        <td className="text-ink-muted">{i.category_name || '—'}</td>
                        <td className="text-ink-muted max-w-xs truncate">{i.location_summary || '—'}</td>
                        <td><StatusPill status={i.status} /></td>
                        <td className="text-ink-muted whitespace-nowrap">{dt(i.occurred_at, 'd MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </Widget>

      <Modal
        open={!!rejecting} onClose={() => { setRejecting(null); setReason('') }}
        title={`Reject claim ${rejecting?.reference || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRejecting(null); setReason('') }}>
              Cancel
            </Button>
            <Button variant="danger" loading={decide.isPending} disabled={!reason.trim()}
                    onClick={() => decide.mutate({ id: rejecting.id, approve: false, reason: reason.trim() })}>
              Reject claim
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted mb-3">
          The claimant is told why, so be specific. The item returns to the pool for
          others to claim.
        </p>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. The described contents do not match what was handed in." />
        </Field>
      </Modal>
    </div>
  )
}
