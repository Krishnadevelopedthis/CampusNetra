import { useQuery } from '@tanstack/react-query'
import { Activity, Database, Server, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, Metric, Spinner, Widget } from '@/components/ui'
import { api } from '@/lib/api'

export default function AdminOverview() {
  const health = useQuery({
    queryKey: ['system-health'],
    // /health sits outside the versioned API, so call it directly from the backend.
    queryFn: () => fetch('https://campusnetra.onrender.com/health').then((r) => r.json()),
    refetchInterval: 30_000,
  })
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard') })
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api.get('/admin/roles') })
  const ai = useQuery({ queryKey: ['ai-performance'], queryFn: () => api.get('/ai/performance') })

  if (dashboard.isLoading) return <Spinner label="Loading system overview…" />
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />

  const totalUsers = (roles.data || []).reduce((s, r) => s + r.user_count, 0)
  const h = health.data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Total users" value={totalUsers} accent="#1e1b4b" icon={Users} />
        <Metric label="Open issues" value={dashboard.data.metrics[0]?.value ?? 0} accent="#f59e0b" />
        <Metric label="Asset health" value={`${dashboard.data.health_score}%`}
                accent={dashboard.data.health_score >= 90 ? '#10b981' : '#f59e0b'} />
        <Metric label="SLA breaches" value={dashboard.data.sla_breaches}
                accent={dashboard.data.sla_breaches > 0 ? '#ef4444' : '#10b981'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Widget title={<span className="flex items-center gap-2"><Server size={17} /> System Health</span>}>
          {health.isLoading ? <Spinner /> : (
            <dl className="space-y-3">
              <HealthRow label="API" ok={h?.status === 'ok'}
                         value={h?.status === 'ok' ? 'Operational' : 'Degraded'} />
              <HealthRow label="Database" ok={h?.database === 'up'}
                         value={h?.database === 'up' ? 'Connected' : 'Unreachable'} icon={Database} />
              <HealthRow label="AI services" ok
                         value={h?.ai === 'live' ? 'Live model' : 'Heuristic fallback'} icon={Sparkles} />
              <div className="flex justify-between pt-3 border-t border-border-subtle">
                <dt className="text-body-md text-ink-muted">Environment</dt>
                <dd className="font-mono text-mono-data">{h?.environment} · v{h?.version}</dd>
              </div>
            </dl>
          )}
        </Widget>

        <Widget title={<span className="flex items-center gap-2"><Sparkles size={17} /> AI Activity</span>}
                subtitle={ai.data ? `Last ${ai.data.window_days} days · ${ai.data.model}` : undefined}
                bodyClass="p-0">
          {ai.isLoading ? <Spinner />
            : !ai.data?.tasks?.length ? (
              <p className="text-body-md text-ink-faint text-center py-10">
                No AI activity recorded yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Task</th><th className="text-right">Calls</th>
                      <th className="text-right">Confidence</th><th className="text-right">Fallback</th>
                      <th className="text-right">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.data.tasks.map((t) => (
                      <tr key={t.task}>
                        <td className="text-ink">{t.task.replace(/_/g, ' ')}</td>
                        <td className="text-right tabular">{t.invocations}</td>
                        <td className="text-right tabular">
                          {t.avg_confidence != null ? `${Math.round(t.avg_confidence * 100)}%` : '—'}
                        </td>
                        <td className="text-right tabular">{Math.round(t.fallback_rate * 100)}%</td>
                        <td className="text-right tabular">
                          {t.accuracy != null ? (
                            <span className={t.accuracy >= 0.8 ? 'text-success-text' : 'text-warning-text'}>
                              {Math.round(t.accuracy * 100)}%
                            </span>
                          ) : <span className="text-ink-faint">unreviewed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Widget>
      </div>

      <Widget title="Roles" subtitle="Headcount and granted permissions" bodyClass="p-0">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Role</th><th className="text-right">Users</th><th>Permissions</th><th /></tr></thead>
            <tbody>
              {(roles.data || []).map((r) => (
                <tr key={r.role}>
                  <td className="text-ink font-medium">{r.label}</td>
                  <td className="text-right tabular">{r.user_count}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(r.permissions.map((p) => p.module))].map((m) => (
                        <span key={m} className="pill bg-surface-sunken text-ink-muted text-body-sm">
                          {m.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {r.permissions.length === 0 && (
                        <span className="text-body-sm text-ink-faint">None granted</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Link to="/admin/users" className="btn-ghost btn-sm">Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>
    </div>
  )
}

function HealthRow({ label, value, ok, icon: Icon }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-body-md text-ink-muted">
        {Icon ? <Icon size={15} /> : <Activity size={15} />} {label}
      </dt>
      <dd className={`pill ${ok ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} />
        {value}
      </dd>
    </div>
  )
}
