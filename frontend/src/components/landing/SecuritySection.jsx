import { ShieldCheck, Lock, FileText, Sparkles, Users, Eye, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

const PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Role-Based Access Control',
    description: 'Fine-grained permissions for Admins, Facility Managers, Technicians, and Students — each user only sees what they are authorised to access.',
    accentColor: 'indigo',
    glowColor: 'glow-indigo',
  },
  {
    icon: Lock,
    title: 'Secure Authentication',
    description: 'JWT-based stateless authentication, bcrypt password hashing, secure cookie storage, and full session management.',
    accentColor: 'violet',
    glowColor: 'glow-violet',
  },
  {
    icon: FileText,
    title: 'Comprehensive Audit Trail',
    description: 'Every action — issue status change, work order assignment, inspection completion — is logged with timestamp and user ID.',
    accentColor: 'cyan',
    glowColor: 'glow-cyan',
  },
]

export function SecuritySection() {
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
            <span className="text-gradient-electric">Enterprise Trust</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Built with Security & Governance in Mind
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            CampusNetra provides the controls, auditability, and access policies your institution requires.
          </p>
        </motion.div>

        {/* 3 Pillars */}
        <div className="grid md:grid-cols-3 gap-8">
          {PILLARS.map(({ icon: Icon, title, description, accentColor, glowColor }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.1, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
              whileHover={{ y: -8 }}
              className="widget p-6 glass-panel border border-glass-border relative overflow-hidden group"
            >
              {/* Animated gradient border top */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Glow on hover */}
              <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', glowColor)} />

              <div className="relative z-10">
                <div className={clsx('w-12 h-12 rounded-xl border flex items-center justify-center mb-5 relative overflow-hidden', `bg-gradient-to-br from-${accentColor}-500/20 to-${accentColor}-400/10`, `border-${accentColor}-400/30`)}>
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Icon size={22} className={clsx('relative z-10', `text-${accentColor}-400`)} />
                </div>
                <h3 className="text-headline-md text-ink font-semibold mb-2 group-hover:text-indigo-400 transition-colors duration-300">{title}</h3>
                <p className="text-body-md text-ink-muted leading-relaxed">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Compliance badges row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-4"
        >
          {[
            { label: 'SOC 2 Type II', icon: CheckCircle, color: 'emerald' },
            { label: 'ISO 27001', icon: ShieldCheck, color: 'indigo' },
            { label: 'GDPR Compliant', icon: FileText, color: 'violet' },
            { label: 'FERPA Ready', icon: Users, color: 'cyan' },
            { label: 'Audit Logs', icon: Eye, color: 'amber' },
          ].map((badge, idx) => (
            <motion.div
              key={badge.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + idx * 0.05, type: 'spring', stiffness: 300 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass-panel border border-glass-border"
              whileHover={{ scale: 1.02 }}
            >
              <badge.icon size={14} className={clsx(`text-${badge.color}-400`)} />
              <span className="text-body-sm font-medium text-ink-muted">{badge.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}