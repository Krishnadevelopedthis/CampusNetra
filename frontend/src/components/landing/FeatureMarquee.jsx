import { motion } from 'framer-motion'
import clsx from 'clsx'
import { accent } from '@/lib/accentColors'

const ROW_1 = [
  'Issue Management',
  'Work Order Queue',
  'SLA Compliance',
  'Digital Twin',
  'AI Classification',
  'Predictive Maintenance',
  'Scheduled Inspections',
  'Lost & Found',
]

const ROW_2 = [
  'Role-Based Access',
  'Floor Plan Editor',
  'Asset Lifecycle',
  'Cost Modelling',
  'Real-Time Replay',
  'Mobile-First Design',
  'Audit Logging',
  'Event Timeline',
]

const ACCENT_COLORS = ['secondary', 'primary', 'cyan', 'emerald', 'amber', 'secondary', 'primary', 'cyan']

export function FeatureMarquee() {
  return (
    <section className="py-12 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-30" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-25" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-15 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        <div className="space-y-3">
          {/* Row 1 — scroll left */}
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {/* Double list for seamless loop */}
            {[...ROW_1, ...ROW_1].map((item, i) => (
              <motion.span
                key={`row1-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 300 }}
                whileHover={{ scale: 1.05 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-glass-border text-body-sm font-medium flex-shrink-0 shadow-glow-secondary/20"
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full', accent(ACCENT_COLORS[i % ACCENT_COLORS.length]).text400.replace('text-', 'bg-'))} />
                <span className="text-gradient-electric">{item}</span>
              </motion.span>
            ))}
          </div>

          {/* Row 2 — scroll right */}
          <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
            {[...ROW_2, ...ROW_2].map((item, i) => (
              <motion.span
                key={`row2-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 300 }}
                whileHover={{ scale: 1.05 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-glass-border text-body-sm font-medium flex-shrink-0 shadow-glow-primary/20"
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full', accent(ACCENT_COLORS[(i + 3) % ACCENT_COLORS.length]).text400.replace('text-', 'bg-'))} />
                <span className="text-gradient-cyber">{item}</span>
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}