import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { RoleTabs } from '@/features/auth/RoleTabs'
import { Button, Field, Input, toast } from '@/components/ui'
import { ROLE_HOME, useAuth } from '@/lib/auth'

export default function Login() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('expired')

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})

    const next = {}
    if (!email.trim()) next.email = 'Enter your email address'
    if (!password) next.password = 'Enter your password'
    if (Object.keys(next).length) return setErrors(next)

    setSubmitting(true)
    try {
      // The admin tab covers both admin and facility_manager accounts, so it
      // authenticates without a role constraint and routes on the result.
      const user = await login(email.trim(), password, role === 'admin' ? null : role)
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}.`)
      navigate(ROLE_HOME[user.role] || '/dashboard', { replace: true })
    } catch (err) {
      if (err.fields) setErrors(err.fields)
      else setErrors({ _: err.detail || 'Unable to sign in. Please try again.' })
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
            Your session expired. Please sign in again.
          </div>
        )}
        {errors._ && (
          <div className="bg-danger-bg border border-danger-border rounded px-3 py-2.5 text-body-md text-danger-text">
            {errors._}
          </div>
        )}

        <Field label="Email address" error={errors.email} required>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <Input
              type="email" autoComplete="email" className="pl-9"
              placeholder="you@campus.edu" value={email}
              onChange={(e) => setEmail(e.target.value)} error={errors.email}
            />
          </div>
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
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
