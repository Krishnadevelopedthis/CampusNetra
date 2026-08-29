import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, Package, Search, ShieldOff, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Metric, PageHeader, Select, SkeletonRows, Widget,
} from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { TWIN_STATE, ago, dt } from '@/lib/format'

const STATES = Object.keys(TWIN_STATE)

export default function AssetList() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [needsAttention, setNeedsAttention] = useState(false)
  const [sort, setSort] = useState('state')

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })
  const categories = useQuery({
    queryKey: ['asset-categories'], queryFn: () => api.get('/campus/asset-categories'),
  })

  const params = {
    page, page_size: 25, sort,
    q: q || undefined,
    state: state || undefined,
    building_id: buildingId || undefined,
    category_id: categoryId || undefined,
    needs_attention: needsAttention || undefined,
  }
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['assets', params],
    queryFn: () => api.get('/campus/assets', { params }),
    keepPreviousData: true,
  })

  // Counts for the tiles come from the unfiltered set, so they stay stable
  // while you narrow the table below.
  const totals = useQuery({
    queryKey: ['asset-totals'],
    queryFn: () => api.get('/campus/assets', { params: { page_size: 100 } }),
  })
  const summary = totals.data?.items || []

  const clear = () => {
    setQ(''); setState(''); setBuildingId(''); setCategoryId('')
    setNeedsAttention(false); setPage(1)
  }
  const filtered = q || state || buildingId || categoryId || needsAttention
  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  const { refresh, refreshing } = useRefresh(refetch, totals.refetch)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Registry"
        subtitle="Every tracked asset across the campus, with live condition."
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Total assets" value={totals.data?.total ?? '—'} accent="rgb(var(--c-brand))" icon={Boxes} />
        <Metric label="Need attention" icon={AlertTriangle}
                value={summary.filter((a) => a.state !== 'healthy').length}
                accent={summary.some((a) => a.state !== 'healthy') ? '#f59e0b' : '#10b981'} />
        <Metric label="In fault" value={summary.filter((a) => a.state === 'fault').length}
                accent="#ef4444" />
        <Metric label="Out of warranty" icon={ShieldOff}
                value={summary.filter((a) => a.warranty_expired).length} accent="#64748b" />
      </div>

      <Widget bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input className="input pl-9" placeholder="Search tag, name, model or serial…"
                   value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          </div>

          <Select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setPage(1) }}
                  className="w-auto min-w-[160px]">
            <option value="">All buildings</option>
            {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>

          <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}
                  className="w-auto min-w-[150px]">
            <option value="">All categories</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          <Select value={state} onChange={(e) => { setState(e.target.value); setPage(1) }}
                  className="w-auto min-w-[160px]">
            <option value="">Any condition</option>
            {STATES.map((s) => <option key={s} value={s}>{TWIN_STATE[s].label}</option>)}
          </Select>

          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[140px]">
            <option value="state">Worst first</option>
            <option value="tag">Asset tag</option>
            <option value="name">Name</option>
            <option value="room">Location</option>
            <option value="warranty">Warranty</option>
          </Select>

          <button
            onClick={() => { setNeedsAttention((v) => !v); setPage(1) }}
            className={`pill h-10 px-3 border transition-colors ${
              needsAttention
                ? 'bg-warning-bg border-warning-border text-warning-text'
                : 'bg-surface border-border-subtle text-ink-muted hover:bg-surface-sunken'
            }`}
          >
            <AlertTriangle size={13} /> Needs attention
          </button>

          {filtered && <Button variant="ghost" size="sm" icon={X} onClick={clear}>Clear</Button>}
        </div>

        {isLoading || refreshing ? <SkeletonRows rows={8} cols={6} />
          : error ? <ErrorState error={error} onRetry={refetch} />
          : data.items.length === 0 ? (
            <EmptyState icon={Package} title="No assets match"
                        description={filtered ? 'Try widening the filters.' : 'Assets appear here once an administrator adds them.'}
                        action={filtered ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : null} />
          ) : (
            <>
              <div className={`table-wrap ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th><th>Category</th><th>Location</th><th>Condition</th>
                      <th className="text-right">Open issues</th><th>Warranty</th>
                      <th>Last service</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <p className="font-mono text-mono-data text-secondary">{a.tag}</p>
                          <p className="text-body-sm text-ink-muted truncate max-w-[220px]">{a.name}</p>
                        </td>
                        <td className="text-ink-muted whitespace-nowrap">{a.category || '—'}</td>
                        <td className="whitespace-nowrap">
                          <span className="text-ink">{a.room || '—'}</span>
                          {a.building && (
                            <span className="text-body-sm text-ink-faint block">{a.building}</span>
                          )}
                        </td>
                        <td>
                          <span className="pill" style={{ background: `${a.colour}1a`, color: a.colour }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.colour }} />
                            {a.state_label}
                          </span>
                        </td>
                        <td className={`text-right tabular ${a.open_issues > 0 ? 'text-danger-text font-medium' : 'text-ink-faint'}`}>
                          {a.open_issues || '—'}
                        </td>
                        <td className="whitespace-nowrap">
                          {a.warranty_expiry ? (
                            <span className={a.warranty_expired ? 'text-danger-text' : 'text-ink-muted'}>
                              {a.warranty_expired ? 'Expired' : dt(a.warranty_expiry, 'MMM yyyy')}
                            </span>
                          ) : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="text-ink-muted whitespace-nowrap">
                          {a.last_service_at ? ago(a.last_service_at) : 'Never'}
                        </td>
                        <td>
                          <Link to={`/assets/${a.id}`} className="btn-ghost btn-sm">Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 p-widget border-t border-border-subtle">
                  <p className="text-body-sm text-ink-muted">
                    {(data.page - 1) * data.page_size + 1}–
                    {Math.min(data.page * data.page_size, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
      </Widget>
    </div>
  )
}
