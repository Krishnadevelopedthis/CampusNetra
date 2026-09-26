import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Database, Server, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'

import { Button, ErrorState, Metric, MetricRow, Modal, Spinner, toast, Widget } from '@/components/ui'
import { api, API_ORIGIN } from '@/lib/api'

/** Grant/revoke which permissions a role carries. This is now real
 * enforcement, not just a record: most protected endpoints (issues, work
 * orders, inspections, lost & found, assets, users, analytics, SLA/audit
 * config, notification templates) check role_permissions directly via
 * require_permission() (see backend/app/api/deps.py), seeded at startup to
 * match this app's original hardcoded role gates so switching it on didn't
 * change anyone's access. Unchecking a box here takes real effect the next
 * time that role calls the corresponding endpoint. A handful of
 * finer-grained admin-only actions not covered by this permission
 * catalogue (e.g. deleting a building/asset/campus, or managing
 * permissions themselves) are still hardcoded to admin/super_admin, by
 * design, to avoid a self-escalation path through this very screen. */
function ManagePermissionsModal({ role, onClose }) {
  const qc = useQueryClient()
  const permissions = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => api.get('/admin/permissions'),
  })
  const [selected, setSelected] = useState(null)

  // Seed local selection from the role's currently-granted set, once we
  // know both the full catalogue (for ids) and what this role already has.
  const initial = new Set((role.permissions || []).map((p) => p.code))
  if (selected === null && permissions.data) {
    setSelected(new Set(
      permissions.data.filter((p) => initial.has(p.code)).map((p) => p.id),
    ))
  }

  const save = useMutation({
    mutationFn: () => api.put(`/admin/roles/${role.role}/permissions`, {
      permission_ids: [...(selected || [])],
    }),
    onSuccess: (d) => {
      toast.success(d.detail)
      qc.invalidateQueries({ queryKey: ['admin-roles'] })
      onClose()
    },
    onError: (e) => toast.error(e.detail || 'Could not save permissions'),
  })

  const byModule = {}
  for (const p of permissions.data || []) {
    (byModule[p.module] ||= []).push(p)
  }

  return (
    <Modal
      open onClose={onClose} title={`${role.label} permissions`} size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      )}
    >
      {permissions.isLoading || selected === null ? <Spinner /> : (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-body-sm text-warning-text bg-warning-bg border border-warning-border rounded-lg px-3 py-2">
            These take real effect — unchecking something here blocks this role from
            that action immediately, everywhere in the app.
          </p>
          {Object.entries(byModule).map(([mod, perms]) => (
            <div key={mod}>
              <p className="text-label-caps uppercase text-ink-muted mb-1.5">
                {mod.replace(/_/g, ' ')}
              </p>
              <div className="space-y-1.5">
                {perms.map((p) => (
                  <label key={p.id} className="flex items-start gap-2.5 text-body-md text-ink cursor-pointer">
                    <input
                      type="checkbox" className="mt-0.5 rounded border-border accent-secondary"
                      checked={selected.has(p.id)}
                      onChange={(e) => setSelected((s) => {
                        const next = new Set(s)
                        if (e.target.checked) next.add(p.id); else next.delete(p.id)
                        return next
                      })}
                    />
                    <span>
                      {p.description || p.code}
                      <span className="text-ink-faint"> — {p.code}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function AdminOverview() {
  const [managingRole, setManagingRole] = useState(null)
  const health = useQuery({
    queryKey: ['system-health'],
    // /health sits outside the versioned /api/v1 prefix, so it's fetched
    // directly rather than through api.get(). It must still be an absolute
    // URL to the backend in production, though — a bare fetch('/health')
    // resolves against the frontend's OWN host (campusnetra.dpdns.org),
    // which has no such route, and silently made every check here look
    // broken (API degraded, database unreachable, AI on heuristic
    // fallback) regardless of the backend's actual state.
    queryFn: () => fetch(`${API_ORIGIN}/health`).then((r) => r.json()),
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
      <MetricRow>
        <Metric label="Total users" value={totalUsers} accent="rgb(var(--c-primary))" icon={Users} />
        <Metric label="Open issues" value={dashboard.data.metrics[0]?.value ?? 0} accent="#f59e0b" />
        <Metric label="Asset health" value={`${dashboard.data.health_score}%`}
                accent={dashboard.data.health_score >= 90 ? '#10b981' : '#f59e0b'} />
        <Metric label="SLA breaches" value={dashboard.data.sla_breaches}
                accent={dashboard.data.sla_breaches > 0 ? '#ef4444' : '#10b981'} />
      </MetricRow>

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
                    <button className="btn-ghost btn-sm" onClick={() => setManagingRole(r)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      {managingRole && (
        <ManagePermissionsModal role={managingRole} onClose={() => setManagingRole(null)} />
      )}
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
