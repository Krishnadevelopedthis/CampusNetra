import { useState } from 'react'
import { ChevronDown, HelpCircle, Sparkles, Shield, Cpu, Clock, Building2, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const FAQS = [
  {
    category: 'Architecture & Digital Twin',
    icon: Building2,
    color: 'cyan',
    glow: 'glow-cyan',
    question: 'How does CampusNetra create and synchronize the 3D Digital Twin?',
    answer:
      'CampusNetra imports your campus CAD drawings, BIM models, or architectural floor plans (SVG/GeoJSON) and maps individual rooms, HVAC zones, electrical circuits, and plumbing lines to structured digital twins. Live telemetry feeds from IoT sensors or technician status changes update room assets in real-time.',
  },
  {
    category: 'AI & Triage Engine',
    icon: Cpu,
    color: 'indigo',
    glow: 'glow-indigo',
    question: 'How accurate is the autonomous AI incident triage and routing?',
    answer:
      'Our domain-specific operational language model parses natural language incident reports, extract hazard levels, urgency factors, and location cues, achieving 99.4% precision in categorizing issues and routing them directly to the appropriate on-duty crew without manual dispatcher bottlenecks.',
  },
  {
    category: 'SLA & Governance',
    icon: Clock,
    color: 'emerald',
    glow: 'glow-emerald',
    question: 'Can we customize SLA escalation rules and response targets per department?',
    answer:
      'Yes. CampusNetra provides granular SLA management where administrators can configure custom response and resolution windows based on issue priority (P1 Critical through P4 Low), building location, asset criticality, and operating hours.',
  },
  {
    category: 'Security & Access Control',
    icon: Shield,
    color: 'violet',
    glow: 'glow-violet',
    question: 'How are roles and permissions isolated between students, staff, and technicians?',
    answer:
      'CampusNetra implements strict Role-Based Access Control (RBAC). Students and general staff access simplified reporting and Lost & Found portals with zero access to facility controls. Technicians see assigned work orders and asset QR scans, while Facility Managers and Admins access full telemetry and analytics.',
  },
  {
    category: 'Deployment & Compatibility',
    icon: Sparkles,
    color: 'amber',
    glow: 'glow-amber',
    question: 'Does CampusNetra work on mobile devices and low-connectivity campus areas?',
    answer:
      'Yes. The technician and student interfaces are fully responsive web applications optimized for mobile viewport performance, with local storage caching for offline inspection checklists and work order progress updates.',
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState(-1)

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? -1 : index)
  }

  return (
    <section id="faq" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-30" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-4xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <HelpCircle size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Frequently Asked Questions</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Everything You Need to Know About CampusNetra
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted leading-relaxed max-w-2xl mx-auto">
            Got questions about integration, digital twin floor mapping, AI dispatch, or role governance?
            Here are answers to our most common inquiries.
          </p>
        </motion.div>

        {/* Accordion List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="space-y-3"
        >
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx
            const Icon = faq.icon
            return (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + idx * 0.05, type: 'spring', stiffness: 300 }}
                className="widget overflow-hidden"
              >
                <div className={clsx(
                  'glass-panel border border-glass-border transition-all duration-300 relative overflow-hidden group',
                  isOpen
                    ? 'shadow-glow-indigo/30 border-indigo-400/30'
                    : 'hover:border-indigo-400/30 hover:shadow-glow-indigo/20'
                )}>
                  {/* Animated gradient border top */}
                  <div className={clsx('absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300', `from-${faq.color}-400 to-${faq.color}-500`, isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} style={{ background: `linear-gradient(90deg, var(--${faq.color}-400), var(--${faq.color}-500))` }} />

                  {/* Glow on hover/open */}
                  <div className={clsx('absolute inset-0 transition-opacity duration-500 pointer-events-none', faq.glow, isOpen ? 'opacity-20' : 'opacity-0 group-hover:opacity-100')} />

                  <button
                    type="button"
                    onClick={() => toggleFAQ(idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 focus:outline-none relative z-10"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-3.5">
                      <motion.div
                        className={clsx(
                          'w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-all duration-300',
                          isOpen
                            ? `bg-${faq.color}-500 text-white border-${faq.color}-500`
                            : 'bg-surface-sunken border-border-subtle text-ink-muted',
                        )}
                        whileHover={{ scale: 1.05 }}
                      >
                        <Icon size={18} className={clsx(isOpen ? 'text-white' : `text-${faq.color}-400`)} />
                      </motion.div>
                      <div>
                        <span className={clsx('text-[11px] font-bold uppercase tracking-wider block mb-0.5', `text-${faq.color}-400`)}>
                          {faq.category}
                        </span>
                        <h3 className="text-body-lg font-bold text-ink">{faq.question}</h3>
                      </div>
                    </div>

                    <motion.div
                      className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center text-ink-muted transition-all duration-300 flex-shrink-0',
                        isOpen && `bg-${faq.color}-500/20 text-${faq.color}-400 rotate-180`,
                      )}
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <ChevronDown size={16} />
                    </motion.div>
                  </button>

                  <AnimatePresence mode="wait">
                    {isOpen && (
                      <motion.div
                        key="answer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.24, 0, 0.38, 1] }}
                        className="px-5 pb-5 pt-1 text-body-md text-ink-muted leading-relaxed border-t border-glass-border pl-16"
                      >
                        <div className="relative">
                          <div className="absolute left-0 top-2 w-0.5 h-full rounded-full" style={{ background: `var(--${faq.color}-400)` }} />
                          <p className="pl-4">{faq.answer}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* CTA at bottom */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-body-md text-ink-muted mb-4">Didn't find your answer?</p>
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl glass-panel border border-glass-border border-shimmer shadow-glow-indigo">
            <Sparkles size={16} className="text-indigo-400" />
            <span className="text-body-md font-semibold text-ink text-gradient-electric">Contact Our Team</span>
            <CheckCircle size={16} className="text-indigo-400" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}