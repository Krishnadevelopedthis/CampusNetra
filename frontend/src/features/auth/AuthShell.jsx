import { Activity, BrainCircuit, CheckCircle2, FileCheck2, Radio, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

const SIGNALS = [
  ['AI', 'Auto-routing', BrainCircuit],
  ['Live', 'Digital twin', Radio],
  ['Clear', 'Audit trails', FileCheck2],
]

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-surface-base lg:grid lg:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-primary text-on-primary lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 top-16 h-96 w-96 rounded-full bg-secondary/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full border border-white/10" aria-hidden="true" />

        <div className="relative flex items-center justify-between">
          <Logo subtitle={null} size={42} className="[&_p]:text-on-primary" />
          <div className="rounded-xl border border-white/15 bg-white/10 p-1"><ThemeToggle /></div>
        </div>

        <div className="relative max-w-xl py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
            <Activity size={13} className="text-secondary-300" /> Campus operations, connected
          </div>
          <h2 className="text-reveal auth-copy-float max-w-lg text-[clamp(2.4rem,4.5vw,4.4rem)] font-bold leading-[0.98] tracking-[-0.055em] text-white">
            Every fault, every fix — on one live map of your campus.
          </h2>
          <p className="auth-copy-float auth-copy-float-delay mt-7 max-w-md text-base leading-relaxed text-white/65 xl:text-lg">
            Report an issue with a photo. CampusNetra classifies it, routes it to the right team, and keeps the digital twin current until it is fixed.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {SIGNALS.map(([key, label, Icon], index) => (
              <div key={label} className="auth-signal" style={{ animationDelay: `${index * 120}ms` }}>
                <Icon size={16} className="mb-2 text-secondary-300" aria-hidden="true" />
                <p className="text-xl font-bold tracking-tight text-white">{key}</p>
                <p className="mt-1 text-[11px] text-white/55">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-white/45">
          <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-success" /> Role-based access by default</span>
        </div>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:px-14 xl:px-24">
        <div className="absolute right-5 top-5 lg:hidden"><ThemeToggle /></div>
        <div className="w-full max-w-[440px] page-reveal">
          <div className="mb-8 lg:hidden"><Logo subtitle={false} size={38} /></div>
          <div className="mb-8">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Welcome to CampusNetra</p>
            <h1 className="text-[clamp(1.8rem,4vw,2.35rem)] font-bold tracking-[-0.04em] text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
          </div>
          <div>{children}</div>
          {footer && <div className="mt-7 text-center text-sm text-ink-muted">{footer}</div>}
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-ink-faint"><CheckCircle2 size={13} className="text-success-text" /> Secure campus workspace</div>
        </div>
      </main>
    </div>
  )
}
