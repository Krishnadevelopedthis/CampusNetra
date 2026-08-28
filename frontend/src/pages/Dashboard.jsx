import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowRight, ClipboardList, PlusCircle, Search, Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import {
  EmptyState, ErrorState, Metric, PriorityPill, Spinner, StatusPill, Widget,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { TWIN_STATE, ago, slaLabel } from '@/lib/format'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
  })

  if (isLoading) return <Spinner label="Loading your dashboard…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const isReporter = ['student', 'teacher'].includes(user?.role)
  const first = user?.full_name?.split(' ')[0]

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-ink">
            {isReporter ? `Welcome back, ${first}` : 'Campus Overview'}
          </h1>
          <p className="text-body-md text-ink-muted mt-1">
            {isReporter
              ? 'Your reports and campus utility status.'
              : 'Real-time telemetry and operational metrics.'}
          </p>
        </div>
        {isReporter && (
          <Link to="/issues/new" className="btn-dark">
            <PlusCircle size={16} /> Report an Issue
          </Link>
        )}
      </header>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.metrics.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} accent={m.accent} />
        ))}
      </div>

      {isReporter ? <ReporterBody data={data} /> : <StaffBody data={data} user={user} />}
    </div>
  )
}

/* ---------------- Student / teacher ---------------- */
function ReporterBody({ data }) {
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <Widget
        className="lg:col-span-2"
        title="Recent Activity"
        action={<Link to="/issues" className="text-body-md text-secondary hover:underline">View all</Link>}
        bodyClass="p-0"
      >
        {data.recent_activity.length === 0 ? (
          <EmptyState
            icon={ClipboardList} title="Nothing reported yet"
            description="When you report an issue it will appear here with live status."
            action={<Link to="/issues/new" className="btn-primary">Report an Issue</Link>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket</th><th>Issue</th><th>Status</th><th>Reported</th><th />
                </tr>
              </thead>
              <tbody>
                {data.recent_activity.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-mono-data text-secondary whitespace-nowrap">{i.reference}</td>
                    <td>
                      <p className="text-ink">{i.title}</p>
                      {i.location_summary && (
                        <p className="text-body-sm text-ink-faint font-mono">{i.location_summary}</p>
                      )}
                    </td>
                    <td><StatusPill status={i.status} /></td>
                    <td className="text-ink-muted whitespace-nowrap">{ago(i.created_at)}</td>
                    <td>
                      <Link to={`/issues/${i.id}`} className="btn-ghost btn-sm">
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>

      <div className="space-y-4">
        <div className="widget bg-primary text-white p-widget border-primary">
          <h3 className="text-headline-md text-white">Quick Actions</h3>
          <div className="mt-4 space-y-2">
            <QuickAction to="/issues/new" icon={PlusCircle} label="Report Issue" primary />
            <QuickAction to="/lost-found" icon={Search} label="Lost & Found" />
            <QuickAction to="/twin" icon={Activity} label="Campus Map" />
          </div>
        </div>

        <Widget title="How it works">
          <ol className="space-y-3">
            {[
              ['Report', 'Add a photo, room and description.'],
              ['Auto-route', 'AI picks the category and the right department.'],
              ['Track', 'Watch it move from Reported to Resolved.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary grid place-items-center text-body-sm font-semibold shrink-0">
                  {i + 1}
                </span>
                <div>
                  <p className="text-body-md font-medium text-ink">{t}</p>
                  <p className="text-body-sm text-ink-faint">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Widget>
      </div>
    </div>
  )
}

function QuickAction({ to, icon: Icon, label, primary }) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-2 h-11 px-3 rounded-lg transition-colors ${
        primary ? 'bg-white text-primary hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <span className="flex items-center gap-2.5 text-body-lg font-medium">
        <Icon size={18} /> {label}
      </span>
      <ArrowRight size={16} />
    </Link>
  )
}

/* ---------------- Technician / manager / admin ---------------- */
function StaffBody({ data, user }) {
  const states = Object.entries(data.asset_states || {}).filter(([, v]) => v > 0)

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <Widget title="Operational Health">
          <div className="flex flex-col items-center py-2">
            <HealthRing score={data.health_score} />
            <p className="text-body-md text-ink-muted mt-4 text-center">
              {data.health_score >= 90
                ? 'System performing optimally.'
                : data.health_score >= 70
                  ? 'Minor degradation across some zones.'
                  : 'Multiple assets need attention.'}
            </p>
          </div>
          {states.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
              {states.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-body-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span className="w-2 h-2 rounded-full" style={{ background: TWIN_STATE[k]?.colour }} />
                    {TWIN_STATE[k]?.label || k}
                  </span>
                  <span className="tabular font-medium text-ink">{v}</span>
                </div>
              ))}
            </div>
          )}
        </Widget>

        <Widget className="lg:col-span-2" title="Created vs Resolved" subtitle="Last 7 days">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13,
                  boxShadow: '0 4px 12px -1px rgb(15 23 42 / 0.10)',
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
              <Bar dataKey="created" name="Created" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="resolved" name="Resolved" fill="#1e1b4b" radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>
      </div>

      {user?.role === 'technician' && data.my_queue?.length > 0 && (
        <Widget
          title="My Queue"
          action={<Link to="/work-orders" className="text-body-md text-secondary hover:underline">All work orders</Link>}
          bodyClass="p-0"
        >
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr><th>Reference</th><th>Task</th><th>Priority</th><th>Status</th><th>SLA</th><th /></tr>
              </thead>
              <tbody>
                {data.my_queue.map((w) => (
                  <tr key={w.id}>
                    <td className="font-mono text-mono-data text-secondary">{w.reference}</td>
                    <td className="text-ink">{w.title}</td>
                    <td><PriorityPill priority={w.priority} /></td>
                    <td><StatusPill status={w.status} /></td>
                    <td className="text-ink-muted">{w.sla_due_at ? ago(w.sla_due_at) : '—'}</td>
                    <td>
                      <Link to={`/work-orders/${w.id}`} className="btn-ghost btn-sm"><ArrowRight size={14} /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      )}

      <Widget
        title={<span className="flex items-center gap-2"><AlertTriangle size={18} className="text-danger" /> Active Alerts</span>}
        action={<Link to="/issues" className="text-body-md text-secondary hover:underline">View all</Link>}
        bodyClass={data.alerts.length ? 'p-widget' : 'p-0'}
      >
        {data.alerts.length === 0 ? (
          <EmptyState icon={Activity} title="No critical or high-priority issues"
                      description="Everything urgent has been handled." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.alerts.map((a) => {
              const critical = a.priority === 'critical'
              return (
                <Link
                  key={a.id} to={`/issues/${a.id}`}
                  className={`rounded border p-3 transition-colors hover:shadow-level2 ${
                    critical ? 'bg-danger-bg border-danger-border' : 'bg-warning-bg border-warning-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <PriorityPill priority={a.priority} />
                    <span className="text-body-sm text-ink-faint">{ago(a.created_at)}</span>
                  </div>
                  <p className="text-body-lg font-medium text-ink mt-2">{a.title}</p>
                  {a.location_summary && (
                    <p className="font-mono text-mono-data text-ink-muted mt-1">{a.location_summary}</p>
                  )}
                  <div className="flex items-center justify-between mt-2.5">
                    <StatusPill status={a.status} />
                    {a.sla_minutes_remaining != null && (
                      <span className={`text-body-sm font-medium ${a.sla_minutes_remaining < 0 ? 'text-danger-text' : 'text-ink-muted'}`}>
                        {slaLabel(a.sla_minutes_remaining)}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Widget>
    </>
  )
}

function HealthRing({ score = 0 }) {
  const R = 54
  const C = 2 * Math.PI * R
  const colour = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={R} fill="none" stroke={colour} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - (score / 100) * C}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="text-display-metrics tabular leading-none">{score}</p>
          <p className="text-body-sm mt-1" style={{ color: colour }}>/100</p>
        </div>
      </div>
    </div>
  )
}
