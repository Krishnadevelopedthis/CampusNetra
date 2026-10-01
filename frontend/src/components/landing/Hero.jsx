import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Layers3,
  Map,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'

function CampusCommandCenter() {
  const incidents = [
    { id: 'WO-298', title: 'Library HVAC spike', team: 'Mechanical', status: 'Assigned', tone: 'warning' },
    { id: 'WO-297', title: 'North quad lighting', team: 'Electrical', status: 'In route', tone: 'info' },
    { id: 'WO-296', title: 'Lab airflow restored', team: 'Safety ops', status: 'Resolved', tone: 'success' },
  ]

  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-secondary/10 blur-3xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-[0_24px_70px_-28px_rgb(23_20_15/0.45)]">
        <div className="flex items-center justify-between border-b border-border-subtle bg-surface-raised px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white">
              <Activity size={14} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">CampusNetra</p>
              <p className="text-xs font-semibold text-ink">Operations command center</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success-border bg-success-bg px-2.5 py-1 text-[10px] font-semibold text-success-text">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live systems
          </div>
        </div>

        <div className="grid md:grid-cols-[148px_1fr]">
          <aside className="hidden border-r border-border-subtle bg-surface-sunken/55 p-3 md:block">
            <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint">Workspace</p>
            {[
              ['Overview', Activity],
              ['Issues & work orders', Wrench],
              ['Digital twin', Layers3],
              ['Campus map', Map],
            ].map(([label, Icon], index) => (
              <div key={label} className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium ${index === 0 ? 'bg-primary text-white' : 'text-ink-muted'}`}>
                <Icon size={13} /> {label}
              </div>
            ))}
            <div className="mt-8 rounded-xl border border-secondary/20 bg-secondary/10 p-3">
              <Sparkles size={14} className="mb-2 text-secondary" />
              <p className="text-[11px] font-semibold text-ink">AI triage ready</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">New reports are being classified and routed.</p>
            </div>
          </aside>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Tuesday · 09:41</p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-ink">Good morning, facilities team</h3>
              </div>
              <button type="button" className="hidden rounded-lg border border-border-subtle px-2.5 py-1.5 text-[10px] font-semibold text-ink-muted sm:block">Last 30 days</button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                ['24', 'Open issues', '−14%'],
                ['08', 'Active work orders', '5 in progress'],
                ['94%', 'SLA on track', '+3.1%'],
              ].map(([value, label, delta], index) => (
                <div key={label} className="rounded-xl border border-border-subtle bg-surface-raised p-3">
                  <p className="text-xl font-bold tracking-tight text-ink">{value}</p>
                  <p className="mt-1 text-[10px] font-medium leading-tight text-ink-muted">{label}</p>
                  <p className={`mt-2 text-[10px] font-semibold ${index === 1 ? 'text-info-text' : 'text-success-text'}`}>{delta}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-border-subtle bg-surface-sunken/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-ink">Campus health</p>
                  <span className="text-[10px] font-semibold text-success-text">Stable</span>
                </div>
                <svg viewBox="0 0 300 92" className="h-24 w-full" role="img" aria-label="Campus health trend rising steadily">
                  <defs>
                    <linearGradient id="campusHealthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="rgb(244 96 42)" stopOpacity="0.22" />
                      <stop offset="1" stopColor="rgb(244 96 42)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 74H300M0 48H300M0 22H300" stroke="currentColor" strokeDasharray="3 5" className="text-border-subtle" />
                  <path d="M0 71 C24 67 30 49 52 56 S83 66 106 45 S142 43 159 50 S190 36 210 40 S245 27 267 31 S287 17 300 13 V92 H0Z" fill="url(#campusHealthFill)" />
                  <path d="M0 71 C24 67 30 49 52 56 S83 66 106 45 S142 43 159 50 S190 36 210 40 S245 27 267 31 S287 17 300 13" fill="none" stroke="rgb(244 96 42)" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="300" cy="13" r="4" fill="rgb(244 96 42)" />
                </svg>
                <div className="flex items-center justify-between text-[10px] text-ink-faint"><span>Mon</span><span>Today</span></div>
              </div>

              <div className="rounded-xl border border-border-subtle bg-primary p-3 text-white">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold">Priority queue</p>
                  <CircleDot size={14} className="text-secondary-300" />
                </div>
                <p className="text-3xl font-bold tracking-tight">03</p>
                <p className="mt-1 text-[10px] text-white/60">items need attention now</p>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-2/3 rounded-full bg-secondary-400" /></div>
                <p className="mt-2 text-[10px] text-white/60">Next SLA review in 18 min</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-ink">Live dispatch</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-faint"><Clock3 size={11} /> Updated just now</span>
              </div>
              <div className="space-y-1.5">
                {incidents.map((incident) => (
                  <div key={incident.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunken/55 px-2.5 py-2 text-[10px]">
                    <div className="flex min-w-0 items-center gap-2"><span className="font-mono text-ink-faint">#{incident.id}</span><span className="truncate font-semibold text-ink">{incident.title}</span></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 font-semibold ${incident.tone === 'warning' ? 'bg-warning-bg text-warning-text' : incident.tone === 'info' ? 'bg-info-bg text-info-text' : 'bg-success-bg text-success-text'}`}>{incident.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-level3 sm:flex">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-success-bg text-success-text"><CheckCircle2 size={15} /></div>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Resolved</p><p className="text-xs font-semibold text-ink">Fume hood airflow</p></div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-subtle bg-surface-base pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(244,96,42,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.3),transparent_45%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-secondary/30" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16 lg:px-8">
        <div className="max-w-xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-secondary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Campus operations, connected
          </div>
          <h1 className="max-w-2xl text-[clamp(2.75rem,5.8vw,5.25rem)] font-bold leading-[0.98] tracking-[-0.055em] text-ink" style={{ textWrap: 'balance' }}>
            Every campus issue has a <span className="text-secondary">next move.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-muted sm:text-xl">
            CampusNetra gives universities one clear operating layer for issue reporting, work orders, inspections, assets, and the digital twin that connects them.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-level3 transition hover:-translate-y-0.5 hover:bg-primary-800">
              See how it works <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#platform" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-6 text-sm font-bold text-ink transition hover:border-primary hover:bg-surface-raised">
              Explore the platform <ChevronRight size={16} />
            </a>
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-6 sm:grid-cols-3">
            {[
              ['One source of truth', 'From report to resolution'],
              ['AI-assisted routing', 'The right team, sooner'],
              ['Built for trust', 'Roles, SLAs, audit trails'],
            ].map(([title, body]) => <div key={title}><p className="text-xs font-bold text-ink">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{body}</p></div>)}
          </div>
        </div>
        <CampusCommandCenter />
      </div>
      <div className="relative mx-auto mt-20 flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t border-border-subtle px-6 pt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint lg:px-8">
        <span>For universities</span><span>For colleges</span><span>For research facilities</span><span>For facilities teams</span>
        <span className="inline-flex items-center gap-2 normal-case tracking-normal text-ink-muted"><ShieldCheck size={14} className="text-success-text" /> Access controls built in</span>
      </div>
    </section>
  )
}
