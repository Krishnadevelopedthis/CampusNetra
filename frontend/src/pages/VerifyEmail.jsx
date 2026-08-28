import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { Button, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { ROLE_HOME, useAuth } from '@/lib/auth'

const LENGTH = 6

/** Six single-character boxes that behave like one field. */
export function OtpInput({ value, onChange, error, disabled }) {
  const refs = useRef([])

  const setAt = (i, char) => {
    const next = value.split('')
    next[i] = char
    onChange(next.join('').slice(0, LENGTH))
  }

  return (
    <div className="flex gap-2 justify-between" onPaste={(e) => {
      e.preventDefault()
      const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH)
      if (digits) {
        onChange(digits)
        refs.current[Math.min(digits.length, LENGTH - 1)]?.focus()
      }
    }}>
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={value[i] || ''}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '')
            if (!d) return setAt(i, '')
            setAt(i, d[d.length - 1])
            if (i < LENGTH - 1) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < LENGTH - 1) refs.current[i + 1]?.focus()
          }}
          className={`w-full h-14 text-center text-headline-lg font-semibold tabular
                      bg-surface border rounded transition-colors
                      focus:border-secondary focus:ring-1 focus:ring-secondary
                      ${error ? 'border-danger' : 'border-border-subtle'}`}
        />
      ))}
    </div>
  )
}

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const email = params.get('email') || ''
  // Present only when the server could not send the email (development).
  const devCode = params.get('code') || ''
  const [code, setCode] = useState(devCode)
  const [notice, setNotice] = useState(devCode ? { code: devCode } : null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const { verifyEmail } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!cooldown) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const submit = async (e) => {
    e?.preventDefault()
    if (code.length !== LENGTH) return setError('Enter all six digits')
    setSubmitting(true)
    setError(null)
    try {
      const user = await verifyEmail(email, code)
      toast.success('Email verified. Welcome to Campus Netra.')
      navigate(ROLE_HOME[user.role] || '/dashboard', { replace: true })
    } catch (err) {
      setError(err.detail || 'Verification failed')
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-submit as soon as the last digit lands.
  useEffect(() => {
    if (code.length === LENGTH && !submitting) submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const resend = async () => {
    try {
      const res = await api.post('/auth/resend-code', { email, purpose: 'email_verify' })
      if (res?.dev_code) {
        setNotice({ code: res.dev_code })
        setCode(res.dev_code)
        toast.info('Email is not configured on this server — your code is shown below.')
      } else {
        toast.success('A new code is on its way.')
      }
      setCooldown(45)
    } catch (err) {
      toast.error(err.detail || 'Could not resend the code')
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle={`We sent a 6-digit code to ${email || 'your inbox'}`}
      footer={<Link to="/login" className="text-secondary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-5">
        {notice && (
          <div className="ai-surface p-4">
            <p className="text-body-md text-ink">
              This server has no mail delivery configured, so your code is shown here
              instead of being emailed.
            </p>
            <p className="font-mono text-headline-lg tracking-[0.3em] text-primary mt-2">
              {notice.code}
            </p>
            <p className="text-body-sm text-ink-faint mt-1">
              Set <code>SMTP_HOST</code> in <code>backend/.env</code> to receive real emails.
            </p>
          </div>
        )}

        <OtpInput value={code} onChange={setCode} error={error} disabled={submitting} />
        {error && <p className="field-error justify-center">{error}</p>}

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Verify and continue
        </Button>

        <p className="text-center text-body-md text-ink-muted">
          Didn't get it?{' '}
          <button
            type="button" onClick={resend} disabled={cooldown > 0}
            className="text-secondary font-medium hover:underline disabled:text-ink-faint disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </p>
      </form>
    </AuthShell>
  )
}
