import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, PackageSearch, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Button, ErrorState, Field, Modal, Spinner, StatusPill, Textarea, Widget, toast,
} from '@/components/ui'
import { api, mediaUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { dt, titleCase } from '@/lib/format'

const FACTOR_LABEL = {
  image: 'Image Similarity',
  description: 'Description Match',
  location: 'Location Proximity',
  category: 'Category',
  time: 'Time Window',
}

export default function LostFoundItem() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { isStaff } = useAuth()
  const [claimOpen, setClaimOpen] = useState(false)
  const [proof, setProof] = useState('')

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: ['lf-item', id],
    queryFn: () => api.get(`/lost-found/items/${id}`),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lf-item', id] })
    qc.invalidateQueries({ queryKey: ['lf-dashboard'] })
    qc.invalidateQueries({ queryKey: ['lf-items'] })
  }

  const claim = useMutation({
    mutationFn: () => api.post('/lost-found/claims', { item_id: id, proof_note: proof.trim() }),
    onSuccess: (c) => {
      toast.success(`Claim ${c.reference} submitted for verification.`)
      setClaimOpen(false); setProof(''); invalidate()
    },
    onError: (err) => toast.error(err.detail || 'Could not submit claim'),
  })

  const decideMatch = useMutation({
    mutationFn: ({ matchId, accept }) =>
      api.post(`/lost-found/matches/${matchId}/decide`, { accept }),
    onSuccess: (d) => { toast.success(d.detail); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  if (isLoading) return <Spinner label="Loading item…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const primary = item.attachments.find((a) => a.is_primary) || item.attachments[0]

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/lost-found" className="inline-flex items-center gap-1.5 text-body-md text-ink-muted hover:text-ink mb-2">
            <ArrowLeft size={15} /> Back to registry
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-mono-data text-secondary">{item.reference}</span>
            <span className={`pill ${item.kind === 'lost' ? 'bg-warning-bg text-warning-text' : 'bg-info-bg text-info-text'}`}>
              {titleCase(item.kind)}
            </span>
            <StatusPill status={item.status} />
            {item.matches.length > 0 && (
              <span className="pill bg-ai-bg text-info-text">
                <Sparkles size={12} /> Potential match
              </span>
            )}
          </div>
          <h1 className="text-headline-lg text-ink mt-2">{item.title}</h1>
        </div>

        {item.can_claim && (
          <Button icon={ShieldCheck} onClick={() => setClaimOpen(true)}>This is mine</Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* Item card */}
        <Widget bodyClass="p-0">
          <div className="h-56 bg-surface-sunken grid place-items-center overflow-hidden">
            {primary ? (
              <img src={mediaUrl(primary.url)} alt={item.title} className="w-full h-full object-contain" />
            ) : (
              <PackageSearch size={40} className="text-ink-faint" />
            )}
          </div>
          <div className="p-widget">
            <h2 className="text-headline-md text-ink">{item.title}</h2>
            <dl className="mt-3 space-y-2.5">
              <Row label="Category" value={item.category_name} />
              <Row label="Colour" value={item.colour} />
              <Row label="Brand" value={item.brand} />
              <Row label="Log ID" value={<span className="font-mono text-mono-data">{item.reference}</span>} />
            </dl>
          </div>
        </Widget>

        <div className="lg:col-span-2 space-y-5">
          <Widget title={item.kind === 'found' ? 'Found Information' : 'Loss Information'}>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <p className="text-label-caps uppercase text-ink-muted">Location</p>
                <p className="text-body-md text-ink mt-1">{item.location_summary || '—'}</p>
                {item.zone_code && (
                  <p className="text-body-sm text-ink-faint mt-0.5">
                    Zone: <span className="font-mono">{item.zone_code}</span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-label-caps uppercase text-ink-muted">
                  Date & Time {item.kind === 'found' ? 'Found' : 'Lost'}
                </p>
                <p className="text-body-md text-ink mt-1">{dt(item.occurred_at, 'd MMMM yyyy')}</p>
                <p className="text-body-sm text-ink-faint">{dt(item.occurred_at, 'HH:mm')}</p>
              </div>
            </div>

            {(item.description || item.distinguishing_marks) && (
              <div className="mt-5 pt-5 border-t border-border-subtle">
                <p className="text-label-caps uppercase text-ink-muted">Description / Notes</p>
                {item.description && (
                  <p className="text-body-lg text-ink mt-2 whitespace-pre-wrap">{item.description}</p>
                )}
                {item.distinguishing_marks && (
                  <p className="text-body-md text-ink-muted mt-2">
                    <strong className="text-ink">Distinguishing marks:</strong> {item.distinguishing_marks}
                  </p>
                )}
              </div>
            )}

            {item.holding_location && (
              <div className="mt-4 ai-surface p-3">
                <p className="text-body-md text-ink">
                  <strong>Held at:</strong> {item.holding_location}
                </p>
              </div>
            )}
          </Widget>

          {/* AI Match Analysis */}
          {item.matches.map((m) => (
            <div key={m.id} className="widget border-l-[3px] border-l-primary overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-widget border-b border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary grid place-items-center shrink-0">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-headline-md text-ink">AI Match Analysis</p>
                    <p className="text-body-sm text-ink-faint">
                      Comparing {item.reference} against the opposite ledger
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-display-metrics tabular leading-none">{m.score_pct}%</p>
                  <p className="text-body-sm text-secondary font-medium capitalize">
                    {m.band} confidence match
                  </p>
                </div>
              </div>

              <div className="p-widget grid md:grid-cols-2 gap-6">
                {/* Side-by-side */}
                <div className="flex items-center gap-3">
                  <MatchCard preview={m.found_preview} label="Found Item" />
                  <span className="text-ink-faint shrink-0">↔</span>
                  <MatchCard preview={m.lost_preview} label="Lost Report" />
                </div>

                {/* Factor bars */}
                <div>
                  <p className="text-label-caps uppercase text-ink-muted mb-3">Matching Factors</p>
                  <div className="space-y-2.5">
                    {Object.entries(m.factors).map(([key, value]) => (
                      <div key={key}>
                        <div className="flex justify-between text-body-sm mb-1">
                          <span className="text-ink-muted">{FACTOR_LABEL[key] || key}</span>
                          <span className={`tabular font-medium ${
                            value >= 90 ? 'text-success-text' : value >= 70 ? 'text-secondary' : 'text-ink-muted'
                          }`}>{value}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${value}%`,
                              background: value >= 90 ? '#10b981' : value >= 70 ? '#3b82f6' : '#94a3b8',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {m.reasoning && (
                <p className="px-widget pb-3 text-body-md text-ink-muted">{m.reasoning}</p>
              )}

              {isStaff() && m.status !== 'accepted' && m.status !== 'rejected' && (
                <div className="flex flex-wrap gap-2 justify-end p-widget border-t border-border-subtle">
                  <Button variant="ghost" icon={X} loading={decideMatch.isPending}
                          onClick={() => decideMatch.mutate({ matchId: m.id, accept: false })}>
                    Reject match
                  </Button>
                  <Link to={`/lost-found/items/${item.kind === 'found' ? m.lost_item_id : m.found_item_id}`}
                        className="btn-secondary">View other report</Link>
                  <Button variant="dark" icon={Check} loading={decideMatch.isPending}
                          onClick={() => decideMatch.mutate({ matchId: m.id, accept: true })}>
                    Confirm match
                  </Button>
                </div>
              )}
              {(m.status === 'accepted' || m.status === 'rejected') && (
                <p className="px-widget pb-widget text-body-md text-ink-muted">
                  Match {m.status} by staff.
                </p>
              )}
            </div>
          ))}

          {item.matches.length === 0 && (
            <Widget>
              <p className="text-body-md text-ink-muted text-center py-4">
                No matches yet. Campus Netra re-checks automatically whenever a new
                report arrives on the other side of the ledger.
              </p>
            </Widget>
          )}
        </div>
      </div>

      <Modal
        open={claimOpen} onClose={() => setClaimOpen(false)} title="Claim this item"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClaimOpen(false)}>Cancel</Button>
            <Button loading={claim.isPending} disabled={proof.trim().length < 10}
                    onClick={() => claim.mutate()}>Submit claim</Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted mb-4">
          To protect the real owner, describe something only they would know — a mark,
          a contents detail, or where exactly you lost it. Staff verify before release.
        </p>
        <Field label="Proof of ownership" required
               hint={`${proof.trim().length}/10 characters minimum`}>
          <Textarea value={proof} onChange={(e) => setProof(e.target.value)}
                    placeholder="e.g. There's a blue keychain on the front zip, and a red notebook inside with my name on the first page." />
        </Field>
      </Modal>
    </div>
  )
}

function MatchCard({ preview, label }) {
  if (!preview) return null
  return (
    <div className="flex-1 min-w-0 text-center">
      <div className="h-24 rounded bg-surface-sunken overflow-hidden grid place-items-center mb-1.5">
        {preview.image
          ? <img src={mediaUrl(preview.image)} alt={preview.title} className="w-full h-full object-cover" />
          : <PackageSearch size={20} className="text-ink-faint" />}
      </div>
      <p className="text-body-sm text-ink-muted">{label}</p>
      <p className="font-mono text-[11px] text-secondary truncate">{preview.reference}</p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border-subtle last:border-0">
      <dt className="text-body-md text-ink-muted">{label}</dt>
      <dd className="text-body-md text-ink text-right">{value || '—'}</dd>
    </div>
  )
}
