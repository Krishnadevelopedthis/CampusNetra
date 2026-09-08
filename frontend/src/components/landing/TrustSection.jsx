import {
  GraduationCap, Building2, FlaskConical, Dumbbell, Utensils, Trees,
  Users, Award, TrendingUp, Shield, Globe, Zap
} from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

const INSTITUTION_TYPES = [
  { icon: GraduationCap, label: 'Universities', color: 'indigo', description: 'Multi-campus management' },
  { icon: Building2, label: 'Colleges', color: 'violet', description: 'Faculty & student portals' },
  { icon: FlaskConical, label: 'Research Institutes', color: 'cyan', description: 'Lab & equipment tracking' },
  { icon: Dumbbell, label: 'Sports Academies', color: 'emerald', description: 'Venue & asset maintenance' },
  { icon: Utensils, label: 'Campus Dining', color: 'amber', description: 'Kitchen & facility ops' },
  { icon: Trees, label: 'Large Campuses', color: 'indigo', description: 'Distributed infrastructure' },
]

const TRUST_METRICS = [
  { icon: Users, label: '50+', sublabel: 'Institutions', color: 'indigo', glow: 'glow-indigo' },
  { icon: Award, label: '99.4%', sublabel: 'AI Precision', color: 'violet', glow: 'glow-violet' },
  { icon: TrendingUp, label: '40%', sublabel: 'Faster Resolution', color: 'cyan', glow: 'glow-cyan' },
  { icon: Shield, label: 'SOC 2', sublabel: 'Certified', color: 'emerald', glow: 'glow-emerald' },
  { icon: Globe, label: 'Global', sublabel: 'Deployment Ready', color: 'amber', glow: 'glow-amber' },
  { icon: Zap, label: '<200ms', sublabel: 'API Latency', color: 'indigo', glow: 'glow-indigo' },
]

const DEMO_INSTITUTIONS = [
  { name: 'Metro State University', type: 'University', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=metro-state', color: 'indigo' },
  { name: 'Tech Valley College', type: 'College', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=tech-valley', color: 'violet' },
  { name: 'Quantum Research Institute', type: 'Research', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=quantum-research', color: 'cyan' },
  { name: 'Apex Sports Academy', type: 'Sports', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=apex-sports', color: 'emerald' },
  { name: 'Campus Dining Services', type: 'Dining', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=campus-dining', color: 'amber' },
  { name: 'Greenfield Mega Campus', type: 'Large Campus', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=greenfield', color: 'indigo' },
]

export function TrustSection() {
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
            <Award size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Trusted by Leading Institutions</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Built for Modern Campus Operations
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            CampusNetra powers facilities management across universities, colleges, research institutes, and large campuses worldwide.
          </p>
        </motion.div>

        {/* Trust Metrics Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-16"
        >
          {TRUST_METRICS.map(({ icon: Icon, label, sublabel, color, glow }, idx) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15 + idx * 0.05, type: 'spring', stiffness: 300 }}
              whileHover={{ y: -4 }}
              className={clsx('widget p-4 text-center glass-panel border border-glass-border relative overflow-hidden group', glow)}
            >
              {/* Animated gradient border top */}
              <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300', `from-${color}-400 to-${color}-500`)} style={{ background: `linear-gradient(90deg, var(--${color}-400), var(--${color}-500))` }} />

              <div className="relative z-10">
                <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center mx-auto mb-3 relative overflow-hidden', `bg-${color}-500/15`, `border-${color}-400/30`, `text-${color}-400`)}>
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Icon size={20} />
                </div>
                <div className="text-gradient-electric text-headline-lg font-bold">{label}</div>
                <p className="text-body-sm text-ink-muted mt-0.5">{sublabel}</p>
                {/* Status beacon pulse */}
                <div className="status-beacon absolute top-2 right-2" style={{ background: `var(--${color}-500)` }} />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Institution Types */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="mb-16"
        >
          <h3 className="text-center text-label-caps text-ink-faint uppercase tracking-widest mb-8">Designed For Every Campus Type</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {INSTITUTION_TYPES.map(({ icon: Icon, label, color, description }, idx) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.05, type: 'spring', stiffness: 300 }}
                whileHover={{ y: -8 }}
                className="widget p-5 flex flex-col items-center gap-3 text-center glass-panel border border-glass-border relative overflow-hidden group"
              >
                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', `glow-${color}`)} />

                <div className="relative z-10">
                  <div className={clsx('w-14 h-14 rounded-xl border flex items-center justify-center mb-3 relative overflow-hidden', `bg-${color}-500/15`, `border-${color}-400/30`)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <Icon size={24} className={clsx('relative z-10', `text-${color}-400`)} />
                  </div>
                  <h4 className="text-body-md font-semibold text-ink group-hover:text-indigo-400 transition-colors duration-300">{label}</h4>
                  <p className="text-body-sm text-ink-muted">{description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Avatar Stack - Demo Institutions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-headline-md text-ink font-semibold">Active CampusNetra Deployments</h3>
              <p className="text-body-sm text-ink-muted mt-0.5">Illustrative institutions powered by CampusNetra</p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-gradient-cyber">Live Demo Data</span>
            </div>
          </div>

          <div className="avatar-stack" style={{ '--avatar-count': 6 }}>
            {DEMO_INSTITUTIONS.map(({ name, type, avatar, color }, idx) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, x: idx * -20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.45 + idx * 0.05, type: 'spring', stiffness: 300 }}
                className="relative"
                style={{ zIndex: 6 - idx }}
                title={`${name} — ${type}`}
              >
                <div className="w-12 h-12 rounded-full border-2 border-obsidian-950 dark:border-obsidian-50 bg-gradient-to-br overflow-hidden shadow-lg ring-1 ring-inset">
                  <img src={avatar} alt={name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-obsidian-950 dark:border-obsidian-50 flex items-center justify-center text-[10px] font-bold" style={{ background: `var(--${color}-500)` }}>
                  <Shield size={10} className="text-white" />
                </div>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.75, type: 'spring', stiffness: 300 }}
              className="w-12 h-12 rounded-full border-2 border-obsidian-950 dark:border-obsidian-50 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center shadow-lg ring-1 ring-inset"
              title="50+ Institutions"
            >
              <span className="text-body-sm font-bold text-indigo-400">50+</span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}