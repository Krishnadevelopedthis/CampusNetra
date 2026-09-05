import { Activity, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  EmailField, ErrorSummary, ExpiredNotice, FormMeta, PasswordField, SubmitButton,
} from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'

/**
 * Variant 3 — Compact console.
 *
 * Dense and instrument-like, matching the digital twin rather than a marketing
 * page. Tighter rhythm, squarer corners and monospace metadata say "operations
 * tool", which is what most of the product actually is — the argument for it is
 * continuity with the screens people use after signing in.
 *
 * The trade-off is warmth: this is the least inviting of the three for a
 * first-time student, and the most familiar for staff who live in the console.
 */
export function CompactConsole({ form }) {
  const {
    role, setRole, email, setEmail, password, setPassword,
    remember, setRemember, errors, errorList, submitting, succeeded, expired,
    submit, summaryRef, fieldRefs,
  } = form

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      {/* Console chrome: a status strip instead of a hero */}
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 h-14
                         border-b border-border-subtle bg-surface">
        <Logo subtitle={null} size={28} />
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 font-mono text-mono-data text-ink-faint">
            <Activity size={13} className="text-success" aria-hidden="true" />
            SYSTEMS NOMINAL
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[380px] animate-slide-up">
          <div className="flex items-center gap-2 font-mono text-mono-data text-ink-faint">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>AUTH / CREDENTIALS</span>
          </div>
          <h1 className="text-headline-md text-ink mt-2">Sign in</h1>
          <p className="text-body-sm text-ink-muted mt-1">
            Use the account your campus issued you.
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
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

          <div className="mt-6 pt-4 border-t border-border-subtle
                          flex items-center justify-between gap-3">
            <span className="text-body-sm text-ink-muted">New to Campus Netra?</span>
            <Link
              to="/register"
              className="text-body-sm text-secondary font-medium hover:underline underline-offset-2"
            >
              Create an account
            </Link>
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-6 h-11 flex items-center border-t border-border-subtle">
        <p className="font-mono text-mono-data text-ink-faint">
          © {new Date().getFullYear()} CAMPUS NETRA · PRECISION INTELLIGENCE
        </p>
      </footer>
    </div>
  )
}
