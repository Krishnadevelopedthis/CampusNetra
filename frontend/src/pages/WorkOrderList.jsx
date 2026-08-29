import { useQuery } from '@tanstack/react-query'
import { ArrowRight, LayoutGrid, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PriorityPill,
  Select,
  SkeletonRows,
  StatusPill,
  Widget,
} from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { money, slaLabel } from '@/lib/format'

export default function WorkOrderList() {
  const { user } = useAuth()
  const isTech = user?.role === 'technician'
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('sla')

  const params = { page, page_size: 20, sort, q: q || undefined, status: status || undefined }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['work-orders', params],
    queryFn: () => api.get('/work-orders', { params }),
    keepPreviousData: true,
  })

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  const { refresh, refreshing } = useRefresh(refetch)

  return (
    <div className="space-y-5">
      <PageHeader
        title={isTech ? 'My Work Orders' : 'Work Orders'}
        subtitle={isTech
          ? 'Jobs assigned to you, most urgent first.'
          : 'Every maintenance job across the campus.'}
        onRefresh={refresh}
        refreshing={refreshing}
        actions={
          <Link to="/work-orders/board" className="btn-secondary">
            <LayoutGrid size={16} /> Board view
          </Link>
        }
      />

      <Widget bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input className="input pl-9" placeholder="Search title or reference…"
                   value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-auto min-w-[150px]">
            <option value="">All statuses</option>
            {['open', 'assigned', 'accepted', 'in_progress', 'awaiting_parts', 'on_hold',
              'completed', 'verified', 'closed'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[150px]">
            <option value="sla">SLA deadline</option>
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </Select>
        </div>

        {isLoading || refreshing ? <SkeletonRows rows={8} cols={7} />
          : error ? <ErrorState error={error} onRetry={refetch} />
          : data.items.length === 0 ? (
            <EmptyState icon={Wrench} title="No work orders"
                        description={isTech ? 'Nothing is assigned to you right now.' : 'Work orders will appear here once created.'} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th><th>Task</th><th>Location</th><th>Priority</th>
                      <th>Status</th>{!isTech && <th>Technician</th>}<th>SLA</th><th>Cost</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((w) => (
                      <tr key={w.id}>
                        <td className="font-mono text-mono-data text-secondary whitespace-nowrap">{w.reference}</td>
                        <td className="max-w-xs">
                          <p className="text-ink truncate">{w.title}</p>
                          {w.issue_reference && (
                            <p className="font-mono text-[11px] text-ink-faint">from {w.issue_reference}</p>
                          )}
                        </td>
                        <td className="font-mono text-[11px] text-ink-muted whitespace-nowrap">
                          {w.location_summary || '—'}
                        </td>
                        <td><PriorityPill priority={w.priority} /></td>
                        <td><StatusPill status={w.status} /></td>
                        {!isTech && (
                          <td>
                            {w.assignee ? (
                              <span className="flex items-center gap-2">
                                <Avatar name={w.assignee.full_name} size={24} />
                                <span className="text-ink-muted truncate">{w.assignee.full_name}</span>
                              </span>
                            ) : <span className="text-ink-faint">Unassigned</span>}
                          </td>
                        )}
                        <td className="whitespace-nowrap">
                          {w.sla_minutes_remaining == null ? <span className="text-ink-faint">—</span> : (
                            <span className={`text-body-sm font-medium ${
                              w.sla_breached || w.sla_minutes_remaining < 0 ? 'text-danger-text' : 'text-ink-muted'
                            }`}>{slaLabel(w.sla_minutes_remaining)}</span>
                          )}
                        </td>
                        <td className="tabular text-ink-muted whitespace-nowrap">
                          {w.total_cost > 0 ? money(w.total_cost) : '—'}
                        </td>
                        <td>
                          <Link to={`/work-orders/${w.id}`} className="btn-ghost btn-sm"><ArrowRight size={14} /></Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 p-widget border-t border-border-subtle">
                  <p className="text-body-sm text-ink-muted">
                    {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
      </Widget>
    </div>
  )
}
