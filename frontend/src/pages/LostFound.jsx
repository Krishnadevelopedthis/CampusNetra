import { useQuery } from '@tanstack/react-query'
import { PackageSearch, PlusCircle, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  EmptyState, ErrorState, Metric, Select, SkeletonRows, Spinner, StatusPill, Widget,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, dt } from '@/lib/format'

export default function LostFound() {
  const { isStaff } = useAuth()
  const [tab, setTab] = useState('found')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const categories = useQuery({
    queryKey: ['lf-categories'], queryFn: () => api.get('/lost-found/categories'),
  })
  const dashboard = useQuery({
    queryKey: ['lf-dashboard'], queryFn: () => api.get('/lost-found/dashboard'),
  })

  const params = {
    kind: tab === 'mine' ? undefined : tab,
    mine: tab === 'mine' || undefined,
    q: q || undefined,
    category_id: categoryId || undefined,
    page_size: 24,
  }
  const items = useQuery({
    queryKey: ['lf-items', params],
    queryFn: () => api.get('/lost-found/items', { params }),
    keepPreviousData: true,
  })

  const t = dashboard.data?.totals

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">Lost & Found</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Report items and let AI match them against the other side of the ledger.
          </p>
        </div>
        <Link to="/lost-found/report" className="btn-dark">
          <PlusCircle size={16} /> Report an item
        </Link>
      </header>

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Lost — open" value={t.lost_open} accent="#f59e0b" />
          <Metric label="Found — unclaimed" value={t.found_open} accent="#3b82f6" />
          <Metric label="Returned to owner" value={t.returned} accent="#10b981" />
          <Metric label="AI matches pending" value={t.pending_matches} accent="#8b5cf6" />
        </div>
      )}

      {/* Staff match review queue */}
      {isStaff() && dashboard.data?.pending_matches?.length > 0 && (
        <Widget
          title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-secondary" /> AI Match Suggestions</span>}
          subtitle="Review before notifying either party"
        >
          <div className="space-y-2">
            {dashboard.data.pending_matches.map((m) => (
              <Link
                key={m.id} to={`/lost-found/items/${m.found_item_id}`}
                className="flex flex-wrap items-center gap-4 p-3 rounded border border-border-subtle hover:bg-surface-sunken transition-colors"
              >
                <span className={`pill shrink-0 ${
                  m.band === 'high' ? 'bg-success-bg text-success-text'
                  : m.band === 'medium' ? 'bg-warning-bg text-warning-text'
                  : 'bg-slate-100 text-slate-600'
                }`}>{m.score_pct}% {m.band}</span>

                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Preview item={m.lost_preview} label="Lost" />
                  <span className="text-ink-faint shrink-0">↔</span>
                  <Preview item={m.found_preview} label="Found" />
                </div>

                <div className="flex gap-3 text-body-sm text-ink-muted shrink-0">
                  {Object.entries(m.factors).map(([k, v]) => (
                    <span key={k} className="text-center">
                      <span className="block tabular font-medium text-ink">{v}%</span>
                      <span className="capitalize">{k}</span>
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </Widget>
      )}

      <Widget bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="flex p-1 bg-surface-sunken rounded-lg">
            {[['found', 'Found items'], ['lost', 'Lost items'], ['mine', 'My reports']].map(([k, label]) => (
              <button
                key={k} onClick={() => setTab(k)}
                className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                  tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                }`}
              >{label}</button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input className="input pl-9" placeholder="Search by name, brand or reference…"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-auto min-w-[160px]">
            <option value="">All categories</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        {items.isLoading ? <SkeletonRows rows={4} cols={4} />
          : items.error ? <ErrorState error={items.error} onRetry={items.refetch} />
          : items.data.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={tab === 'mine' ? "You haven't reported anything yet" : `No ${tab} items`}
              description="Reporting an item starts AI matching against the other side of the ledger immediately."
              action={<Link to="/lost-found/report" className="btn-primary">Report an item</Link>}
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-widget">
              {items.data.items.map((i) => (
                <Link
                  key={i.id} to={`/lost-found/items/${i.id}`}
                  className="widget overflow-hidden hover:shadow-level2 transition-shadow group"
                >
                  <div className="h-36 bg-surface-sunken grid place-items-center overflow-hidden">
                    {i.primary_image ? (
                      <img src={i.primary_image} alt={i.title}
                           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    ) : (
                      <PackageSearch size={28} className="text-ink-faint" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-secondary">{i.reference}</span>
                      <StatusPill status={i.status} />
                    </div>
                    <p className="text-body-lg font-medium text-ink mt-1 truncate">{i.title}</p>
                    <p className="text-body-sm text-ink-muted truncate">
                      {[i.colour, i.brand, i.category_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {i.location_summary && (
                      <p className="text-body-sm text-ink-faint truncate mt-0.5">{i.location_summary}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
                      <span className="text-body-sm text-ink-faint">{ago(i.occurred_at)}</span>
                      {i.best_match_score != null && (
                        <span className="pill bg-ai-bg text-info-text text-body-sm">
                          <Sparkles size={11} /> {i.best_match_score}%
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
      </Widget>
    </div>
  )
}

function Preview({ item, label }) {
  if (!item) return null
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-10 h-10 rounded bg-surface-sunken overflow-hidden shrink-0 grid place-items-center">
        {item.image
          ? <img src={item.image} alt="" className="w-full h-full object-cover" />
          : <PackageSearch size={16} className="text-ink-faint" />}
      </div>
      <div className="min-w-0">
        <p className="text-body-sm text-ink-faint">{label}</p>
        <p className="text-body-md text-ink truncate">{item.title}</p>
      </div>
    </div>
  )
}
