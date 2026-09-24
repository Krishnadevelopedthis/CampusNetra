import { useQuery } from '@tanstack/react-query'
import {
  Clock, FileText, KeyRound, Mail, Phone, Search as SearchIcon, User as UserIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, PageHeader, Spinner, Widget } from '@/components/ui'
import { api } from '@/lib/api'
import { ago, dt } from '@/lib/format'

// Only meaningful actions get logged in the first place (see
// services/history.py) — this is purely which icon represents each one,
// not a filter on what counts as history.
const ACTION_ICON = {
  'issue.created': FileText,
  'issue.updated': FileText,
  'lostfound.created': SearchIcon,
  'lostfound.claimed': SearchIcon,
  'user.change_email': Mail,
  'user.change_phone': Phone,
  'user.change_name': UserIcon,
  'user.change_password': KeyRound,
}

const ENTITY_ROUTE = {
  issue: (id) => `/issues/${id}`,
  lostfound_item: (id) => `/lost-found/${id}`,
}

export default function History() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.get('/history'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="History"
        subtitle="Your own activity — reports, updates, and account changes."
      />

      {isLoading ? (
        <Spinner label="Loading your history…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data?.entries?.length ? (
        <EmptyState
          icon={Clock} title="Nothing here yet"
          description="Things you do — reporting an issue, claiming a lost item, updating your profile — will show up here."
        />
      ) : (
        <Widget bodyClass="p-0">
          <ul className="divide-y divide-border-subtle">
            {data.entries.map((entry) => {
              const Icon = ACTION_ICON[entry.action] || Clock
              const routeFor = entry.entity_type && ENTITY_ROUTE[entry.entity_type]
              const content = (
                <div className="flex items-center gap-3 p-widget">
                  <span className="w-9 h-9 rounded-full bg-surface-sunken grid place-items-center shrink-0">
                    <Icon size={16} className="text-ink-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-md text-ink truncate">{entry.description}</p>
                    {entry.entity_reference && (
                      <p className="font-mono text-mono-data text-secondary text-body-sm">{entry.entity_reference}</p>
                    )}
                  </div>
                  <span className="text-body-sm text-ink-faint shrink-0" title={dt(entry.created_at)}>
                    {ago(entry.created_at)}
                  </span>
                </div>
              )
              return (
                <li key={entry.id}>
                  {routeFor && entry.entity_id ? (
                    <Link to={routeFor(entry.entity_id)} className="block hover:bg-surface-sunken transition-colors">
                      {content}
                    </Link>
                  ) : content}
                </li>
              )
            })}
          </ul>
        </Widget>
      )}
    </div>
  )
}
