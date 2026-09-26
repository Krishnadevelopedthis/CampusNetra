import {
  GraduationCap, Building2, FlaskConical, Dumbbell, Utensils, Trees,
  Boxes, Radar, ShieldCheck, ListChecks, Workflow, Clock
} from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { accent } from '@/lib/accentColors'

const INSTITUTION_TYPES = [
  { icon: GraduationCap, label: 'Universities', color: 'secondary', description: 'Multi-campus management' },
  { icon: Building2, label: 'Colleges', color: 'primary', description: 'Faculty & student portals' },
  { icon: FlaskConical, label: 'Research Institutes', color: 'cyan', description: 'Lab & equipment tracking' },
  { icon: Dumbbell, label: 'Sports Academies', color: 'emerald', description: 'Venue & asset maintenance' },
  { icon: Utensils, label: 'Campus Dining', color: 'amber', description: 'Kitchen & facility ops' },
  { icon: Trees, label: 'Large Campuses', color: 'secondary', description: 'Distributed infrastructure' },
]

// Real, checkable claims about what the product actually does -- not
// invented usage numbers or compliance certifications nobody has audited.
// A prospective customer (a university's own IT/procurement team) will
// ask for the SOC 2 report or the customer count that used to sit here;
// neither existed, which is a real liability for an early-stage product
// being evaluated by an institution, not just a style problem.
const TRUST_METRICS = [
  { icon: Boxes, label: '9', sublabel: 'Connected Modules', color: 'secondary', glow: 'glow-secondary' },
  { icon: Radar, label: 'Live', sublabel: 'Digital Twin', color: 'primary', glow: 'glow-primary' },
  { icon: Workflow, label: 'AI', sublabel: 'Issue Triage', color: 'cyan', glow: 'glow-cyan' },
  { icon: ShieldCheck, label: 'RBAC', sublabel: 'Access Control', color: 'emerald', glow: 'glow-emerald' },
  { icon: ListChecks, label: 'Full', sublabel: 'Audit Trail', color: 'amber', glow: 'glow-amber' },
  { icon: Clock, label: 'Real-Time', sublabel: 'SLA Tracking', color: 'secondary', glow: 'glow-secondary' },
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
            <Boxes size={14} className="text-secondary" />
            <span className="text-gradient-electric">One Platform, Every Module</span>
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
          {TRUST_METRICS.map(({ icon: Icon, label, sublabel, color, glow }, idx) => {
            const a = accent(color)
            return (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15 + idx * 0.05, type: 'spring', stiffness: 300 }}
              whileHover={{ y: -4 }}
              className={clsx('widget p-4 text-center glass-panel border border-glass-border relative overflow-hidden group', a.glow)}
            >
              {/* Animated gradient border top */}
              <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r', a.from400, a.to500)} />

              <div className="relative z-10">
                <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center mx-auto mb-3 relative overflow-hidden', a.bg15, a.border30, a.text400)}>
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Icon size={20} />
                </div>
                <div className="text-gradient-electric text-headline-lg font-bold">{label}</div>
                <p className="text-body-sm text-ink-muted mt-0.5">{sublabel}</p>
                {/* Status beacon pulse */}
                <div className={clsx('status-beacon absolute top-2 right-2', a.bg20.replace('/20', ''))} />
              </div>
            </motion.div>
            )
          })}
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
            {INSTITUTION_TYPES.map(({ icon: Icon, label, color, description }, idx) => {
              const a = accent(color)
              return (
              <motion.div
                key={label}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.05, type: 'spring', stiffness: 300 }}
                whileHover={{ y: -8 }}
                className="widget p-5 flex flex-col items-center gap-3 text-center glass-panel border border-glass-border relative overflow-hidden group"
              >
                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', a.glow)} />

                <div className="relative z-10">
                  <div className={clsx('w-14 h-14 rounded-xl border flex items-center justify-center mb-3 relative overflow-hidden', a.bg15, a.border30)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <Icon size={24} className={clsx('relative z-10', a.text400)} />
                  </div>
                  <h4 className="text-body-md font-semibold text-ink group-hover:text-secondary transition-colors duration-300">{label}</h4>
                  <p className="text-body-sm text-ink-muted">{description}</p>
                </div>
              </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}