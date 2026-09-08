import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-surface-base">
      {/* Brand panel */}
      <div className="relative overflow-hidden bg-primary text-on-primary
                      px-6 py-8 md:p-10 lg:p-12 md:flex md:flex-col md:justify-between">
        {/* Faint spatial grid — a nod to the digital twin. */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden
        />
        {/* One light source, so the grid reads as depth rather than paper. */}
        <div
          className="absolute -top-1/4 -left-1/4 w-[70%] h-[70%] rounded-full blur-3xl
                     opacity-25 bg-secondary pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative flex items-center justify-between">
          <Logo subtitle={null} size={40} className="[&_p]:text-on-primary" />
          {/* Signed-out visitors need the theme control too, and on a phone the
              form panel's copy of it is below the fold. */}
          <div className="md:hidden"><ThemeToggle /></div>
        </div>

        <div className="relative max-w-md mt-8 md:mt-0">
          <h2 className="text-[clamp(22px,5vw,34px)] leading-[1.15] font-semibold tracking-tight">
            Every fault, every fix — on one live map of your campus.
          </h2>
          <p className="mt-3 md:mt-4 text-body-md md:text-body-lg text-on-primary/70">
            Report an issue with a photo. Campus Netra classifies it, routes it to the
            right department, and turns the marker red on the digital twin until it&rsquo;s fixed.
          </p>

          <dl className="mt-6 md:mt-10 grid grid-cols-3 gap-4 md:gap-6">
            {[['AI', 'Auto-routing'], ['Live', 'Digital twin'], ['Smart', 'Lost & Found']]
              .map(([k, v]) => (
                <div key={v}>
                  <dt className="text-headline-md md:text-headline-lg font-semibold">{k}</dt>
                  <dd className="text-body-sm text-on-primary/60 mt-0.5 md:mt-1">{v}</dd>
                </div>
              ))}
          </dl>
        </div>

        <p className="relative hidden md:block text-body-sm text-on-primary/50">
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4 hidden md:block"><ThemeToggle /></div>

        <div className="w-full max-w-[420px] animate-slide-up">
          <h1 className="text-headline-lg text-ink">{title}</h1>
          {subtitle && <p className="text-body-md text-ink-muted mt-1.5">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-body-md text-ink-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}