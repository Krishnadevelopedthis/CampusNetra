import { Brain, AlertTriangle, ClipboardList, Layers, Activity, Search, BarChart3, Zap, Server, Database, Shield, Users, Globe } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { accent } from '@/lib/accentColors'

const NODES = [
  { icon: AlertTriangle, label: 'Issue Engine', color: 'secondary', accentColor: 'amber', glowColor: 'glow-secondary', description: 'Real-time incident intake & classification' },
  { icon: ClipboardList, label: 'Work Orders', color: 'cyan', accentColor: 'info', glowColor: 'glow-cyan', description: 'Automated routing & SLA tracking' },
  { icon: Layers, label: 'Digital Twin', color: 'primary', accentColor: 'secondary', glowColor: 'glow-primary', description: '3D campus visualization & asset mapping' },
  { icon: Activity, label: 'Predictive Engine', color: 'emerald', accentColor: 'success', glowColor: 'glow-emerald', description: 'AI-driven failure prediction & risk scoring' },
  { icon: Search, label: 'Lost & Found', color: 'amber', accentColor: 'primary', glowColor: 'glow-amber', description: 'Campus-wide item recovery portal' },
  { icon: BarChart3, label: 'Analytics Core', color: 'amber', accentColor: 'warning', glowColor: 'glow-amber', description: 'Operational insights & compliance reports' },
]

const CENTER_HUB = {
  icons: [
    { icon: Brain, label: 'AI Brain', color: 'secondary' },
    { icon: Server, label: 'Core API', color: 'cyan' },
    { icon: Database, label: 'Data Lake', color: 'primary' },
    { icon: Shield, label: 'Security', color: 'emerald' },
  ],
}

