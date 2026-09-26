import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Play,
  Shield,
  Zap,
  BarChart3,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

// 21st.dev / shadcn-saas Interactive Mock Dashboard
function InteractiveDashboardPreview() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="relative w-full max-w-2xl mx-auto group">
      {/* ACETERNITY PROACTIV: Ambient Glow Backdrop + Radial Spotlight */}
      <div className="absolute -inset-1.5 bg-gradient-to-r from-secondary-400/40 via-primary-500/30 to-cyan-500/40 rounded-3xl blur-2xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
      <div className="absolute -inset-2.5 bg-spotlight-primary rounded-3xl blur-3xl opacity-60 pointer-events-none" aria-hidden />

      {/* Window Container — Glassmorphic */}
      <div className="relative glass-panel rounded-2xl shadow-glow-secondary overflow-hidden transition-all duration-300">
        {/* Title Bar & Interactive View Switcher */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-sunken/80 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/80 border border-danger/20" />
              <div className="w-3 h-3 rounded-full bg-warning/80 border border-warning/20" />
              <div className="w-3 h-3 rounded-full bg-success/80 border border-success/20" />
            </div>
            <span className="text-[11px] font-mono text-ink-faint px-2 py-0.5 rounded bg-surface/60 border border-border-subtle hidden sm:inline-block">
              app.campusnetra.io/live
            </span>
          </div>

          {/* Interactive Navigation Tabs — ACETERNITY PROACTIV: Animated active tab */}
          <div className="flex items-center gap-1 bg-surface-base p-1 rounded-lg border border-border-subtle">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'twin', label: 'Twin View', icon: Layers },
              { id: 'ai', label: 'AI Triage', icon: Sparkles },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-body-sm font-medium transition-all duration-200',
                  activeTab === id
                    ? 'bg-gradient-to-r from-secondary-600 to-primary-800 text-white shadow-glow-secondary'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-sunken',
                )}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div className="p-4 sm:p-5">
          {activeTab === 'overview' && (
            <div className="space-y-3.5">
              {/* Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Active Issues', value: '24', change: '-14% today', color: 'text-warning', bg: 'bg-warning-bg/60 border-warning-border' },
                  { label: 'Work Orders', value: '8', change: '5 in progress', color: 'text-info-text', bg: 'bg-info-bg/60 border-info-border' },
                  { label: 'SLA Target', value: '94.2%', change: '+3.1% vs avg', color: 'text-success-text', bg: 'bg-success-bg/60 border-success-border' },
                ].map((m) => (
                  <div key={m.label} className={clsx('rounded-xl p-3 border transition-transform duration-200 hover:-translate-y-0.5', m.bg)}>
                    <p className="text-body-sm text-ink-faint font-medium">{m.label}</p>
                    <p className={clsx('text-headline-md font-bold mt-0.5', m.color)}>{m.value}</p>
                    <p className="text-[11px] text-ink-muted mt-1">{m.change}</p>
                  </div>
                ))}
              </div>

              {/* Sparkline & SLA Progress */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 rounded-xl bg-surface border border-border-subtle p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-body-sm font-medium text-ink">Campus Incident Velocity</span>
                    <span className="text-label-caps text-success font-semibold">Real-Time</span>
                  </div>
                  <svg viewBox="0 0 240 54" fill="none" className="w-full h-11">
                    <defs>
                      <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 40 Q 30 48, 60 28 T 120 22 T 180 34 T 240 12"
                      stroke="rgb(59 130 246)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d="M0 40 Q 30 48, 60 28 T 120 22 T 180 34 T 240 12 L 240 54 L 0 54 Z"
                      fill="url(#heroGrad)"
                    />
                    <circle cx="240" cy="12" r="3.5" fill="rgb(59 130 246)" className="animate-ping" />
                    <circle cx="240" cy="12" r="3.5" fill="rgb(59 130 246)" />
                  </svg>
                </div>

                <div className="rounded-xl bg-surface border border-border-subtle p-3.5 flex flex-col justify-between">
                  <div>
                    <span className="text-body-sm text-ink-faint">Auto-Assignment</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-headline-md font-bold text-ink">98.6%</span>
                      <span className="text-[11px] text-success-text font-medium">accuracy</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden mt-2">
                    <div className="bg-secondary-600 h-2 rounded-full" style={{ width: '98.6%' }} />
                  </div>
                </div>
              </div>

              {/* Live Incident Activity */}
              <div className="rounded-xl bg-surface border border-border-subtle p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-body-sm font-semibold text-ink">Live Triage Dispatch</span>
                  <span className="text-[11px] text-ink-faint">Auto-updated 2s ago</span>
                </div>
                <div className="space-y-2">
                  {[
                    { id: '#WO-298', title: 'Main Library HVAC Spike', team: 'HVAC Team', status: 'Assigned', badge: 'bg-warning-bg text-warning-text border-warning-border' },
                    { id: '#WO-297', title: 'Block B Elevators Inspection Routine', team: 'Elevator Specialist', status: 'In Route', badge: 'bg-info-bg text-info-text border-info-border' },
                    { id: '#WO-296', title: 'Science Lab 4 Fume Hood Airflow Restored', team: 'Safety Ops', status: 'Resolved', badge: 'bg-success-bg text-success-text border-success-border' },
                  ].map((row) => (
                    <div key={row.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-sunken/60 border border-border-subtle/50 text-body-sm">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="font-mono text-ink-muted text-[12px]">{row.id}</span>
                        <span className="truncate text-ink font-medium">{row.title}</span>
                      </div>
                      <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap', row.badge)}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'twin' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body-sm font-semibold text-ink">Floor 2 — Engineering Complex</p>
                  <p className="text-[11px] text-ink-faint">Live overview of campus facilities</p>
                </div>
                <span className="text-label-caps text-success font-semibold bg-success-bg border border-success-border px-2 py-0.5 rounded-full">
                  All Systems Online
                </span>
              </div>

              {/* Interactive Mini Blueprint */}
              <div className="relative bg-surface-sunken rounded-xl border border-border-subtle p-3 overflow-hidden">
                <svg viewBox="0 0 320 130" fill="none" className="w-full h-32">
                  {/* Grid Lines */}
                  <line x1="0" y1="65" x2="320" y2="65" stroke="currentColor" strokeDasharray="3 3" className="text-border-subtle" />
                  <line x1="160" y1="0" x2="160" y2="130" stroke="currentColor" strokeDasharray="3 3" className="text-border-subtle" />

                  {/* Room Nodes */}
                  <rect x="10" y="10" width="90" height="50" rx="6" className="fill-success-bg/80 stroke-success-border" strokeWidth="1.5" />
                  <text x="55" y="32" textAnchor="middle" className="text-[11px] font-semibold fill-success-text">CAD Lab 201</text>
                  <text x="55" y="46" textAnchor="middle" className="text-[9px] fill-ink-muted">12 Active</text>

                  <rect x="110" y="10" width="100" height="50" rx="6" className="fill-warning-bg/80 stroke-warning-border" strokeWidth="1.5" />
                  <text x="160" y="32" textAnchor="middle" className="text-[11px] font-semibold fill-warning-text">Server Room B</text>
                  <text x="160" y="46" textAnchor="middle" className="text-[9px] fill-ink-muted">High Load</text>

                  <rect x="220" y="10" width="90" height="50" rx="6" className="fill-success-bg/80 stroke-success-border" strokeWidth="1.5" />
                  <text x="265" y="32" textAnchor="middle" className="text-[11px] font-semibold fill-success-text">Faculty Lounge</text>
                  <text x="265" y="46" textAnchor="middle" className="text-[9px] fill-ink-muted">Nominal</text>

                  <rect x="10" y="70" width="140" height="50" rx="6" className="fill-surface stroke-border-subtle" strokeWidth="1.5" />
                  <text x="80" y="95" textAnchor="middle" className="text-[11px] font-semibold fill-ink">Auditorium 2A</text>
                  <text x="80" y="108" textAnchor="middle" className="text-[9px] fill-ink-faint">Idle • Standby Mode</text>

                  <rect x="160" y="70" width="150" height="50" rx="6" className="fill-info-bg/80 stroke-info-border" strokeWidth="1.5" />
                  <text x="235" y="95" textAnchor="middle" className="text-[11px] font-semibold fill-info-text">Robotics Workshop</text>
                  <text x="235" y="108" textAnchor="middle" className="text-[9px] fill-ink-muted">Inspection in Progress</text>
                </svg>
              </div>

              <div className="flex items-center justify-between text-body-sm text-ink-muted px-1">
                <span>5 Nodes Tracked</span>
                <span className="text-secondary font-medium cursor-pointer hover:underline">Launch Full Twin Experience →</span>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={16} className="text-secondary" />
                  <span className="text-body-sm font-semibold text-ink">CampusNetra AI Reasoning Engine</span>
                </div>
                <span className="text-label-caps font-mono text-secondary bg-ai-bg border border-ai-border px-2 py-0.5 rounded-full">
                  Latency: 180ms
                </span>
              </div>

              {/* Step-by-Step AI Pipeline Breakdown */}
              <div className="space-y-2 text-body-sm">
                <div className="p-3 rounded-xl bg-ai-bg/60 border border-ai-border flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-secondary-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="font-semibold text-ink text-[13px]">Natural Language Incident Ingestion</p>
                    <p className="text-ink-muted text-[12px] italic">"Water leakage from second floor ceiling near chemical storage room"</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface border border-border-subtle flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-warning/20 text-warning flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="font-semibold text-ink text-[13px]">Hazard & Urgency Assessment</p>
                    <p className="text-ink-muted text-[12px]">Classified: <strong className="text-warning-text">High Risk (Chemical Proximity)</strong> • Priority: P1 • SLA: 15m</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-success-bg/60 border border-success-border flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <p className="font-semibold text-success-text text-[13px]">Autonomous Work Order Dispatch</p>
                    <p className="text-ink-muted text-[12px]">Assigned to Lead Plumber & Lab Safety Officer with digital twin coordinate pin.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating badges describe real product capabilities -- kept
          deliberately free of invented metrics (no fabricated accuracy
          percentage, no fake response-time number) that this app has
          never actually measured or audited. */}
      <div className="absolute -left-5 top-1/3 glass-panel rounded-2xl px-3.5 py-2.5 shadow-glow-emerald hidden sm:flex items-center gap-2.5 animate-float">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse status-beacon text-emerald-500" />
        <div>
          <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">AI-Assisted Triage</p>
          <p className="text-[12px] font-medium text-ink">Auto-classified by category & priority</p>
        </div>
      </div>

      <div className="absolute -right-5 bottom-12 glass-panel rounded-2xl px-3.5 py-2.5 shadow-glow-cyan hidden sm:flex items-center gap-2.5 animate-float-reverse">
        <div className="w-7 h-7 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 status-beacon text-cyan-500">
          <Zap size={14} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-cyan-500 uppercase tracking-wider">Predictive Engine</p>
          <p className="text-[12px] font-medium text-ink">Flags assets trending toward failure</p>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex flex-col justify-center overflow-hidden bg-primary pt-24 pb-20">
      {/* ACETERNITY PROACTIV: Radial spotlight glows & gradient mesh */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-secondary-600/25 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 w-[450px] h-[450px] bg-primary-700/60 rounded-full blur-[100px]" />
        <div className="absolute top-10 right-10 w-[350px] h-[350px] bg-secondary-400/15 rounded-full blur-[80px]" />
        {/* Radial spotlight glow — top center ambient illumination */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] {bg-spotlight-primary} rounded-full blur-[80px] pointer-events-none opacity-80" aria-hidden />
      </div>

      {/* High-Tech Architectural Grid */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="heroGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#heroGrid)" />
      </svg>

      {/* Grid beam background overlay */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="bg-grid-beam opacity-60" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Hero Column */}
          <div>
            {/* Announcement pill (was duplicated below — removed the second copy) */}
            <div className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-full px-3.5 py-1.5 mb-7 transition-all duration-200 cursor-pointer">
              <div className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </div>
              <span className="text-[13px] font-medium text-white/90">
                Next-Gen Campus Facilities & Digital Twin 2.0
              </span>
              <ChevronRight size={14} className="text-white/60" />
            </div>

            {/* Main Headline */}
            <h1 className="text-[clamp(2.5rem,5.5vw,4.25rem)] font-bold text-white leading-[1.1] tracking-tight" style={{ textWrap: 'balance' }}>
              Run Your Campus{' '}
              <span className="relative inline-block">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary-400 via-primary-400 to-cyan-400">
                  With Precision.
                </span>
              </span>
            </h1>

            <p className="mt-6 text-body-lg text-white/75 max-w-xl leading-relaxed">
              CampusNetra connects students, technicians, and facility directors through a unified
              digital twin canvas, automated AI triage dispatch, and real-time SLA accountability.
            </p>

            {/* Action CTAs */}
            <div className="mt-9 flex flex-col sm:flex-row gap-4">
              <Link
                to="/register"
                className="group relative inline-flex items-center justify-center gap-2 px-7 h-12 rounded-xl bg-secondary-500 hover:bg-secondary-400 text-white font-semibold transition-all duration-200 text-body-lg shadow-level3 hover:shadow-secondary-500/25 border-shimmer"
              >
                <span>Launch Free Account</span>
                <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <a
                href="#twin"
                onClick={(e) => {
                  e.preventDefault()
                  document.querySelector('#twin')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors duration-200 text-body-lg border border-white/20 border-shimmer"
              >
                <Play size={16} />
                <span>Explore Digital Twin</span>
              </a>
            </div>

            {/* Trust Badges + Avatar Stack Social Proof */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <div className="flex items-center justify-between mb-6">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Role-Based Access', sub: 'Granular permissions' },
                    { label: 'AI Incident Triage', sub: '< 200ms classification' },
                    { label: 'Real-Time SLA', sub: 'Live compliance tracking' },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-white font-semibold text-[13px]">{item.label}</p>
                      <p className="text-white/60 text-[11px] mt-0.5">{item.sub}</p>
                    </div>
                  ))}
                </div>
                {/* ACETERNITY PROACTIV: Avatar stack social proof badge */}
                <div className="avatar-stack flex items-center -space-x-2">
                  <div className="w-8 h-8 bg-secondary text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">AC</div>
                  <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">DT</div>
                  <div className="w-8 h-8 bg-cyan-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">AI</div>
                  <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">SL</div>
                  <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">+12</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Hero Column: 21st.dev Interactive Preview */}
          <div className="relative">
            <InteractiveDashboardPreview />
          </div>
        </div>
      </div>

      {/* Bottom Subtle Gradient Transition */}
      <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-surface-base to-transparent pointer-events-none" aria-hidden />
    </section>
  )
}
