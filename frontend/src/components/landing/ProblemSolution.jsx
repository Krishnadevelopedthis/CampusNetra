import { X, Check, ArrowRight, Sparkles } from 'lucide-react'
import clsx from 'clsx'

const BEFORE = [
  'Issues reported via paper forms or WhatsApp',
  'Work orders tracked in spreadsheets',
  'Reactive maintenance — discover faults after failure',
  'No visibility into SLA compliance',
  'Lost & Found managed through notice boards',
]

const AFTER = [
  'Structured digital issue reporting with AI classification',
  'Managed work orders with status tracking and audit trail',
  'Predictive maintenance alerts before failures occur',
  'Real-time SLA dashboards by team, location, and category',
  'Centralised digital Lost & Found with search and claim flow',
]

export function ProblemSolution() {
  return (
    <section id="solutions" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/3 w-[450px] h-[300px] bg-spotlight-emerald opacity-40" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Sparkles size={14} className="text-secondary" />
            <span className="text-gradient-electric">Problem → Solution</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            From Fragmented to Unified
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            Most campuses manage facilities with a patchwork of tools that don't talk to each other.
            CampusNetra replaces that chaos with one intelligent platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Before */}
          <div className="rounded-2xl p-8 glass-panel border border-glass-border relative overflow-hidden group">
            {/* Animated border shimmer on hover */}
            <div className="absolute inset-0 border-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-danger-bg/50 border border-danger-border/50 rounded-full px-3 py-1 mb-6 backdrop-blur-sm">
                <X size={12} className="text-danger-text" />
                <span className="text-label-caps text-danger-text font-bold uppercase tracking-wider">Before</span>
              </div>
              <h3 className="text-headline-md text-ink font-semibold mb-6">Manual · Fragmented · Reactive</h3>
              <ul className="space-y-4">
                {BEFORE.map((item) => (
                  <li key={item} className="flex items-start gap-3 group/item transition-all duration-300">
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-danger-bg/50 border border-danger-border/50 flex items-center justify-center group-hover/item:bg-danger-bg group-hover/item:border-danger-border transition-all duration-300">
                      <X size={10} className="text-danger-text" />
                    </div>
                    <span className="text-body-md text-ink-muted group-hover/item:text-ink transition-colors">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* After */}
          <div className="rounded-2xl p-8 glass-panel border border-glass-border relative overflow-hidden group">
            {/* Animated border shimmer on hover */}
            <div className="absolute inset-0 border-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-success-bg/50 border border-success-border/50 rounded-full px-3 py-1 mb-6 backdrop-blur-sm">
                <Check size={12} className="text-success-text" />
                <span className="text-label-caps text-success-text font-bold uppercase tracking-wider">After</span>
              </div>
              <h3 className="text-headline-md text-ink font-semibold mb-6">Centralised · Intelligent · Predictive</h3>
              <ul className="space-y-4">
                {AFTER.map((item) => (
                  <li key={item} className="flex items-start gap-3 group/item transition-all duration-300">
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-success-bg/50 border border-success-border/50 flex items-center justify-center group-hover/item:bg-success-bg group-hover/item:border-success-border transition-all duration-300">
                      <Check size={10} className="text-success-text" />
                    </div>
                    <span className="text-body-md text-ink-muted group-hover/item:text-ink transition-colors">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bridge arrow */}
        <div className="flex justify-center mt-12">
          <div className="inline-flex items-center gap-4 text-ink-faint">
            <div className="h-px w-20 bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="w-10 h-10 rounded-full glass-panel border border-glass-border flex items-center justify-center group/arrow">
              <ArrowRight size={16} className="text-secondary group-hover/arrow:scale-110 transition-transform" />
            </div>
            <span className="text-body-sm text-gradient-electric font-semibold whitespace-nowrap">CampusNetra</span>
            <div className="w-10 h-10 rounded-full glass-panel border border-glass-border flex items-center justify-center group/arrow">
              <ArrowRight size={16} className="text-secondary group-hover/arrow:scale-110 transition-transform" />
            </div>
            <div className="h-px w-20 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </div>
      </div>
    </section>
  )
}