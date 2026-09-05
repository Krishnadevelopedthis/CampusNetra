import { AlertCircle, Check, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button, Field, Input } from '@/components/ui'

/**
 * Pieces every sign-in layout shares.
 *
 * The variants differ in framing — split screen, centred card, compact console
 * — but a password field and a submit button should not behave differently
 * depending on which one you are looking at. Only the arrangement varies.
 */

/**
 * The list of what went wrong, above the form.
 *
 * Focusable and focused after a failed submit, because inline errors alone are
 * easy to miss: a keyboard user tabs from the button back into a form with no
 * indication of what stopped it. Each item links to its field, and the inline
 * messages stay — this complements them rather than replacing them.
 */
export function ErrorSummary({ errors, errorList, summaryRef, fieldRefs }) {
  const general = errors._
  if (!general && errorList.length === 0) return null

  return (
    <div
      ref={summaryRef} tabIndex={-1} role="alert"
      className="rounded-lg border border-danger-border bg-danger-bg px-3.5 py-3
                 animate-slide-up focus:outline-none focus-visible:ring-2
                 focus-visible:ring-danger focus-visible:ring-offset-2
                 focus-visible:ring-offset-surface"
    >
      <p className="flex items-center gap-2 text-body-md font-medium text-danger-text">
        <AlertCircle size={15} aria-hidden="true" />
        {general || (errorList.length === 1 ? 'There is a problem' : 'There are some problems')}
      </p>
      {errorList.length > 0 && (
        <ul className="mt-1.5 space-y-1 pl-6 list-disc marker:text-danger">
          {errorList.map(({ field, message }) => (
            <li key={field}>
              <button
                type="button"
                onClick={() => fieldRefs[field]?.current?.focus()}
                className="text-body-sm text-danger-text underline underline-offset-2
                           hover:no-underline"
              >
                {message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Email input with its icon, wired to the enclosing Field for its ids. */
export function EmailField({ value, onChange, error, inputRef }) {
  return (
    <Field label="Email address" error={error} required>
      <div className="relative [&:focus-within>svg]:text-secondary">
        <Mail
          size={16} aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none
                     transition-colors"
        />
        <Input
          ref={inputRef} type="email" autoComplete="email" className="pl-9"
          placeholder="you@campus.edu" value={value} error={error}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  )
}

/**
 * Password input with a reveal toggle.
 *
 * Paste stays enabled and autocomplete is declared, so a password manager can
 * fill it — WCAG 2.2 treats blocking that as an accessibility failure, not a
 * security measure.
 */
export function PasswordField({ value, onChange, error, inputRef }) {
  const [show, setShow] = useState(false)
  return (
    <Field label="Password" error={error} required>
      <div className="relative [&:focus-within>svg:first-child]:text-secondary">
        <Lock
          size={16} aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
        />
        <Input
          ref={inputRef} type={show ? 'text' : 'password'} autoComplete="current-password"
          className="pl-9 pr-11" placeholder="••••••••" value={value} error={error}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* 36px square: a 16px icon alone is far below a usable touch target. */}
        <button
          type="button" onClick={() => setShow((s) => !s)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center
                     w-9 h-9 rounded text-ink-faint hover:text-ink hover:bg-surface-sunken
                     transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  )
}

/**
 * Submit button that reports which of the three things it is doing.
 *
 * Success is shown for the moment before the redirect lands; without it the
 * only feedback for a correct password is the page changing, which reads as a
 * jump rather than a confirmation.
 */
export function SubmitButton({ submitting, succeeded, children = 'Sign in', className }) {
  return (
    <Button
      type="submit" size="lg" disabled={submitting || succeeded}
      aria-live="polite"
      className={`w-full justify-center transition-transform active:scale-[0.99]
                  ${succeeded ? '!bg-success !text-white' : ''} ${className || ''}`}
    >
      {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {succeeded && <Check size={16} aria-hidden="true" />}
      {submitting ? 'Signing in…' : succeeded ? 'Signed in' : children}
    </Button>
  )
}

/** Session-expiry notice, shown when routed here from an expired token. */
export function ExpiredNotice() {
  return (
    <div
      role="status"
      className="rounded-lg border border-info-border bg-info-bg px-3.5 py-2.5
                 text-body-md text-info-text animate-slide-up"
    >
      Your session expired. Please sign in again.
    </div>
  )
}

/** Remember-me and forgot-password, which sit together in every layout. */
export function FormMeta({ remember, onRemember }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-body-md text-ink-muted cursor-pointer select-none">
        <input
          type="checkbox" checked={remember}
          onChange={(e) => onRemember(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-secondary cursor-pointer"
        />
        Remember me
      </label>
      <Link
        to="/forgot-password"
        className="text-body-md text-secondary hover:underline underline-offset-2"
      >
        Forgot password?
      </Link>
    </div>
  )
}
