import { Zap, Brain, Layers, TrendingUp, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

const BENEFITS = [
  {
    icon: Zap,
    title: 'Resolve Faster',
    description: 'Cut triage time with automated AI classification, instant technician routing, and structured issue details.',
    accentColor: 'amber',
    glowColor: 'glow-violet',
    gradient: 'from-amber-500 to-amber-600',
  },
  {
    icon: Brain,
    title: 'Manage Smarter',
    description: 'Gain full visibility into team workloads, open work orders, and SLA compliance across your entire campus.',
    accentColor: 'indigo',
    glowColor: 'glow-indigo',
    gradient: 'from-indigo-500 to-violet-500',
  },
  {
    icon: Layers,
    title: 'See Everything',
    description: 'Explore your campus through interactive 3D digital twins — see asset health and active issues floor by floor.',
    accentColor: 'cyan',
    glowColor: 'glow-cyan',
    gradient: 'from-cyan-500 to-indigo-500',
  },
  {
    icon: TrendingUp,
    title: 'Plan Ahead',
    description: 'Shift from reactive firefighting to predictive maintenance with AI-driven risk scoring and trend analysis.',
    accentColor: 'emerald',
    glowColor: 'glow-emerald',
    gradient: 'from-emerald-500 to-teal-500',
  },
]

export function Benefits() {
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
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Why CampusNetra</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Transform How Your Campus Operates
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            Measurable improvements across every layer of campus facilities management.
          </p>
        </motion.div>

        {/* 4 Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map(({ icon: Icon, title, description, accentColor, glowColor, gradient }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.1, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
              whileHover={{ y: -8 }}
              className="widget p-6 flex flex-col justify-between glass-panel border border-glass-border relative overflow-hidden group"
            >
              {/* Animated gradient border top */}
              <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300', `bg-gradient-to-r ${gradient}`)} />

              {/* Glow on hover */}
              <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', glowColor)} />

              <div className="relative z-10">
                <div className={clsx('w-12 h-12 rounded-xl border flex items-center justify-center mb-5 relative overflow-hidden', `bg-gradient-to-br ${gradient}/20`, `border-${accentColor}-400/30`)}>
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Icon size={22} className={clsx('relative z-10', `text-${accentColor}-400`)} />
                </div>
                <h3 className="text-headline-md text-ink font-semibold mb-2 group-hover:text-indigo-400 transition-colors duration-300">{title}</h3>
                <p className="text-body-md text-ink-muted leading-relaxed">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}