import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'

import { Button, ErrorState, Input, PriorityPill, Spinner, Widget, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { dt } from '@/lib/format'

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

/* ---------------- Issue categories & AI routing rules ---------------- */
export function AdminIssueConfig() {
  const qc = useQueryClient()
  // Per-row draft: { priority?, keywordsText? } — keywordsText is the raw
  // comma-separated input so a mid-edit trailing comma or space doesn't
  // fight the user; it's only split/cleaned when actually saved.
  const [edits, setEdits] = useState({})
  const [expanded, setExpanded] = useState({})

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['issue-config'],
    queryFn: () => api.get('/admin/issue-categories'),
  })

  const save = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/issue-categories/${id}`, body),
    onSuccess: (d, vars) => {
      toast.success(d.detail)
      setEdits((e) => { const n = { ...e }; delete n[vars.id]; return n })
      qc.invalidateQueries({ queryKey: ['issue-config'] })
    },
    onError: (err) => toast.error(err.detail || 'Could not update category'),
  })

  if (isLoading) return <Spinner label="Loading configuration…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <Widget
      title="Issue Categories"
      subtitle="Keywords drive the fallback classifier and are also given to the AI model as hints — a generic or colliding keyword (e.g. 'board' matching both furniture and a smartboard) can misroute either path, so they're editable here without a deploy."
      bodyClass="p-0"
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Category</th><th>Routes to</th><th>Default priority</th>
              <th>SLA (respond / resolve)</th><th>Keywords</th>
              <th className="text-right">Issues</th><th />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const edit = edits[c.id] || {}
              const keywordsText = edit.keywordsText
                ?? c.keywords.join(', ')
              const dirty = edit.priority != null
                || (edit.keywordsText != null
                    && edit.keywordsText.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).join(',')
                       !== [...c.keywords].sort().join(','))
              const isOpen = !!expanded[c.id]

              return (
                <tr key={c.id}>
                  <td>
                    <p className="text-ink">{c.name}</p>
                    <p className="font-mono text-[11px] text-ink-faint">{c.code}</p>
                  </td>
                  <td className="text-ink-muted">{c.department || '—'}</td>
                  <td>
                    <select
                      className="input h-8 py-0 w-32 capitalize"
                      value={edit.priority ?? c.default_priority}
                      onChange={(e) => setEdits((s) => ({
                        ...s, [c.id]: { ...s[c.id], priority: e.target.value },
                      }))}
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p} className="capitalize">{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="tabular text-ink-muted whitespace-nowrap">
                    {c.sla_response_mins}m / {Math.round(c.sla_resolve_mins / 60)}h
                  </td>
                  <td className="max-w-sm">
                    {isOpen ? (
                      <textarea
                        className="input text-body-sm w-full min-h-[64px]"
                        placeholder="comma, separated, keywords"
                        value={keywordsText}
                        onChange={(e) => setEdits((s) => ({
                          ...s, [c.id]: { ...s[c.id], keywordsText: e.target.value },
                        }))}
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex flex-wrap gap-1 text-left"
                        onClick={() => setExpanded((s) => ({ ...s, [c.id]: true }))}
                        title="Click to edit keywords"
                      >
                        {c.keywords.slice(0, 6).map((k) => (
                          <span key={k} className="pill bg-surface-sunken text-ink-muted text-body-sm">{k}</span>
                        ))}
                        {c.keywords.length > 6 && (
                          <span className="text-body-sm text-ink-faint self-center">
                            +{c.keywords.length - 6}
                          </span>
                        )}
                        {c.keywords.length === 0 && (
                          <span className="text-body-sm text-ink-faint italic">No keywords — click to add</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="text-right tabular">{c.issue_count}</td>
                  <td>
                    {dirty && (
                      <Button
                        size="sm" icon={Save} loading={save.isPending}
                        onClick={() => {
                          const body = {}
                          if (edit.priority != null) body.default_priority = edit.priority
                          if (edit.keywordsText != null) {
                            body.keywords = edit.keywordsText
                              .split(',').map((k) => k.trim()).filter(Boolean)
                          }
                          save.mutate({ id: c.id, body })
                          setExpanded((s) => ({ ...s, [c.id]: false }))
                        }}
                      >
                        Save
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Widget>
  )
}

/* ---------------- SLA policies ---------------- */
export function AdminSLA() {
  const qc = useQueryClient()
  const [edits, setEdits] = useState({})

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sla-policies'], queryFn: () => api.get('/admin/sla'),
  })

  const save = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/sla/${id}`, body),
    onSuccess: (d, vars) => {
      toast.success(d.detail)
      setEdits((e) => { const n = { ...e }; delete n[vars.id]; return n })
      qc.invalidateQueries({ queryKey: ['sla-policies'] })
    },
    onError: (err) => toast.error(err.detail || 'Could not update policy'),
  })

  if (isLoading) return <Spinner label="Loading SLA policies…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <Widget
      title="SLA Policies"
      subtitle="Response and resolution targets per priority. Compliance is measured against closed issues."
      bodyClass="p-0"
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Policy</th><th>Priority</th><th>Respond (min)</th><th>Resolve (min)</th>
              <th className="text-right">Issues</th><th className="text-right">Breached</th>
              <th className="text-right">Compliance</th><th />
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const edit = edits[p.id] || {}
              const dirty = Object.keys(edit).length > 0
              return (
                <tr key={p.id}>
                  <td className="text-ink">{p.name}</td>
                  <td><PriorityPill priority={p.priority} /></td>
                  <td>
                    <Input
                      type="number" min="1" className="h-8 w-24 tabular"
                      value={edit.response_mins ?? p.response_mins}
                      onChange={(e) => setEdits((s) => ({
                        ...s, [p.id]: { ...s[p.id], response_mins: Number(e.target.value) },
                      }))}
                    />
                  </td>
                  <td>
                    <Input
                      type="number" min="1" className="h-8 w-24 tabular"
                      value={edit.resolve_mins ?? p.resolve_mins}
                      onChange={(e) => setEdits((s) => ({
                        ...s, [p.id]: { ...s[p.id], resolve_mins: Number(e.target.value) },
                      }))}
                    />
                  </td>
                  <td className="text-right tabular">{p.issues_at_priority}</td>
                  <td className={`text-right tabular ${p.breached > 0 ? 'text-danger-text font-medium' : ''}`}>
                    {p.breached}
                  </td>
                  <td className="text-right tabular">
                    <span className={p.compliance_pct >= 90 ? 'text-success-text' : 'text-warning-text'}>
                      {p.compliance_pct}%
                    </span>
                  </td>
                  <td>
                    {dirty && (
                      <Button size="sm" icon={Save} loading={save.isPending}
                              onClick={() => save.mutate({
                                id: p.id,
                                body: {
                                  response_mins: edit.response_mins ?? p.response_mins,
                                  resolve_mins: edit.resolve_mins ?? p.resolve_mins,
                                  escalate_after_mins: p.escalate_after_mins,
                                },
                              })}>
                        Save
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Widget>
  )
}

/* ---------------- Audit & security ---------------- */
export function AdminAudit() {
  const [tab, setTab] = useState('audit')

  const audit = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/admin/audit', { params: { page_size: 50 } }),
    enabled: tab === 'audit',
  })
  const logins = useQuery({
    queryKey: ['login-activity'],
    queryFn: () => api.get('/admin/login-activity', { params: { limit: 50 } }),
    enabled: tab === 'logins',
  })

  return (
    <Widget bodyClass="p-0">
      <div className="flex gap-2 p-widget border-b border-border-subtle">
        <div className="flex p-1 bg-surface-sunken rounded-lg">
          {[['audit', 'Audit log'], ['logins', 'Login activity']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
                    className={`h-8 px-3 rounded text-body-md font-medium transition-colors ${
                      tab === k ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
                    }`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'audit' ? (
        audit.isLoading ? <Spinner />
          : audit.error ? <ErrorState error={audit.error} onRetry={audit.refetch} />
          : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Action</th><th>Actor</th><th>Entity</th><th>Change</th>
                           <th>IP</th><th>When</th></tr></thead>
                <tbody>
                  {audit.data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-mono-data text-ink">{r.action}</td>
                      <td className="text-ink-muted">{r.actor}</td>
                      <td className="text-ink-muted">{r.entity_type || '—'}</td>
                      <td className="text-body-sm text-ink-faint max-w-xs truncate">
                        {r.before || r.after
                          ? `${JSON.stringify(r.before || {})} → ${JSON.stringify(r.after || {})}`
                          : '—'}
                      </td>
                      <td className="font-mono text-[11px] text-ink-faint">{r.ip_address || '—'}</td>
                      <td className="text-ink-muted whitespace-nowrap">{dt(r.created_at)}</td>
                    </tr>
                  ))}
                  {audit.data.items.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-ink-faint py-10">
                      No audit entries yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
      ) : (
        logins.isLoading ? <Spinner />
          : logins.error ? <ErrorState error={logins.error} onRetry={logins.refetch} />
          : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Email</th><th>Result</th><th>Reason</th><th>IP</th><th>When</th></tr></thead>
                <tbody>
                  {logins.data.map((r) => (
                    <tr key={r.id}>
                      <td className="text-ink">{r.email}</td>
                      <td>
                        <span className={`pill ${r.succeeded
                          ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text'}`}>
                          {r.succeeded ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="text-ink-muted">{r.failure_reason || '—'}</td>
                      <td className="font-mono text-[11px] text-ink-faint">{r.ip_address || '—'}</td>
                      <td className="text-ink-muted whitespace-nowrap">{dt(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </Widget>
  )
}
