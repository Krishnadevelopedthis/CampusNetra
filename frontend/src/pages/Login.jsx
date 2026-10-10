import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { CaptchaField } from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'
import { useCaptcha } from '@/features/auth/useCaptcha'
import { Button, Field, Input, toast } from '@/components/ui'
import { ROLE_HOME, useAuth } from '@/lib/auth'
import { isNativeApp } from '@/lib/native'

/*
 * "Remember me" remembers the email address on this device, so it is filled in
 * next time. It does not keep anyone signed in: the password and captcha are
 * still asked every time, and the usual 10-minute idle sign-out still applies.
 * Ticked by default in the Android app, which is a personal device.
 */
const REMEMBER_PREF_KEY = 'cn.remember'
const REMEMBER_EMAIL_KEY = 'cn.remember-email'

function readRememberPref() {
  try {
    const v = localStorage.getItem(REMEMBER_PREF_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* storage blocked */ }
  return isNativeApp()
}

function readRememberedEmail() {
  try { return localStorage.getItem(REMEMBER_EMAIL_KEY) || '' } catch { return '' }
}

function saveRememberChoice(remember, email) {
  try {
    localStorage.setItem(REMEMBER_PREF_KEY, remember ? '1' : '0')
    if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email)
    else localStorage.removeItem(REMEMBER_EMAIL_KEY)
  } catch { /* storage blocked: nothing to remember */ }
}

export default function Login() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState(readRememberedEmail)
  const [remember, setRemember] = useState(readRememberPref)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const captcha = useCaptcha()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Captured once, not read from `params` on every render: a plain page
  // refresh re-requests the exact same URL, query string included, so a
  // banner driven directly by params.get('expired') would show forever
  // until the user navigated somewhere else -- refreshing looked like it
  // should dismiss a "this just happened" notice but silently didn't.
  // Reading it once into state, then clearing it from the URL right below,
  // means a refresh lands on a plain /login with nothing left to show.
  const [expired] = useState(() => params.get('expired'))
  const [expiredReason] = useState(() => params.get('reason'))
  useEffect(() => {
    if (params.get('expired')) setParams({}, { replace: true })
  }, [])

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
      // The selected tab is sent and enforced: a student, teacher or
      // technician signs in only from their own tab. Admin and facility
      // manager accounts have no tab and sign in from any of them.
      const user = await login(email.trim(), password, role, captcha)
      saveRememberChoice(remember, email.trim())
      // A genuinely first-ever sign-in (an admin-provisioned account whose
      // owner never went through the register->verify-email auto-login
      // flow) shouldn't be told "welcome back" — there's no "back" yet.
      toast.success(
        user.first_login
          ? `Welcome, ${user.full_name.split(' ')[0]}.`
          : `Welcome back, ${user.full_name.split(' ')[0]}.`
      )
      if (user.signed_out_other_device) {
        toast.info('Signed in. Your account was signed out on its other device.')
      }
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
            {expiredReason === 'other_device' ? (
              <>
                <strong className="font-medium">Signed out.</strong>{' '}
                Your account was signed in on another device, so this one was
                signed out. Sign in again to continue here — that will sign out
                the other device.
              </>
            ) : expiredReason === 'ended' ? (
              'Your session has ended. Please sign in again.'
            ) : expiredReason === 'inactivity' ? (
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
            <Mail size={16} className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <Input
              type="email" autoComplete="email" className="pl-9"
              placeholder="you@campus.edu" value={email}
              onChange={(e) => setEmail(e.target.value)} error={errors.email}
            />
          </div>
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <Lock size={16} className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
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
          <label
            className="flex items-center gap-2 text-body-md text-ink-muted cursor-pointer"
            title="Fill in my email next time on this device. Leave it off on a shared computer."
          >
            <input
              type="checkbox" className="rounded border-border accent-secondary"
              checked={remember} onChange={(e) => setRemember(e.target.checked)}
            />
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