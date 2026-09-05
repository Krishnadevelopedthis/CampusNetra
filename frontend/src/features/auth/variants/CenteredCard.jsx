import { Link } from 'react-router-dom'

import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  EmailField, ErrorSummary, ExpiredNotice, FormMeta, PasswordField, SubmitButton,
} from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'

/**
 * Variant 2 — Centred card on an ambient field.
 *
 * One composition at every width, so a phone gets the same design as a desktop
 * rather than a stripped-down version of it. The atmosphere lives in the
 * background and the card stays plain, which keeps the credential entry — the
 * only thing anyone is here to do — the most legible object on screen.
 */
export function CenteredCard({ form }) {
  const {
    role, setRole, email, setEmail, password, setPassword,
    remember, setRemember, errors, errorList, submitting, succeeded, expired,
    submit, summaryRef, fieldRefs,
  } = form

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center
                    p-5 sm:p-8 bg-primary overflow-hidden">
      {/* Ambient depth: two offset glows and the twin's grid, all decorative */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120vw] max-w-[900px]
                   aspect-square rounded-full blur-3xl opacity-30 bg-secondary pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-30%] right-[-10%] w-[70vw] max-w-[560px]
                   aspect-square rounded-full blur-3xl opacity-20 bg-brand pointer-events-none"
        aria-hidden="true"
      />

      <div className="absolute top-4 right-4 z-10"><ThemeToggle /></div>

      <main className="relative w-full max-w-[440px] animate-slide-up">
        <div className="flex justify-center mb-6">
          <Logo subtitle={null} size={44} className="[&_p]:text-white" />
        </div>

        <div className="bg-surface rounded-2xl shadow-level3 border border-border-subtle
                        p-6 sm:p-8">
          <h1 className="text-headline-lg text-ink text-center">Sign in</h1>
          <p className="text-body-md text-ink-muted mt-1.5 text-center">
            Use the account your campus issued you.
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
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
        </div>

        <p className="mt-5 text-center text-body-md text-white/70">
          New to Campus Netra?{' '}
          <Link to="/register" className="text-white font-medium hover:underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  )
}
