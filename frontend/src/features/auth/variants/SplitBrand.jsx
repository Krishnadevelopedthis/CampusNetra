import { Link } from 'react-router-dom'

import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  EmailField, ErrorSummary, ExpiredNotice, FormMeta, PasswordField, SubmitButton,
} from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'

/**
 * Variant 1 — Split brand.
 *
 * The current layout, taken further. The brand panel is the trust signal for a
 * platform students are handing credentials to, so it earns half the screen —
 * but it appears from `md` rather than `lg`, and phones get a condensed band
 * instead of nothing, which is the gap in today's version.
 */
export function SplitBrand({ form }) {
  const {
    role, setRole, email, setEmail, password, setPassword,
    remember, setRemember, errors, errorList, submitting, succeeded, expired,
    submit, summaryRef, fieldRefs,
  } = form

  return (
    <div className="min-h-screen md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-surface-base">
      {/* Brand panel — full height from md, a band on phones */}
      <div className="relative overflow-hidden bg-primary text-white
                      px-6 py-8 md:p-10 lg:p-12 md:flex md:flex-col md:justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />
        {/* A single light source, so the grid reads as depth rather than paper */}
        <div
          className="absolute -top-1/4 -left-1/4 w-[70%] h-[70%] rounded-full blur-3xl
                     opacity-25 bg-secondary pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative flex items-center justify-between">
          <Logo subtitle={null} size={40} className="[&_p]:text-white" />
          <div className="md:hidden"><ThemeToggle /></div>
        </div>

        <div className="relative max-w-md mt-8 md:mt-0">
          <h2 className="text-[clamp(22px,5vw,34px)] leading-[1.15] font-semibold tracking-tight">
            Every fault, every fix — on one live map of your campus.
          </h2>
          <p className="mt-3 md:mt-4 text-body-md md:text-body-lg text-white/70">
            Report an issue with a photo. Campus Netra classifies it, routes it to the
            right department, and turns the marker red on the digital twin until it&rsquo;s fixed.
          </p>

          <dl className="mt-6 md:mt-10 grid grid-cols-3 gap-4 md:gap-6">
            {[['AI', 'Auto-routing'], ['Live', 'Digital twin'], ['Smart', 'Lost & Found']]
              .map(([k, v]) => (
                <div key={v}>
                  <dt className="text-headline-md md:text-headline-lg font-semibold">{k}</dt>
                  <dd className="text-body-sm text-white/60 mt-0.5 md:mt-1">{v}</dd>
                </div>
              ))}
          </dl>
        </div>

        <p className="relative hidden md:block text-body-sm text-white/50">
          © {new Date().getFullYear()} Campus Netra · Precision Intelligence
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4 hidden md:block"><ThemeToggle /></div>

        <div className="w-full max-w-[420px] animate-slide-up">
          <h1 className="text-headline-lg text-ink">Sign in</h1>
          <p className="text-body-md text-ink-muted mt-1.5">
            Use the account your campus issued you.
          </p>

          <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            <RoleTabs value={role} onChange={setRole} />
            {expired && <ExpiredNotice />}
            <ErrorSummary {...{ errors, errorList, summaryRef, fieldRefs }} />

            <EmailField
              value={email} onChange={setEmail}
              error={errors.email} inputRef={fieldRefs.email}
            />
            <PasswordField
              value={password} onChange={setPassword}
              error={errors.password} inputRef={fieldRefs.password}
            />
            <FormMeta remember={remember} onRemember={setRemember} />
            <SubmitButton submitting={submitting} succeeded={succeeded} />
          </form>

          <p className="mt-6 text-center text-body-md text-ink-muted">
            New to Campus Netra?{' '}
            <Link to="/register" className="text-secondary font-medium hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
