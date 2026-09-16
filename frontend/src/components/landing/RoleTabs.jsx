import { useState } from 'react'
import { Shield, Wrench, Users, GraduationCap, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const ROLES = [
  {
    id: 'admin',
    label: 'Admin',
    icon: Shield,
    tagline: 'Full operational visibility',
    features: [
      'Campus-wide issue and work order oversight',
      'Predictive maintenance intelligence dashboard',
      'SLA configuration and compliance monitoring',
      'User management and role-based access control',
      'Digital twin floor plan management',
      'AI analytics and cost modelling reports',
    ],
    accentColor: 'secondary',
    glowColor: 'glow-secondary',
    badgeColor: 'bg-secondary/10 border-secondary/30 text-secondary',
    demo: {
      badge: 'Admin Console',
      badgeColor: 'bg-secondary/10 border-secondary/30 text-secondary',
      items: [
        { label: 'Total Issues', value: '247', trend: '+12% this month', up: true },
        { label: 'SLA Compliance', value: '91%', trend: '+3% vs last month', up: true },
        { label: 'Open Work Orders', value: '34', trend: '-8 from yesterday', up: false },
        { label: 'Assets Monitored', value: '512', trend: 'All facilities', up: true },
      ],
    },
  },
  {
    id: 'manager',
    label: 'Facility Manager',
    icon: Wrench,
    tagline: 'Operational efficiency at a glance',
    features: [
      'Team capacity and workload management',
      'Inspection round scheduling and compliance',
      'Work order board with Kanban view',
      'Asset health and maintenance scheduling',
      'SLA breach early-warning alerts',
      'Technician performance and time tracking',
    ],
    accentColor: 'amber',
    glowColor: 'glow-primary',
    badgeColor: 'bg-amber-500/10 border-amber-400/30 text-amber-400',
    demo: {
      badge: 'Manager View',
      badgeColor: 'bg-amber-500/10 border-amber-400/30 text-amber-400',
      items: [
        { label: 'Overdue Orders', value: '3', trend: '2 critical, 1 high', up: false },
        { label: 'Team Utilisation', value: '78%', trend: '7 of 9 active', up: true },
        { label: 'Pending Inspections', value: '6', trend: 'Due this week', up: false },
        { label: 'Avg Resolution', value: '4.2h', trend: 'Target: ≤ 6h', up: true },
      ],
    },
  },
  {
    id: 'technician',
    label: 'Technician',
    icon: Users,
    tagline: 'Work queue, clearly prioritised',
    features: [
      'Personal work order queue with priority order',
      'Step-by-step resolution instructions',
      'Photo and notes capture on-site',
      'Asset QR scan for instant context',
      'Time logging and handoff notes',
      'Offline-capable status updates',
    ],
    accentColor: 'cyan',
    glowColor: 'glow-cyan',
    badgeColor: 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400',
    demo: {
      badge: 'Technician Queue',
      badgeColor: 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400',
      items: [
        { label: 'My Open Orders', value: '5', trend: '1 overdue', up: false },
        { label: 'Resolved Today', value: '3', trend: 'Good pace', up: true },
        { label: 'On-site Now', value: 'Block C', trend: 'WO #2041', up: true },
        { label: 'Next Inspection', value: '2:30 PM', trend: 'Lab 204', up: true },
      ],
    },
  },
  {
    id: 'student',
    label: 'Student',
    icon: GraduationCap,
    tagline: 'Report issues, track resolution',
    features: [
      'Easy issue reporting with photo and location',
      'Track status of reported issues',
      'Lost & Found — report and search items',
      'Instant notifications when issue is resolved',
      'Anonymous reporting option available',
      'Simple, mobile-first interface',
    ],
    accentColor: 'emerald',
    glowColor: 'glow-emerald',
    badgeColor: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400',
    demo: {
      badge: 'Student Portal',
      badgeColor: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400',
      items: [
        { label: 'Issues Reported', value: '4', trend: '2 resolved', up: true },
        { label: 'Lost Items Posted', value: '1', trend: 'Pending match', up: true },
        { label: 'Last Update', value: '2h ago', trend: 'WO #1042 resolved', up: true },
        { label: 'Response Time', value: '< 6h', trend: 'Last 3 issues', up: true },
      ],
    },
  },
]

export function RoleTabs() {
  const [activeId, setActiveId] = useState('admin')
  const active = ROLES.find((r) => r.id === activeId)

  return (
    <section id="features" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/2 w-[400px] h-[250px] bg-spotlight-emerald opacity-30" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Sparkles size={14} className="text-secondary" />
            <span className="text-gradient-electric">Built for Every Role</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            One Platform, Every Perspective
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            CampusNetra adapts to who you are — each role gets exactly the right tools and information, nothing more.
          </p>
        </div>

        {/* Tab row with Framer Motion layout animation */}
        <div className="flex justify-center mb-10">
          <motion.div
            className="inline-flex glass-panel border border-glass-border p-1 gap-1 flex-wrap justify-center"
            layout
          >
            {ROLES.map(({ id, label, icon: Icon, accentColor }) => (
              <motion.button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                layoutId={`tab-${id}`}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-body-md font-medium transition-all duration-300 relative overflow-hidden',
                  activeId === id
                    ? 'bg-gradient-to-r from-secondary-400/20 to-primary/20 text-ink shadow-glow-secondary'
                    : 'text-ink-muted hover:text-ink hover:bg-surface/60',
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Icon size={16} className={clsx('transition-colors', activeId === id ? `text-${accentColor}-400` : 'text-ink-muted')} />
                {label}
                {/* Active indicator */}
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  initial={activeId !== id ? { opacity: 0, scale: 0 } : { opacity: 1, scale: 1 }}
                  animate={activeId === id ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  style={{ backgroundColor: `var(--c-${accentColor}-400)` }}
                />
              </motion.button>
            ))}
          </motion.div>
        </div>

        {/* Panel with AnimatePresence for smooth transitions */}
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.24, 0, 0.38, 1] }}
              className="grid lg:grid-cols-2 gap-10 items-start"
            >
              {/* Feature list */}
              <motion.div
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <div className="mb-6">
                  <span className={clsx('text-label-caps font-bold uppercase tracking-wider px-3 py-1 rounded-full border glass-panel', active.demo.badgeColor)}>
                    {active.label}
                  </span>
                  <p className="mt-4 text-headline-md text-ink font-semibold">{active.tagline}</p>
                </div>
                <ul className="space-y-3">
                  {active.features.map((f, idx) => (
                    <motion.li
                      key={f}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + idx * 0.05, duration: 0.3 }}
                      className="flex items-start gap-3 group"
                    >
                      <div className={clsx('mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300 group-hover:scale-110', `bg-${active.accentColor}-500/10 border-${active.accentColor}-400/30`)}>
                        <div className={clsx('w-2 h-2 rounded-full', `bg-${active.accentColor}-400`)} />
                      </div>
                      <span className="text-body-md text-ink-muted group-hover:text-ink transition-colors">{f}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              {/* Demo card */}
              <motion.div
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="widget p-6 glass-panel border border-glass-border relative overflow-hidden"
              >
                {/* Glow accent border */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', active.glowColor)} />

                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h3 className="text-headline-md text-ink font-semibold">{active.demo.badge}</h3>
                  <span className="text-body-sm text-ink-faint">Demo view</span>
                </div>
                <div className="grid grid-cols-2 gap-3 relative z-10">
                  {active.demo.items.map(({ label, value, trend, up }, idx) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.25 + idx * 0.05, type: 'spring', stiffness: 300 }}
                      className={clsx('rounded-xl p-4 glass-panel border border-glass-border transition-all duration-300 hover:shadow-glow-secondary', `bg-${active.accentColor}-500/5 border-${active.accentColor}-400/20`)}
                    >
                      <p className="text-body-sm text-ink-faint mb-1">{label}</p>
                      <p className="text-headline-md text-ink font-bold">{value}</p>
                      <p className={clsx('text-body-sm mt-1 font-medium', up ? 'text-success-text' : 'text-danger-text')}>{trend}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}