import { CheckCircle2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { CaptchaField } from '@/features/auth/LoginParts'
import { useCaptcha } from '@/features/auth/useCaptcha'
import { Button, Field, Input } from '@/components/ui'
import { api } from '@/lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [captchaError, setCaptchaError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const captcha = useCaptcha()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return setError('Enter your email address')
    if (!captcha.answer.trim()) return setCaptchaError('Enter the characters shown')
    setSubmitting(true)
    setError(null)
    setCaptchaError(null)
    try {
      await api.post('/auth/forgot-password', {
        email: email.trim(),
        captcha_token: captcha.token,
        captcha_answer: captcha.answer,
      })
      setSent(true)
    } catch (err) {
      const captchaProblem = err.fields?.captcha_answer || err.fields?.captcha_token
      if (captchaProblem) setCaptchaError(captchaProblem)
      else setError(err.detail || 'Something went wrong')
      // A refused attempt gets a new puzzle rather than the one just rejected.
      captcha.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="If that address is registered, a reset code is on its way.">
        <div className="space-y-6">
          <div className="ai-surface p-4 flex gap-3">
            <CheckCircle2 size={20} className="text-secondary shrink-0 mt-0.5" />
            <div>
              <p className="text-body-md text-ink">
                We sent a 6-digit reset code to <strong>{email}</strong>.
              </p>
              <p className="text-body-sm text-ink-faint mt-1">
                The code expires in 10 minutes. Check your spam folder if it hasn't arrived.
              </p>
            </div>
          </div>
          <Button
            size="lg" className="w-full"
            onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
          >
            Enter reset code
          </Button>
          <p className="text-center text-body-md text-ink-muted">
            <button onClick={() => setSent(false)} className="text-secondary hover:underline">
              Use a different address
            </button>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a code to set a new one."
      footer={<Link to="/login" className="text-secondary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Email address" error={error} required>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <Input
              type="email" autoComplete="email" className="pl-9" placeholder="you@campus.edu"
              value={email} onChange={(e) => setEmail(e.target.value)} error={error}
            />
          </div>
        </Field>
        <CaptchaField captcha={captcha} error={captchaError} />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Send reset code
        </Button>
      </form>
    </AuthShell>
  )
}
