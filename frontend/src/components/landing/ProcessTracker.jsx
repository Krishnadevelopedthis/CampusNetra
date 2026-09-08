import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Brain, UserCheck, Wrench, BarChart3, Activity,
  Sparkles
} from 'lucide-react'
import clsx from 'clsx'

const STEPS = [
  {
    number: '01',
    icon: MessageSquare,
    title: 'Report',
    description: 'Anyone on campus submits an issue via mobile or web — photos, location, and description captured in seconds.',
    color: 'from-blue-400 via-cyan-500 to-teal-500',
    glowColor: 'rgba(34, 211, 238, 0.6)', // cyan
    accentColor: '#06b6d4',
  },
  {
    number: '02',
    icon: Brain,
    title: 'Classify',
    description: 'AI analyses the report, suggests category and priority, and routes it to the right team automatically.',
    color: 'from-cyan-400 via-teal-500 to-emerald-500',
    glowColor: 'rgba(16, 185, 129, 0.6)', // emerald
    accentColor: '#10b981',
  },
  {
    number: '03',
    icon: UserCheck,
    title: 'Assign',
    description: 'Facility managers assign work orders to technicians based on skill, location and current workload.',
    color: 'from-teal-400 via-emerald-500 to-lime-500',
    glowColor: 'rgba(132, 204, 22, 0.6)', // lime
    accentColor: '#84cc16',
  },
  {
    number: '04',
    icon: Wrench,
    title: 'Resolve',
    description: 'Technicians action the work order on-site, log time and notes, and mark resolution with photo evidence.',
    color: 'from-emerald-400 via-lime-500 to-green-500',
    glowColor: 'rgba(34, 197, 94, 0.6)', // green
    accentColor: '#22c55e',
  },
  {
    number: '05',
    icon: BarChart3,
    title: 'Analyse',
    description: 'Every closed issue feeds analytics — SLA compliance, repeat failures, team performance, and cost trends.',
    color: 'from-lime-400 via-green-500 to-teal-500',
    glowColor: 'rgba(20, 184, 166, 0.6)', // teal
    accentColor: '#14b8a6',
  },
  {
    number: '06',
    icon: Activity,
    title: 'Predict',
    description: 'Historical patterns surface assets at risk of failure, so maintenance becomes proactive rather than reactive.',
    color: 'from-teal-400 via-cyan-500 to-blue-500',
    glowColor: 'rgba(56, 189, 248, 0.6)', // sky blue
    accentColor: '#38bdf8',
  },
]

const STEP_DURATION = 2500 // ms per step
const PARTICLE_TRAVEL_DURATION = 1200 // ms for particle to travel along wire
const PAUSE_AFTER_COMPLETE = 3000 // ms pause after step 6 before restart

