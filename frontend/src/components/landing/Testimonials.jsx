import { MessageSquare, GraduationCap, Wrench, Shield, Users, ArrowLeft, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import { accent } from '@/lib/accentColors'

// These used to be a "Testimonials" section: named authors, star ratings,
// and fabricated specific outcomes ("prevented three server room
// incidents", "response time dropped from 45 to 8 minutes") attributed to
// invented people at invented institutions -- presented as if they were
// real customer reviews. That's a real problem for an early-stage product
// (a university evaluating this for procurement would take those numbers
// at face value), not just a style one. Reframed as honest, unattributed
// use-case scenarios instead: what each role actually does in the app,
// with no named author, no star rating, and no invented metric standing
// in for a result nobody has actually measured yet.
const USE_CASES = [
  {
    role: 'Facility Director',
    scenario: 'Managing issues and work orders across every building from one queue, instead of a separate spreadsheet or phone chain per department.',
    icon: GraduationCap,
    accentColor: 'secondary',
  },
  {
    role: 'Maintenance Technician',
    scenario: 'Seeing exactly where an assigned job is on the digital twin before heading out, instead of hunting for a room number from a text message.',
    icon: Wrench,
    accentColor: 'cyan',
  },
  {
    role: 'Student',
    scenario: 'Reporting a broken fixture with a photo in under a minute, then getting a real status update instead of wondering if anyone saw it.',
    icon: Shield,
    accentColor: 'primary',
  },
  {
    role: 'IT / Facilities Lead',
    scenario: 'Getting a predictive maintenance flag on an asset trending toward failure, before it turns into an unplanned outage.',
    icon: Users,
    accentColor: 'emerald',
  },
]

const AVATAR_COLORS = [
  'bg-gradient-to-br from-secondary-400 to-primary',
  'bg-gradient-to-br from-cyan-500 to-blue-500',
  'bg-gradient-to-br from-primary-500 to-primary-600',
  'bg-gradient-to-br from-emerald-500 to-teal-500',
]

export function Testimonials() {
  const scrollContainer = useRef(null)
  const [isPaused, setIsPaused] = useState(false)

  // Auto-advance on all devices (not just desktop) — pauses while the
  // visitor is actually touching/hovering it, and respects
  // prefers-reduced-motion rather than forcing motion on everyone.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (isPaused) return
    const el = scrollContainer.current
    if (!el) return
    const id = setInterval(() => {
      if (!el) return
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8
      el.scrollTo(atEnd ? { left: 0, behavior: 'smooth' } : { left: el.scrollLeft + 416, behavior: 'smooth' })
    }, 3200)
    return () => clearInterval(id)
  }, [isPaused])

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
            <MessageSquare size={14} className="text-secondary" />
            <span className="text-gradient-electric">How It's Used</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Designed for the Realities of Campus Life
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto">
            From facility directors to students — built around real campus workflows.
          </p>
        </motion.div>

        {/* Horizontal Scrolling Use-Case Cards */}
        <div className="relative">
          {/* Navigation arrows */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              <button
                onClick={() => scrollContainer.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                className="p-2 rounded-full glass-panel border border-glass-border text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                aria-label="Scroll left"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onClick={() => scrollContainer.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                className="p-2 rounded-full glass-panel border border-glass-border text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                aria-label="Scroll right"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div
            ref={scrollContainer}
            className="flex gap-6 pb-8 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
            style={{ scrollSnapType: 'x mandatory' }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setTimeout(() => setIsPaused(false), 2500)}
          >
            {USE_CASES.map(({ role, scenario, icon: Icon, accentColor }, idx) => {
              const a = accent(accentColor)
              return (
              <motion.div
                key={role}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.1, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
                whileHover={{ y: -8 }}
                className="widget p-6 flex flex-col justify-between glass-panel border border-glass-border relative overflow-hidden group snap-center flex-shrink-0 w-[360px] md:w-[400px]"
              >
                {/* Animated gradient border top */}
                <div className={clsx('absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r', a.from400, a.to500)} />

                {/* Glow on hover */}
                <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', a.glow)} />

                <div className="relative z-10">
                  <div className={clsx('w-10 h-10 rounded-full border-2 border-obsidian-950 dark:border-obsidian-50 flex items-center justify-center flex-shrink-0 mb-4', AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <p className="text-body-md text-ink-muted leading-relaxed">
                    {scenario}
                  </p>
                </div>

                <div className="border-t border-glass-border pt-4 mt-6 relative z-10">
                  <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">{role}</p>
                </div>
              </motion.div>
              )
            })}
          </div>

          {/* Scroll gradient indicators */}
          <div className="absolute inset-y-0 right-0 w-24 pointer-events-none bg-gradient-to-r from-transparent to-surface-base" />
          <div className="absolute inset-y-0 left-0 w-24 pointer-events-none bg-gradient-to-l from-transparent to-surface-base" />
        </div>
      </div>
    </section>
  )
}