export function PlatformArchitecture() {
  return (
    <section className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-30" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Zap size={14} className="text-secondary" />
            <span className="text-gradient-electric">Architecture</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Connected Campus Operations
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            Every module connects to the central CampusNetra Intelligence engine,
            sharing state and data in real time.
          </p>
        </motion.div>

        {/* Architecture Diagram */}
        <div className="relative max-w-5xl mx-auto">
          {/* Connector lines from center to nodes (SVG) */}
          <svg className="absolute inset-0 -z-10 pointer-events-none" viewBox="0 0 800 400" preserveAspectRatio="none">
            <defs>
              <linearGradient id="connector-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(var(--c-secondary-400))" stopOpacity="0.3" />
                <stop offset="50%" stopColor="rgb(var(--c-primary-400))" stopOpacity="0.2" />
                <stop offset="100%" stopColor="rgb(var(--c-cyan-400))" stopOpacity="0.3" />
              </linearGradient>
              <linearGradient id="connector-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(var(--c-emerald-400))" stopOpacity="0.3" />
                <stop offset="50%" stopColor="rgb(var(--c-cyan-400))" stopOpacity="0.2" />
                <stop offset="100%" stopColor="rgb(var(--c-secondary-400))" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {/* Top row connectors */}
            <path d="M400,200 Q400,100 133,60" stroke="url(#connector-gradient)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
            <path d="M400,200 Q400,100 400,60" stroke="url(#connector-gradient)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
            <path d="M400,200 Q400,100 667,60" stroke="url(#connector-gradient)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
            {/* Bottom row connectors */}
            <path d="M400,200 Q400,300 133,340" stroke="url(#connector-gradient-2)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
            <path d="M400,200 Q400,300 400,340" stroke="url(#connector-gradient-2)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
            <path d="M400,200 Q400,300 667,340" stroke="url(#connector-gradient-2)" strokeWidth="1.5" fill="none" strokeDasharray="4,4" className="animate-dash" />
          </svg>

          {/* Center Hub */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 300 }}
            className="relative flex justify-center mb-8"
          >
            <div className="relative">
              {/* Pulse rings */}
              <div className="absolute inset-0 -inset-4 rounded-full border border-secondary/30 animate-ping opacity-75" />
              <div className="absolute inset-0 -inset-8 rounded-full border border-primary-400/20 animate-ping opacity-50" style={{ animationDelay: '700ms', animationDuration: '3s' }} />
              <div className="absolute inset-0 -inset-12 rounded-full border border-cyan-400/15 animate-ping opacity-40" style={{ animationDelay: '1400ms', animationDuration: '4s' }} />

              <div className="relative flex items-center gap-3 px-8 py-5 rounded-2xl glass-panel border border-glass-border shadow-glow-secondary shadow-glow-primary">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary-400 to-primary flex items-center justify-center shadow-glow-secondary">
                  <Brain size={28} className="text-white" />
                </div>
                <div>
                  <p className="text-headline-sm text-ink font-bold">CampusNetra Intelligence</p>
                  <p className="text-body-sm text-ink-muted">Central operational brain</p>
                </div>
              </div>

              {/* Mini capability badges around hub */}
              <div className="absolute -top-3 -right-6 flex flex-col gap-1.5">
                {CENTER_HUB.icons.map(({ icon: Icon, label, color }, idx) => { const a = accent(color); return (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.08, type: 'spring', stiffness: 300 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-glass-border shadow-glow-secondary/20"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center', a.bg20, a.text400)}>
                      <Icon size={10} />
                    </div>
                    <span className="text-[11px] font-semibold text-ink">{label}</span>
                  </motion.div>
                )})}
              </div>
            </div>
          </motion.div>

          {/* Connected modules - Top Row */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
            className="grid grid-cols-3 gap-4 mb-8"
          >
            {NODES.slice(0, 3).map(({ icon: Icon, label, color, accentColor, glowColor, description }, idx) => { const a = accent(color); return (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.1, type: 'spring', stiffness: 300 }}
                whileHover={{ y: -8 }}
                className="widget p-5 glass-panel border border-glass-border relative overflow-hidden group"
              >
                {/* Animated gradient border top */}
                <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r', a.from400, a.to500)} />

                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', glowColor)} />

                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className={clsx('w-14 h-14 rounded-xl border flex items-center justify-center mb-4 relative overflow-hidden', a.bg20, a.border30)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <Icon size={24} className={clsx('relative z-10', a.text400)} />
                  </div>
                  <h3 className="text-headline-sm text-ink font-semibold mb-1 group-hover:text-secondary transition-colors duration-300">{label}</h3>
                  <p className="text-body-sm text-ink-muted leading-relaxed">{description}</p>
                </div>
              </motion.div>
            )})}
          </motion.div>

          {/* Connected modules - Bottom Row */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
            className="grid grid-cols-3 gap-4"
          >
            {NODES.slice(3, 6).map(({ icon: Icon, label, color, accentColor, glowColor, description }, idx) => { const a = accent(color); return (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + idx * 0.1, type: 'spring', stiffness: 300 }}
                whileHover={{ y: -8 }}
                className="widget p-5 glass-panel border border-glass-border relative overflow-hidden group"
              >
                {/* Animated gradient border top */}
                <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r', a.from400, a.to500)} />

                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', glowColor)} />

                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className={clsx('w-14 h-14 rounded-xl border flex items-center justify-center mb-4 relative overflow-hidden', a.bg20, a.border30)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <Icon size={24} className={clsx('relative z-10', a.text400)} />
                  </div>
                  <h3 className="text-headline-sm text-ink font-semibold mb-1 group-hover:text-secondary transition-colors duration-300">{label}</h3>
                  <p className="text-body-sm text-ink-muted leading-relaxed">{description}</p>
                </div>
              </motion.div>
            )})}
          </motion.div>

          {/* Data flow indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-center"
          >
            {[
              { label: 'Real-time Sync', icon: Zap, color: 'amber' },
              { label: 'Bidirectional', icon: Globe, color: 'cyan' },
              { label: 'Event Driven', icon: Activity, color: 'emerald' },
              { label: 'Secure', icon: Shield, color: 'secondary' },
            ].map(({ label, icon: Icon, color }, idx) => { const a = accent(color); return (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center', a.bg15, a.border30, a.text400)}>
                  <Icon size={18} />
                </div>
                <span className="text-body-sm font-medium text-ink">{label}</span>
              </div>
            )})}
          </motion.div>
        </div>
      </div>
    </section>
  )
}