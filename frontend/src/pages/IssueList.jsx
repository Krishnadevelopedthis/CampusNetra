import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardList, Filter, PlusCircle, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, PageHeader, PriorityPill, Select, SkeletonRows,
  StatusPill, Widget,
} from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, slaLabel } from '@/lib/format'

const STATUSES = ['reported', 'triaged', 'assigned', 'in_progress', 'on_hold',
                  'resolved', 'verified', 'closed', 'rejected', 'duplicate']
const PRIORITIES = ['critical', 'high', 'medium', 'low']

export default function IssueList() {
  const { user } = useAuth()
  const isReporter = ['student', 'teacher'].includes(user?.role)

  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState('newest')
  const [breachedOnly, setBreachedOnly] = useState(false)

  const params = {
    page, page_size: 20, sort,
    q: q || undefined,
    status: status || undefined,
    priority: priority || undefined,
    breached: breachedOnly || undefined,
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['issues', params],
    queryFn: () => api.get('/issues', { params }),
    keepPreviousData: true,
  })

  const { refresh, refreshing } = useRefresh(refetch)

  const clearFilters = () => {
    setQ(''); setStatus(''); setPriority(''); setBreachedOnly(false); setPage(1)
  }
  const hasFilters = q || status || priority || breachedOnly
  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title={isReporter ? 'Track Complaints' : 'All Issues'}
        subtitle={isReporter
          ? 'Every issue you have reported, with live status.'
          : 'Every reported issue across the campus.'}
        onRefresh={refresh}
        refreshing={refreshing}
        actions={
          <Link to="/issues/new" className="btn-dark">
            <PlusCircle size={16} /> Report an Issue
          </Link>
        }
      />

      <Widget bodyClass="p-0">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              className="input pl-9" placeholder="Search title or reference…"
              value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }}
            />
          </div>

          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-auto min-w-[150px]">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </Select>

          <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }} className="w-auto min-w-[140px]">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>

          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[140px]">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="sla">SLA deadline</option>
          </Select>

          {!isReporter && (
            <button
              onClick={() => { setBreachedOnly((b) => !b); setPage(1) }}
              className={`pill h-10 px-3 border transition-colors ${
                breachedOnly
                  ? 'bg-danger-bg border-danger-border text-danger-text'
                  : 'bg-surface border-border-subtle text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              <Filter size={13} /> SLA breached
            </button>
          )}

          {hasFilters && (
            <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>
          )}
        </div>

        {isLoading || refreshing ? (
          <SkeletonRows rows={8} cols={isReporter ? 5 : 6} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilters ? 'No issues match those filters' : 'No issues yet'}
            description={hasFilters
              ? 'Try widening your search.'
              : 'When issues are reported they will appear here.'}
            action={hasFilters
              ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
              : <Link to="/issues/new" className="btn-primary">Report an Issue</Link>}
          />
        ) : (
          <>
            <div className={`table-wrap ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Issue</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    {!isReporter && <th>Assigned</th>}
                    <th>SLA</th>
                    <th>Reported</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-mono-data text-secondary whitespace-nowrap">
                        {i.reference}
                      </td>
                      <td className="max-w-xs">
                        <p className="text-ink truncate">{i.title}</p>
                        {i.location_summary && (
                          <p className="font-mono text-[11px] text-ink-faint truncate">{i.location_summary}</p>
                        )}
                      </td>
                      <td className="text-ink-muted whitespace-nowrap">{i.category_name || '—'}</td>
                      <td><PriorityPill priority={i.priority} /></td>
                      <td><StatusPill status={i.status} /></td>
                      {!isReporter && (
                        <td className="text-ink-muted whitespace-nowrap">{i.assignee_name || '—'}</td>
                      )}
                      <td className="whitespace-nowrap">
                        {i.sla_minutes_remaining == null ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <span className={`text-body-sm font-medium ${
                            i.sla_breached || i.sla_minutes_remaining < 0
                              ? 'text-danger-text' : 'text-ink-muted'
                          }`}>
                            {slaLabel(i.sla_minutes_remaining)}
                          </span>
                        )}
                      </td>
                      <td className="text-ink-muted whitespace-nowrap">{ago(i.created_at)}</td>
                      <td>
                        <Link to={`/issues/${i.id}`} className="btn-ghost btn-sm" aria-label="Open issue">
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 p-widget border-t border-border-subtle">
                <p className="text-body-sm text-ink-muted">
                  Showing {(data.page - 1) * data.page_size + 1}–
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
