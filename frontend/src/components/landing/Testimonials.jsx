import { Star, MessageSquare, Users, GraduationCap, Wrench, Shield, ArrowLeft, ArrowRight } from 'lucide-react'
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import clsx from 'clsx'

const DEMO_FEEDBACK = [
  {
    role: 'Facility Director',
    institution: 'Demo University',
    quote: 'CampusNetra brought complete visibility to our 14 buildings. What used to take days of phone calls now resolves in hours through the automated work order queue.',
    author: 'Campus Operations Lead',
    initials: 'CO',
    accentColor: 'indigo',
    icon: GraduationCap,
  },
  {
    role: 'Head of Maintenance',
    institution: 'Technical College (Demo)',
    quote: 'The digital twin view alone changed how we coordinate our technicians. We can see where issues are clustered before sending a team out.',
    author: 'Maintenance Coordinator',
    initials: 'MC',
    accentColor: 'cyan',
    icon: Wrench,
  },
  {
    role: 'Student Council President',
    institution: 'University Campus (Demo)',
    quote: 'Reporting broken equipment in our labs is finally effortless. We get actual updates when things are fixed instead of wondering if anyone noticed.',
    author: 'Student Representative',
    initials: 'SR',
    accentColor: 'violet',
    icon: Shield,
  },
  {
    role: 'IT Operations Lead',
    institution: 'Research Institute (Demo)',
    quote: 'The predictive maintenance alerts have prevented three major server room incidents this quarter alone. ROI is undeniable.',
    author: 'IT Operations Director',
    initials: 'ID',
    accentColor: 'emerald',
    icon: Users,
  },
  {
    role: 'Campus Security Chief',
    institution: 'Metropolitan University (Demo)',
    quote: 'Real-time issue tracking and automated dispatch means our response time dropped from 45 minutes to under 8 minutes.',
    author: 'Security Operations Chief',
    initials: 'SC',
    accentColor: 'amber',
    icon: Shield,
  },
  {
    role: 'Sustainability Officer',
    institution: 'Green Campus Initiative (Demo)',
    quote: 'Energy dashboards and occupancy analytics helped us cut facility waste by 23% in the first year.',
    author: 'Sustainability Lead',
    initials: 'SL',
    accentColor: 'cyan',
    icon: GraduationCap,
  },
]

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-500',
  'from-cyan-500 to-blue-500',
  'from-violet-500 to-purple-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-cyan-500 to-emerald-500',
]

export function Testimonials() {
  const scrollContainer = useRef(null)

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
            <MessageSquare size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Feedback</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Designed for the Realities of Campus Life
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            From facility managers to students — built around real campus workflows.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-ink-faint">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            Illustrative user scenarios
          </div>
        </motion.div>

        {/* Horizontal Scrolling Testimonials Marquee */}
        <div className="relative">
          {/* Navigation arrows */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              <button
                onClick={() => scrollContainer.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                className="p-2 rounded-full glass-panel border border-glass-border text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                aria-label="Scroll testimonials left"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onClick={() => scrollContainer.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                className="p-2 rounded-full glass-panel border border-glass-border text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                aria-label="Scroll testimonials right"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div
            ref={scrollContainer}
            className="flex gap-6 pb-8 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {DEMO_FEEDBACK.map(({ role, institution, quote, author, initials, accentColor, icon: Icon }, idx) => (
              <motion.div
                key={author}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.1, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
                whileHover={{ y: -8 }}
                className="widget p-6 flex flex-col justify-between glass-panel border border-glass-border relative overflow-hidden group snap-center flex-shrink-0 w-[360px] md:w-[400px]"
              >
                {/* Animated gradient border top */}
                <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300', `from-${accentColor}-400 via-${accentColor}-400 to-${accentColor}-500`)} style={{ background: `linear-gradient(90deg, var(--${accentColor}-400), var(--${accentColor}-400))` }} />

                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', `glow-${accentColor}`)} />

                <div className="relative z-10">
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} className="fill-warning text-warning" />
                    ))}
                  </div>

                  {/* Quote */}
                  <p className="text-body-md text-ink-muted leading-relaxed italic mb-6 relative">
                    <span className="text-4xl text-indigo-400/20 font-serif leading-none absolute -top-3 -left-2">"</span>
                    {quote}
                  </p>
                </div>

                <div className="border-t border-glass-border pt-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-obsidian-950 dark:border-obsidian-50 flex items-center justify-center text-body-sm font-bold text-white flex-shrink-0"
                         style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                      {initials}
                    </div>
                    <div>
                      <p className="text-body-md font-semibold text-ink">{author}</p>
                      <p className="text-body-sm text-ink-faint">{role} · {institution}</p>
                    </div>
                  </div>
                  {/* Role badge */}
                  <div className="mt-3 flex items-center gap-2">
                    <Icon size={12} className={clsx(`text-${accentColor}-400`)} />
                    <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">{role}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Scroll gradient indicators */}
          <div className="absolute inset-y-0 right-0 w-24 pointer-events-none bg-gradient-to-r from-transparent to-surface-base" />
          <div className="absolute inset-y-0 left-0 w-24 pointer-events-none bg-gradient-to-l from-transparent to-surface-base" />
        </div>
      </div>
    </section>
  )
}