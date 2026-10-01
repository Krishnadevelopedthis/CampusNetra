import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'

export function CTA() {
  return (
    <section
      id="cta"
      className="py-24 bg-surface-base relative overflow-hidden glass-panel border-y border-glass-border"
    >
      {/* Radial spotlight backgrounds */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[250px] bg-spotlight-primary opacity-40 -z-10" />
        <div className="absolute bottom-1/3 right-1/4 w-[350px] h-[200px] bg-spotlight-emerald opacity-30 -z-10" />
      </div>

      {/* Grid beam subtle overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-10 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-[clamp(2rem,5vw,3rem)] font-bold text-gradient-electric leading-tight mb-2">
          Ready to Build a Smarter Campus?
        </h2>
        <p className="mt-4 text-body-lg text-ink-muted max-w-2xl mx-auto leading-relaxed">
          Join institutions modernising their facility management with intelligent issue tracking,
          work orders, and digital twin technology.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/register"
            className={clsx(
              'landing-button inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-lg border-shimmer bg-gradient-to-r from-secondary-400 to-primary px-[clamp(1rem,5vw,2rem)] py-[clamp(0.7rem,2.5vw,0.85rem)] text-[clamp(0.8rem,2.4vw,1rem)] leading-tight text-white font-semibold shadow-glow-secondary transition-all duration-300 hover:from-secondary-600 hover:to-primary-800',
            )}
          >
            Get Started Free
            <ArrowRight size={18} className="shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  )
}
