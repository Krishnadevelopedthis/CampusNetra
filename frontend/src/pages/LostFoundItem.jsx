import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, HandCoins, PackageSearch, ShieldCheck, Sparkles, X, ZoomIn } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Button, ErrorState, Field, Modal, Spinner, StatusPill, Textarea, Widget, toast,
} from '@/components/ui'
import { ImageUpload } from '@/components/ImageUpload'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { dt, titleCase } from '@/lib/format'
import { useAuthedImage } from '@/hooks/useAuthedImage'

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
  const [activeImage, setActiveImage] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [declaration, setDeclaration] = useState('')
  const [proofPhoto, setProofPhoto] = useState([])

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: ['lf-item', id],
    queryFn: () => api.get(`/lost-found/items/${id}`),
  })

  // Whether the current user has an approved claim on this item waiting on
  // their own handover confirmation (#28: the claimant completes this, not
  // staff on their behalf) -- /claims?mine=true already scopes students and
  // teachers to their own claims server-side.
  const { data: myClaims } = useQuery({
    queryKey: ['lf-my-claims'],
    queryFn: () => api.get('/lost-found/claims', { params: { mine: true } }),
  })
  const myApprovedClaim = (myClaims || []).find(
    (c) => c.item_id === id && c.status === 'approved')

  // Fetched only on demand (not automatically) -- each read is a deliberate
  // disclosure the person asked for, and the backend logs it (#26).
  const contact = useQuery({
    queryKey: ['lf-claim-contact', myApprovedClaim?.id],
    queryFn: () => api.get(`/lost-found/claims/${myApprovedClaim.id}/contact`),
    enabled: false,
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

  const confirmHandover = useMutation({
    mutationFn: () => api.post(`/lost-found/claims/${myApprovedClaim.id}/collected`, {
      handover_proof_url: proofPhoto[0]?.url,
      declaration_text: declaration.trim(),
    }),
    onSuccess: (d) => {
      toast.success(d.detail)
      setHandoverOpen(false); setDeclaration(''); setProofPhoto([])
      qc.invalidateQueries({ queryKey: ['lf-my-claims'] })
      invalidate()
    },
    onError: (err) => toast.error(err.detail || 'Could not confirm handover'),
  })

  const decideMatch = useMutation({
    mutationFn: ({ matchId, accept }) =>
      api.post(`/lost-found/matches/${matchId}/decide`, { accept }),
    onSuccess: (d) => { toast.success(d.detail); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  const images = item?.attachments?.length ? item.attachments : []
  const orderedImages = images.length
    ? [...images].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    : []
  const current = orderedImages[activeImage] || orderedImages[0]
  const currentSrc = useAuthedImage(current?.url)

  if (isLoading) return <Spinner label="Loading item…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

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
        {myApprovedClaim && (
          <Button icon={HandCoins} onClick={() => setHandoverOpen(true)}>Confirm handover</Button>
        )}
      </div>

      {myApprovedClaim && (
        <div className="widget border-l-[3px] border-l-success bg-success-bg/40 p-widget">
          <div className="flex items-center gap-3">
            <HandCoins size={18} className="text-success-text shrink-0" />
            <p className="text-body-md text-ink flex-1">
              Your claim on this item was approved. Once you've physically collected it,
              confirm the handover to close it out.
            </p>
            {!contact.data && (
              <Button size="sm" variant="secondary" loading={contact.isFetching}
                      onClick={() => contact.refetch()}>
                Show finder's contact
              </Button>
            )}
          </div>
          {contact.data && (
            <div className="mt-3 pt-3 border-t border-border-subtle text-body-md text-ink">
              <p><span className="text-ink-muted">{contact.data.role_label}:</span> {contact.data.full_name}</p>
              {contact.data.email && <p className="text-ink-muted">{contact.data.email}</p>}
              {contact.data.phone && <p className="text-ink-muted">{contact.data.phone}</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* Item card */}
        <Widget bodyClass="p-0">
          <div className="relative h-56 bg-surface-sunken group">
            {current ? (
              <>
                <img
                  src={currentSrc} alt={item.title}
                  className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => setZoomOpen(true)}
                />
                <button
                  type="button" onClick={() => setZoomOpen(true)}
                  className="absolute top-2 right-2 btn-ghost h-8 w-8 p-0 rounded-lg bg-surface/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Zoom image"
                >
                  <ZoomIn size={16} />
                </button>
                {orderedImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveImage((i) => (i - 1 + orderedImages.length) % orderedImages.length)}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 btn-ghost h-9 w-9 p-0 rounded-full bg-surface/80 backdrop-blur-sm"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveImage((i) => (i + 1) % orderedImages.length)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost h-9 w-9 p-0 rounded-full bg-surface/80 backdrop-blur-sm"
                      aria-label="Next image"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <span className="absolute bottom-2 right-2 pill bg-surface/80 backdrop-blur-sm text-[11px]">
                      {activeImage + 1} / {orderedImages.length}
                    </span>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full grid place-items-center">
                <PackageSearch size={40} className="text-ink-faint" />
              </div>
            )}
          </div>
          {orderedImages.length > 1 && (
            <div className="flex gap-1.5 p-2 overflow-x-auto border-b border-border-subtle">
              {orderedImages.map((img, i) => (
                <button
                  key={img.id || img.url} type="button"
                  onClick={() => setActiveImage(i)}
                  className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                    i === activeImage ? 'border-secondary' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <ThumbImage image={img} />
                </button>
              ))}
            </div>
          )}
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

        <Modal
          open={zoomOpen} onClose={() => setZoomOpen(false)}
          title={item.title} size="xl"
        >
          {current && (
            <div className="relative">
              <img src={currentSrc} alt={item.title} className="w-full max-h-[70vh] object-contain" />
              {orderedImages.length > 1 && (
                <div className="flex items-center justify-center gap-3 mt-3">
                  <Button size="sm" variant="secondary" icon={ChevronLeft}
                          onClick={() => setActiveImage((i) => (i - 1 + orderedImages.length) % orderedImages.length)}>
                    Previous
                  </Button>
                  <span className="text-body-sm text-ink-muted">{activeImage + 1} / {orderedImages.length}</span>
                  <Button size="sm" variant="secondary" icon={ChevronRight}
                          onClick={() => setActiveImage((i) => (i + 1) % orderedImages.length)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </Modal>

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

      <Modal
        open={handoverOpen} onClose={() => setHandoverOpen(false)} title="Confirm handover"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHandoverOpen(false)}>Cancel</Button>
            <Button
              loading={confirmHandover.isPending}
              disabled={declaration.trim().length < 10 || proofPhoto.length === 0}
              onClick={() => confirmHandover.mutate()}
            >
              Confirm and close claim
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted mb-4">
          Add a photo of the item now in your possession, and a short declaration.
          This closes the claim as returned — only you can confirm this step.
        </p>
        <Field label="Photo proof" required>
          <ImageUpload value={proofPhoto} onChange={setProofPhoto} max={1} purpose="lost_found"
                       hint="A quick photo of the item with you is enough." />
        </Field>
        <Field label="Declaration" required className="mt-4"
               hint={`${declaration.trim().length}/10 characters minimum`}>
          <Textarea value={declaration} onChange={(e) => setDeclaration(e.target.value)}
                    placeholder="I confirm I have received this item from the registered founder and it matches my report." />
        </Field>
      </Modal>
    </div>
  )
}

function MatchCard({ preview, label }) {
  const src = useAuthedImage(preview?.image)
  if (!preview) return null
  return (
    <div className="flex-1 min-w-0 text-center">
      <div className="h-24 rounded bg-surface-sunken overflow-hidden grid place-items-center mb-1.5">
        {src
          ? <img src={src} alt={preview.title} className="w-full h-full object-cover" />
          : <PackageSearch size={20} className="text-ink-faint" />}
      </div>
      <p className="text-body-sm text-ink-muted">{label}</p>
      <p className="font-mono text-[11px] text-secondary truncate">{preview.reference}</p>
    </div>
  )
}

function ThumbImage({ image }) {
  const src = useAuthedImage(image.thumb_url || image.url)
  return src ? <img src={src} alt="" className="w-full h-full object-cover" /> : null
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border-subtle last:border-0">
      <dt className="text-body-md text-ink-muted">{label}</dt>
      <dd className="text-body-md text-ink text-right">{value || '—'}</dd>
    </div>
  )
}