function ProcessStep({
  step,
  index,
  state, // 'future' | 'completed' | 'current'
  isMobile,
  reducedMotion,
  onHover,
  onLeave,
}) {
  const Icon = step.icon
  const isCurrent = state === 'current'
  const isCompleted = state === 'completed'
  const isFuture = state === 'future'

  // Base styles
  const containerStyle = {
    '--accent': step.accentColor,
    '--glow': step.glowColor,
  }

  return (
    <div
      className={clsx(
        'relative flex flex-col items-center',
        isMobile ? 'w-full' : 'flex-1 min-w-0'
      )}
      style={containerStyle}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Connector wire (desktop only) - rendered before the step so it sits behind */}
      {!isMobile && index < STEPS.length - 1 && (
        <div
          className="absolute top-[40px] left-[calc(50%+28px)] right-[calc(50%+28px)] h-px z-0 pointer-events-none"
          aria-hidden="true"
        >
          {/* Base wire - always visible */}
          <div
            className="absolute inset-0 h-px rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.6), rgba(30, 41, 59, 0.8))',
            }}
          />

          {/* Animated progress wire - travels from left to right */}
          {!reducedMotion && (
            <AnimatePresence mode="wait">
              {isCurrent && (
                <motion.div
                  key="progress-wire"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  exit={{ scaleX: 0, opacity: 0 }}
                  transition={{ duration: PARTICLE_TRAVEL_DURATION / 1000, ease: 'easeOut' }}
                  className="absolute inset-0 h-px rounded-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, var(--glow), var(--accent))`,
                    boxShadow: `0 0 8px var(--glow)`,
                    transformOrigin: 'left center',
                  }}
                />
              )}
              {isCompleted && (
                <motion.div
                  key="completed-wire"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 1 }}
                  className="absolute inset-0 h-px rounded-full"
                  style={{
                    background: `linear-gradient(90deg, var(--accent), var(--glow))`,
                    opacity: 0.6,
                  }}
                />
              )}
            </AnimatePresence>
          )}

          {/* Moving particle along wire */}
          {!reducedMotion && isCurrent && (
            <motion.div
              key="particle"
              initial={{ x: -28, scale: 0, opacity: 0 }}
              animate={{ x: 0, scale: 1, opacity: 1 }}
              transition={{
                x: { duration: PARTICLE_TRAVEL_DURATION / 1000, ease: 'easeOut' },
                scale: { duration: 0.3 },
                opacity: { duration: 0.2 },
              }}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full z-10 pointer-events-none"
              style={{
                background: `var(--accent)`,
                boxShadow: `0 0 12px var(--glow), 0 0 24px var(--glow)`,
              }}
            />
          )}
        </div>
      )}

      {/* Step Card */}
      <div
        className={clsx(
          'relative z-10 w-full flex flex-col items-center',
          isMobile ? 'flex-row items-start gap-4' : 'items-center text-center',
          'transition-all duration-500 ease-out'
        )}
      >
        {/* Icon Container */}
        <motion.div
          className={clsx(
            'relative flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center',
            'border-2 transition-all duration-500',
            isCurrent
              ? 'shadow-[0_0_30px_-2px_var(--glow),_0_0_60px_-10px_var(--glow)]'
              : isCompleted
                ? 'shadow-[0_0_20px_-5px_var(--glow)]'
                : '',
          )}
          style={{
            borderColor: isFuture
              ? 'rgba(51, 65, 85, 0.5)'
              : isCurrent
                ? step.accentColor
                : step.accentColor,
            background: isFuture
              ? 'rgba(15, 23, 42, 0.6)'
              : isCurrent
                ? `linear-gradient(135deg, ${step.accentColor}22, ${step.accentColor}11)`
                : `linear-gradient(135deg, ${step.accentColor}15, transparent)`,
            boxShadow: isCurrent
              ? `0 0 40px -5px var(--glow), 0 0 80px -15px var(--glow), inset 0 0 30px ${step.accentColor}15`
              : isCompleted
                ? `0 0 25px -5px var(--glow), inset 0 0 20px ${step.accentColor}10`
                : 'none',
          }}
          animate={
            isCurrent && !reducedMotion
              ? { boxShadow: [
                  '0 0 30px -5px var(--glow), 0 0 60px -10px var(--glow)',
                  '0 0 50px -5px var(--glow), 0 0 90px -10px var(--glow)',
                  '0 0 30px -5px var(--glow), 0 0 60px -10px var(--glow)',
                ] }
              : {}
          }
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Pulse ring for current step */}
          {!reducedMotion && isCurrent && (
            <motion.div
              className="absolute inset-0 rounded-2xl border"
              style={{ borderColor: step.accentColor, borderWidth: '1px' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.1, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}

          {/* Check mark for completed */}
          {isCompleted && !isCurrent && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ background: step.accentColor }}
            >
              ✓
            </div>
          )}

          <Icon
            size={isMobile ? 20 : 24}
            className={clsx(
              'relative z-10 transition-all duration-500',
              isFuture ? 'text-slate-500' : 'text-white'
            )}
          />
        </motion.div>

        {/* Content */}
        <div className={clsx('transition-all duration-500', isMobile ? 'flex-1 min-w-0 mt-0 ml-3' : 'mt-4 text-center')}>
          {/* Step Number */}
          <motion.span
            className="text-label-caps font-bold tracking-wider"
            style={{
              color: isFuture ? 'rgba(100, 116, 139, 0.7)' : 'white',
              background: isFuture ? 'none' : `linear-gradient(90deg, ${step.color})`,
              WebkitBackgroundClip: isFuture ? 'none' : 'text',
              WebkitTextFillColor: isFuture ? 'transparent' : 'transparent',
            }}
            animate={
              isCurrent && !reducedMotion
                ? { opacity: [1, 0.7, 1] }
                : {}
            }
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {step.number}
          </motion.span>

          {/* Title */}
          <h3 className={clsx(
            'font-semibold transition-colors duration-300',
            isMobile ? 'text-body-md' : 'text-body-lg',
            isFuture ? 'text-slate-500' : 'text-white'
          )}>
            {step.title}
          </h3>

          {/* Description */}
          <p className={clsx(
            'mt-1 leading-relaxed transition-colors duration-300',
            isMobile ? 'text-body-sm' : 'text-body-sm',
            isFuture ? 'text-slate-500/70' : 'text-slate-400'
          )}>
            {step.description}
          </p>
        </div>
      </div>

      {/* Vertical connector (mobile only) */}
      {isMobile && index < STEPS.length - 1 && (
        <div
          className="absolute left-[38px] top-[72px] bottom-0 w-px z-0 pointer-events-none"
          aria-hidden="true"
          style={{ height: 'calc(100% + 16px)' }}
        >
          {/* Base wire */}
          <div className="absolute top-0 bottom-0 w-px rounded-full"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.6), rgba(30, 41, 59, 0.8))',
            }}
          />

          {/* Animated progress wire - travels from top to bottom */}
          {!reducedMotion && (
            <AnimatePresence mode="wait">
              {isCurrent && (
                <motion.div
                  key="progress-wire-v"
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  exit={{ scaleY: 0, opacity: 0 }}
                  transition={{ duration: PARTICLE_TRAVEL_DURATION / 1000, ease: 'easeOut' }}
                  className="absolute top-0 bottom-0 w-px rounded-full"
                  style={{
                    background: `linear-gradient(180deg, transparent, var(--glow), var(--accent))`,
                    boxShadow: `0 0 8px var(--glow)`,
                    transformOrigin: 'top center',
                  }}
                />
              )}
              {isCompleted && (
                <motion.div
                  key="completed-wire-v"
                  initial={{ scaleY: 1 }}
                  animate={{ scaleY: 1 }}
                  className="absolute top-0 bottom-0 w-px rounded-full"
                  style={{
                    background: `linear-gradient(180deg, var(--accent), var(--glow))`,
                    opacity: 0.6,
                  }}
                />
              )}
            </AnimatePresence>
          )}

          {/* Moving particle */}
          {!reducedMotion && isCurrent && (
            <motion.div
              key="particle-v"
              initial={{ y: -28, scale: 0, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{
                y: { duration: PARTICLE_TRAVEL_DURATION / 1000, ease: 'easeOut' },
                scale: { duration: 0.3 },
                opacity: { duration: 0.2 },
              }}
              className="absolute w-3 h-3 rounded-full z-10 pointer-events-none"
              style={{
                left: '-6px',
                background: `var(--accent)`,
                boxShadow: `0 0 12px var(--glow), 0 0 24px var(--glow)`,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function ProcessTracker() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [hoveredStep, setHoveredStep] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const containerRef = useRef(null)
  const animationRef = useRef(null)
  const pauseTimerRef = useRef(null)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)
    const handler = (e) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Check mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Intersection Observer to start animation when visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.3, rootMargin: '0px 0px -100px 0px' }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Animation loop
  const runAnimation = useCallback(() => {
    if (!isVisible || reducedMotion) return

    setIsAnimating(true)

    const runSequence = async () => {
      for (let i = 0; i < STEPS.length; i++) {
        if (!isVisible) return

        setCurrentStep(i)

        // Wait for step duration
        await new Promise(resolve => {
          animationRef.current = setTimeout(resolve, STEP_DURATION)
        })

        if (!isVisible) return
      }

      // Pause at the end with all steps completed
      await new Promise(resolve => {
        pauseTimerRef.current = setTimeout(resolve, PAUSE_AFTER_COMPLETE)
      })

      if (!isVisible) return

      // Reset and restart
      setCurrentStep(-1)
      setIsAnimating(false)

      // Brief pause before restart
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (isVisible) {
        runSequence()
      }
    }

    runSequence()
  }, [isVisible, reducedMotion])

  // Start animation when visible
  useEffect(() => {
    if (isVisible && !reducedMotion) {
      runAnimation()
    }
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current)
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    }
  }, [isVisible, reducedMotion, runAnimation])

  // Compute step states
  const getStepState = (index) => {
    if (hoveredStep !== null) {
      if (index === hoveredStep) return 'current'
      if (index < hoveredStep) return 'completed'
      return 'future'
    }
    if (!isAnimating) return index === 0 ? 'current' : 'future'
    if (index < currentStep) return 'completed'
    if (index === currentStep) return 'current'
    return 'future'
  }

  const handleHover = (index) => {
    if (!reducedMotion) setHoveredStep(index)
  }

  const handleLeave = () => {
    setHoveredStep(null)
  }

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      className="py-24 lg:py-32 bg-surface-base relative overflow-hidden"
      aria-labelledby="how-it-works-heading"
    >
      {/* Background - Dark futuristic theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-30" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-25" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[200px] bg-spotlight-emerald opacity-15" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-15 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.24, 0, 0.38, 1] }}
          className="text-center mb-16 lg:mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Sparkles size={14} className="text-cyan-400" />
            <span className="text-gradient-electric">How It Works</span>
          </div>
          <h2 id="how-it-works-heading" className="text-headline-lg lg:text-[48px] text-ink font-bold" style={{ textWrap: 'balance' }}>
            Issue to Insight in 6 Steps
          </h2>
          <p className="mt-4 text-body-lg lg:text-body-xl text-ink-muted max-w-3xl mx-auto">
            From the moment a problem is spotted to predictive prevention — every step is tracked,
            accountable, and improving over time.
          </p>
        </motion.div>

        {/* Tracker Container */}
        <div className="relative" role="region" aria-label="Issue processing workflow">
          {isMobile ? (
            <div className="flex flex-col gap-8 relative">
              {STEPS.map((step, index) => (
                <ProcessStep
                  key={step.number}
                  step={step}
                  index={index}
                  state={getStepState(index)}
                  isMobile={true}
                  reducedMotion={reducedMotion}
                  onHover={() => handleHover(index)}
                  onLeave={handleLeave}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-0 relative">
              {STEPS.map((step, index) => (
                <ProcessStep
                  key={step.number}
                  step={step}
                  index={index}
                  state={getStepState(index)}
                  isMobile={false}
                  reducedMotion={reducedMotion}
                  onHover={() => handleHover(index)}
                  onLeave={handleLeave}
                />
              ))}
            </div>
          )}

          {/* Reduced motion fallback message */}
          {reducedMotion && isVisible && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mt-12 text-body-md text-slate-500"
            >
              Animation disabled — showing final state. Enable motion in system settings for the live workflow animation.
            </motion.p>
          )}
        </div>
      </div>
    </section>
  )
}

export default ProcessTracker