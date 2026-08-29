import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Split layout: brand narrative on the left, the form on the right. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface-base">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-white relative overflow-hidden">
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
        <div className="relative">
          <Logo subtitle={null} size={44} className="[&_p]:text-white" />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[34px] leading-[1.15] font-semibold tracking-tight">
            Every fault, every fix — on one live map of your campus.
          </h2>
          <p className="mt-4 text-body-lg text-white/70">
            Report an issue with a photo. Campus Netra classifies it, routes it to the
            right department, and turns the marker red on the digital twin until it's fixed.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6">
            {[
              ['AI', 'Auto-routing'],
              ['Live', 'Digital twin'],
              ['Smart', 'Lost & Found'],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="text-headline-lg font-semibold">{k}</dt>
                <dd className="text-body-sm text-white/60 mt-1">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-body-sm text-white/50">
          © {new Date().getFullYear()} Campus Netra · Precision Intelligence
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        {/* Signed-out visitors need the control too — this is the only chrome
            they ever see. */}
        <div className="absolute top-4 right-4"><ThemeToggle /></div>

        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8">
            <Logo subtitle={null} />
          </div>
          <h1 className="text-headline-lg text-ink">{title}</h1>
          {subtitle && <p className="text-body-md text-ink-muted mt-1.5">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-body-md text-ink-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
