import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Spinner, StatusPill } from '@/components/ui'
import { api } from '@/lib/api'

// The same statuses the dashboards count as "open".
const OPEN = ['reported', 'triaged', 'assigned', 'in_progress', 'on_hold']

/**
 * Open issues in a room, listed with links.
 *
 * Not every issue points at an asset: one raised by an inspection's critical
 * failure ("No exposed wiring") or reported against the room itself belongs to
 * the whole room. Those can never turn an asset red, so without this list a
 * room's "open issues: 1" had nothing to click or see.
 */
export function RoomIssues({ roomId, count }) {
  const issues = useQuery({
    queryKey: ['room-open-issues', roomId],
    queryFn: () => api.get('/issues', { params: { room_id: roomId, status: OPEN, page_size: 20 } }),
    enabled: !!roomId && count > 0,
  })

  if (!count) return null
  const items = issues.data?.items || []

  return (
    <div id="room-issues" className="mt-5 scroll-mt-24">
      <p className="text-label-caps uppercase text-ink-muted mb-2">Open issues in this room</p>
      {issues.isLoading ? <Spinner label="Loading issues…" /> : (
        <div className="grid gap-1.5 md:grid-cols-2">
          {items.map((i) => (
            <Link key={i.id} to={`/issues/${i.id}`}
                  className="flex items-center justify-between gap-2 p-2 rounded border border-border-subtle hover:bg-surface-sunken transition-colors">
              <div className="min-w-0">
                <p className="font-mono text-mono-data text-secondary">{i.reference}</p>
                <p className="text-body-sm text-ink truncate">{i.title}</p>
                {i.location_summary && (
                  <p className="text-body-xs text-ink-faint truncate">{i.location_summary}</p>
                )}
              </div>
              <StatusPill status={i.status} />
            </Link>
          ))}
          {!items.length && (
            <p className="text-body-sm text-ink-faint">
              {count} open — you can only see issues you reported.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Banner over the 3D room for open issues that no asset marker can show.
 * `roomLevel` = open issues in the room minus those attached to an asset.
 */
export function RoomIssueBanner({ roomLevel }) {
  if (!(roomLevel > 0)) return null
  return (
    <button
      type="button"
      onClick={() => document.getElementById('room-issues')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      className="absolute left-1/2 top-3 z-10 -translate-x-1/2 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2
                 rounded-full border border-danger bg-danger-bg px-3 py-1.5 text-body-sm font-medium text-danger-text
                 shadow-level2 hover:brightness-95"
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span className="truncate">
        {roomLevel} open {roomLevel === 1 ? 'issue' : 'issues'} for this whole room — tap to view
      </span>
    </button>
  )
}
