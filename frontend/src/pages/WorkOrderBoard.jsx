import { useQuery } from '@tanstack/react-query'
import { List } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, PageHeader, PriorityPill } from '@/components/ui'
import { useRefresh } from '@/hooks/useRefresh'
import { api } from '@/lib/api'
import { slaLabel } from '@/lib/format'

const COLUMN_ACCENT = {
  open: '#94a3b8', assigned: '#3b82f6', in_progress: '#f59e0b',
  awaiting_parts: '#f59e0b', completed: '#10b981', verified: '#10b981',
}

export default function WorkOrderBoard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['wo-board'],
    queryFn: () => api.get('/work-orders/board'),
  })

  const { refresh, refreshing } = useRefresh(refetch)

  if (error && !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Work Order Board"
        subtitle={data
          ? `${data.total} active job${data.total === 1 ? '' : 's'} across the pipeline.`
          : 'Jobs across the pipeline.'}
        onRefresh={refresh}
        refreshing={refreshing}
        actions={<Link to="/work-orders" className="btn-secondary"><List size={16} /> List view</Link>}
      />

      {isLoading || refreshing ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[300px] shrink-0 widget bg-surface-sunken">
                <div className="px-3 py-2.5 border-b border-border-subtle">
                  <div className="skeleton h-4 w-2/3" />
                </div>
                <div className="p-3 space-y-2">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="skeleton h-20 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {data.columns.map((col) => (
            <div key={col.status} className="w-[300px] shrink-0">
              <div className="widget bg-surface-sunken border-border-subtle">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
                  <span className="flex items-center gap-2 text-label-caps uppercase text-ink-muted">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLUMN_ACCENT[col.status] }} />
                    {col.title}
                  </span>
                  <span className="pill bg-surface text-ink-muted text-body-sm tabular">{col.count}</span>
                </div>

                <div className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-320px)] overflow-y-auto">
                  {col.items.length === 0 ? (
                    <p className="text-body-sm text-ink-faint text-center py-8">Nothing here</p>
                  ) : (
                    col.items.map((w) => {
                      const overdue = w.sla_minutes_remaining != null && w.sla_minutes_remaining < 0
                      return (
                        <Link
                          key={w.id} to={`/work-orders/${w.id}`}
                          className="block bg-surface rounded border border-border-subtle p-3 hover:shadow-level2 transition-shadow"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-secondary">{w.reference}</span>
                            <PriorityPill priority={w.priority} />
                          </div>
                          <p className="text-body-md text-ink mt-1.5 line-clamp-2">{w.title}</p>
                          {w.location_summary && (
                            <p className="font-mono text-[11px] text-ink-faint mt-1">{w.location_summary}</p>
                          )}
                          <div className="flex items-center justify-between mt-2.5 text-body-sm">
                            <span className="text-ink-faint truncate">
                              {w.assignee?.full_name || 'Unassigned'}
                            </span>
                            {w.sla_minutes_remaining != null && (
                              <span className={overdue ? 'text-danger-text font-medium' : 'text-ink-faint'}>
                                {slaLabel(w.sla_minutes_remaining)}
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
