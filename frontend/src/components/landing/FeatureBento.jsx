import {
  AlertTriangle,
  ClipboardList,
  Clock,
  Layers,
  Brain,
  Activity,
  ClipboardCheck,
  Search,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import clsx from 'clsx'

const FEATURES = [
  {
    id: 'issue',
    icon: AlertTriangle,
    title: 'Precision Issue Management',
    description:
      'Structured digital issue reporting with geo-spatial room tagging, multi-photo attachments, automatic severity triage, and complete audit history.',
    badge: 'Core Engine',
    iconColor: 'text-warning-text',
    iconBg: 'bg-warning-bg border-warning-border',
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-surface-sunken/80 border border-border-subtle flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <span className="font-semibold text-ink">Water Surge · Lab 304</span>
        </div>
        <span className="text-[11px] font-mono text-warning-text bg-warning-bg px-2 py-0.5 rounded border border-warning-border font-bold">
          P1 HIGH
        </span>
      </div>
    ),
  },
  {
    id: 'sla',
    icon: Clock,
    title: 'Adaptive SLA Tracking',
    description:
      'Dynamic SLA engines with real-time countdown timers, early-warning breach prevention, and automated managerial escalation.',
    badge: 'Real-Time',
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-surface-sunken/80 border border-border-subtle flex items-center justify-between text-[12px]">
        <span className="text-ink-muted">Time to Target SLA:</span>
        <span className="font-mono font-bold text-success-text">00:14:22</span>
      </div>
    ),
  },
  {
    id: 'workorders',
    icon: ClipboardList,
    title: 'Automated Work Orders',
    description:
      'Turn reports into actionable technician work orders with skill matching, priority scheduling, and Kanban tracking boards.',
    badge: 'Dispatch',
    iconColor: 'text-info-text',
    iconBg: 'bg-info-bg border-info-border',
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-surface-sunken/80 border border-border-subtle flex items-center justify-between text-[12px]">
        <span className="text-ink-muted">Assigned Crew:</span>
        <span className="font-semibold text-ink">HVAC Emergency Team A</span>
      </div>
    ),
  },
  {
    id: 'twin',
    icon: Layers,
    title: 'Spatial 3D Digital Twin',
    description:
      'Explore CAD blueprint overlays with live asset health indicators, operational telemetry, and instant anomaly isolation.',
    badge: 'Interactive',
    iconColor: 'text-secondary',
    iconBg: 'bg-secondary-50 dark:bg-secondary-900/30 border-secondary-300 dark:border-secondary-600',
    highlight: true,
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-ai-bg border border-ai-border flex items-center justify-between text-[12px]">
        <span className="text-secondary font-semibold">CAD Blueprint Synced</span>
        <span className="font-mono text-[11px] text-secondary font-bold">14 BUILDINGS ACTIVE</span>
      </div>
    ),
  },
  {
    id: 'ai',
    icon: Brain,
    title: 'Autonomous AI Triage',
    description:
      'Natural language analysis that extracts emergency severity, routes to on-duty specialists, and generates emergency checklists in milliseconds.',
    badge: 'AI v2.4',
    iconColor: 'text-secondary',
    iconBg: 'bg-ai-bg border-ai-border',
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-surface-sunken/80 border border-border-subtle flex items-center justify-between text-[12px]">
        <span className="text-ink-muted">Confidence:</span>
        <span className="font-mono font-bold text-secondary">99.4% Match</span>
      </div>
    ),
  },
  {
    id: 'predictive',
    icon: Activity,
    title: 'Predictive Health & Telemetry',
    description:
      'Continuous operational monitoring to catch asset degradation weeks before total failure occurs.',
    badge: 'IoT Ready',
    iconColor: 'text-success-text',
    iconBg: 'bg-success-bg border-success-border',
    preview: (
      <div className="mt-4 p-3 rounded-xl bg-surface-sunken/80 border border-border-subtle flex items-center justify-between text-[12px]">
        <span className="text-ink-muted">Health Index:</span>
        <span className="font-mono font-bold text-success-text">98.8% Optimal</span>
      </div>
    ),
  },
  {
    id: 'inspections',
    icon: ClipboardCheck,
    title: 'Scheduled Audit Rounds',
    description:
      'Configurable digital inspection checklists with photo proof requirements, QR checkpoint validation, and compliance grading.',
    badge: 'ISO Compliant',
    iconColor: 'text-ink-muted',
    iconBg: 'bg-neutral-bg border-border',
  },
  {
    id: 'lostfound',
    icon: Search,
    title: 'Campus Lost & Found',
    description:
      'Self-service student portal for reporting and claiming lost campus items with image matching and automated verification claims.',
    badge: 'Student Portal',
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Executive Telemetry Dashboards',
    description:
      'Holistic operations analytics with cross-facility trend charts, technician performance breakdowns, and labor savings audits.',
    badge: 'Executive',
    iconColor: 'text-warning-text',
    iconBg: 'bg-warning-bg border-warning-border',
  },
]

export function FeatureBento() {
  return (
    <section id="platform" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/3 w-[600px] h-[400px] bg-spotlight-primary opacity-60" />
        <div className="absolute top-1/2 right-1/4 w-[500px] h-[350px] bg-spotlight-secondary opacity-50" />
        <div className="absolute bottom-1/4 left-1/2 w-[400px] h-[300px] bg-spotlight-cyan opacity-40" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-30 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-3">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Modular Enterprise Architecture</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Nine Interconnected Modules. Zero Data Silos.
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted leading-relaxed">
            Every module communicates seamlessly through the central CampusNetra telemetry core,
            providing synchronized visibility across students, technicians, and leadership.
          </p>
        </div>

        {/* 21st.dev Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon
            const isDigitalTwin = feature.id === 'twin'
            const isIssue = feature.id === 'issue'

            return (
              <div
                key={feature.id}
                className={clsx(
                  'widget p-6 bg-surface flex flex-col justify-between transition-all duration-500 group hover:shadow-glow-indigo relative overflow-hidden glass-panel border',
                  isDigitalTwin && 'lg:col-span-2 border-indigo-500/30 ring-1 ring-indigo-400/20 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5',
                  isIssue && 'lg:col-span-2 border-indigo-500/30',
                  !isDigitalTwin && !isIssue && 'border-border-subtle hover:border-indigo-400/50 dark:hover:border-indigo-400/30',
                )}
                style={{
                  animationDelay: `${idx * 50}ms`,
                  animation: 'fade-in 500ms ease-out both',
                }}
              >
                {/* Animated Gradient Top Border */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Card Glow Header */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm relative overflow-hidden', feature.iconBg)}>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <Icon size={18} className={clsx(feature.iconColor, 'relative z-10')} />
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full glass-panel border border-glass-border text-ink-muted group-hover:text-secondary group-hover:border-indigo-400/50 transition-all duration-300">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-headline-md text-ink font-bold group-hover:text-secondary transition-colors duration-300 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-body-md text-ink-muted leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                {/* Preview / Footer */}
                {feature.preview ? (
                  feature.preview
                ) : (
                  <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] text-ink-faint">
                    <span className="text-gradient-emerald font-medium">Synchronized Live</span>
                    <ArrowRight size={13} className="text-ink-faint group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-300" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}