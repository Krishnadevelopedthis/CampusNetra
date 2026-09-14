import { CheckCircle2, Mail, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { CaptchaField } from '@/features/auth/LoginParts'
import { useCaptcha } from '@/features/auth/useCaptcha'
import { Button, Field, Input } from '@/components/ui'
import { api } from '@/lib/api'

export default function ForgotPassword() {
  // 'email' or 'phone' — the backend needs exactly one of the two, so the
  // tab picks which field is actually sent rather than trying to guess from
  // the input's shape.
  const [channel, setChannel] = useState('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [captchaError, setCaptchaError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const captcha = useCaptcha()
  const navigate = useNavigate()

  const identifier = channel === 'email' ? email.trim() : phone.trim()

  const submit = async (e) => {
    e.preventDefault()
    if (!identifier) {
      return setError(channel === 'email' ? 'Enter your email address' : 'Enter your phone number')
    }
    if (!captcha.answer.trim()) return setCaptchaError('Enter the characters shown')
    setSubmitting(true)
    setError(null)
    setCaptchaError(null)
    try {
      await api.post('/auth/forgot-password', {
        [channel]: identifier,
        captcha_token: captcha.token,
        captcha_answer: captcha.answer,
      })
      setSent(true)
    } catch (err) {
      const captchaProblem = err.fields?.captcha_answer || err.fields?.captcha_token
      const identifierProblem = err.fields?.email || err.fields?.phone
      if (captchaProblem) setCaptchaError(captchaProblem)
      else setError(identifierProblem || err.detail || 'Something went wrong')
      // A refused attempt gets a new puzzle rather than the one just rejected.
      captcha.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`If that ${channel === 'email' ? 'address' : 'number'} is registered, a reset code is on its way.`}
      >
        <div className="space-y-6">
          <div className="ai-surface p-4 flex gap-3">
            <CheckCircle2 size={20} className="text-secondary shrink-0 mt-0.5" />
            <div>
              <p className="text-body-md text-ink">
                We sent a 6-digit reset code {channel === 'email' ? 'to' : 'by SMS to'}{' '}
                <strong>{identifier}</strong>.
              </p>
              <p className="text-body-sm text-ink-faint mt-1">
                The code expires in 10 minutes.{' '}
                {channel === 'email'
                  ? "Check your spam folder if it hasn't arrived."
                  : "Check that the number can receive SMS if it hasn't arrived."}
              </p>
            </div>
          </div>
          <Button
            size="lg" className="w-full"
            onClick={() => navigate(
              `/reset-password?${channel}=${encodeURIComponent(identifier)}`
            )}
          >
            Enter reset code
          </Button>
          <p className="text-center text-body-md text-ink-muted">
            <button onClick={() => setSent(false)} className="text-secondary hover:underline">
              {channel === 'email' ? 'Use a different address' : 'Use a different number'}
            </button>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={channel === 'email'
        ? "We'll email you a code to set a new one."
        : "We'll text you a code to set a new one."}
      footer={<Link to="/login" className="text-secondary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="flex p-1 bg-surface-sunken rounded-lg">
          {[['email', 'Email', Mail], ['phone', 'Phone number', Phone]].map(([key, label, Icon]) => (
            <button
              key={key} type="button"
              onClick={() => { setChannel(key); setError(null) }}
              className={`flex-1 h-9 px-3 rounded text-body-md font-medium transition-colors
                          flex items-center justify-center gap-1.5 ${
                channel === key ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {channel === 'email' ? (
          <Field label="Email address" error={error} required>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <Input
                type="email" autoComplete="email" className="pl-9" placeholder="you@campus.edu"
                value={email} onChange={(e) => setEmail(e.target.value)} error={error}
              />
            </div>
          </Field>
        ) : (
          <Field label="Phone number" error={error} required>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <Input
                type="tel" autoComplete="tel" className="pl-9" placeholder="e.g. 9867943963"
                value={phone} onChange={(e) => setPhone(e.target.value)} error={error}
              />
            </div>
          </Field>
        )}

        <CaptchaField captcha={captcha} error={captchaError} />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Send reset code
        </Button>
      </form>
    </AuthShell>
  )
}
