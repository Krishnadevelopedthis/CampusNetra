import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { CaptchaField } from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'
import { useCaptcha } from '@/features/auth/useCaptcha'
import { Button, Field, Input, toast } from '@/components/ui'
import { ROLE_HOME, useAuth } from '@/lib/auth'

export default function Login() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const captcha = useCaptcha()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('expired')
  const expiredReason = params.get('reason')

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})

    const next = {}
    if (!email.trim()) next.email = 'Enter your email address'
    if (!password) next.password = 'Enter your password'
    if (!captcha.answer.trim()) next.captcha = 'Enter the characters shown'
    if (Object.keys(next).length) return setErrors(next)

    setSubmitting(true)
    try {
      // No role constraint sent, regardless of which tab is active -- the
      // tabs are cosmetic now (see RoleTabs.jsx). Whoever's credentials are
      // correct signs in and lands wherever ROLE_HOME sends their actual
      // role, including an admin signing in from any tab.
      const user = await login(email.trim(), password, null, captcha)
      // A genuinely first-ever sign-in (an admin-provisioned account whose
      // owner never went through the register->verify-email auto-login
      // flow) shouldn't be told "welcome back" — there's no "back" yet.
      toast.success(
        user.first_login
          ? `Welcome, ${user.full_name.split(' ')[0]}.`
          : `Welcome back, ${user.full_name.split(' ')[0]}.`
      )
      navigate(ROLE_HOME[user.role] || '/dashboard', { replace: true })
    } catch (err) {
      const fields = err.fields
      if (fields) {
        // The server validates the challenge as two separate inputs; the form
        // shows one, so either complaint lands on it.
        const captchaProblem = fields.captcha_answer || fields.captcha_token
        setErrors({ ...fields, ...(captchaProblem ? { captcha: captchaProblem } : {}) })
      } else {
        setErrors({ _: err.detail || 'Unable to sign in. Please try again.' })
      }
      // A refused attempt gets a new puzzle rather than the one just rejected.
      captcha.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Precision Intelligence Authentication"
      footer={
        <>
          New to Campus Netra?{' '}
          <Link to="/register" className="text-secondary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <RoleTabs value={role} onChange={setRole} />

        {expired && (
          <div className="ai-surface px-3 py-2.5 text-body-md text-info-text">
            {expiredReason === 'inactivity' ? (
              <>
                <strong className="font-medium">Session Expired.</strong>{' '}
                You were logged out because there was no activity for 10 minutes.
                Please log in again to continue.
              </>
            ) : (
              'Your session expired. Please sign in again.'
            )}
          </div>
        )}
        {errors._ && (
          <div className="bg-danger-bg border border-danger-border rounded px-3 py-2.5 text-body-md text-danger-text">
            {errors._}
          </div>
        )}

        <Field label="Email address" error={errors.email} required>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <Input
              type="email" autoComplete="email" className="pl-9"
              placeholder="you@campus.edu" value={email}
              onChange={(e) => setEmail(e.target.value)} error={errors.email}
            />
          </div>
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <Input
              type={show ? 'text' : 'password'} autoComplete="current-password"
              className="pl-9 pr-10" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} error={errors.password}
            />
            <button
              type="button" onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-faint hover:text-ink rounded"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <CaptchaField captcha={captcha} error={errors.captcha} />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-body-md text-ink-muted cursor-pointer">
            <input type="checkbox" className="rounded border-border accent-secondary" />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-body-md text-secondary hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}