import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { Button, Field, Input, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { OtpInput } from './VerifyEmail'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!email.trim()) next.email = 'Enter your email address'
    if (code.length !== 6) next.code = 'Enter the six-digit code'
    if (password.length < 8) next.new_password = 'At least 8 characters'
    if (password !== confirm) next.confirm = 'Passwords do not match'
    if (Object.keys(next).length) return setErrors(next)

    setSubmitting(true)
    setErrors({})
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(), code, new_password: password,
      })
      toast.success('Password updated. Please sign in.')
      navigate('/login')
    } catch (err) {
      if (err.fields) setErrors(err.fields)
      else setErrors({ _: err.detail || 'Could not reset your password' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Enter the code we emailed you, then choose a new password."
      footer={<Link to="/login" className="text-secondary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors._ && (
          <div className="bg-danger-bg border border-danger-border rounded px-3 py-2.5 text-body-md text-danger-text">
            {errors._}
          </div>
        )}

        <Field label="Email address" error={errors.email} required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        </Field>

        <Field label="Reset code" error={errors.code} required>
          <OtpInput value={code} onChange={setCode} error={errors.code} />
        </Field>

        <Field label="New password" error={errors.new_password} required>
          <Input type="password" autoComplete="new-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} error={errors.new_password} />
        </Field>

        <Field label="Confirm new password" error={errors.confirm} required>
          <Input type="password" autoComplete="new-password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  )
}
