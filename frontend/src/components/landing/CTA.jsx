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
              'inline-flex items-center justify-center gap-2 px-8 h-12 rounded-lg border-shimmer bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold hover:from-indigo-600 hover:to-violet-600 transition-all duration-300 text-body-lg shadow-glow-indigo',
            )}
          >
            Get Started Free
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}