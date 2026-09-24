import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { Button, Field, Input, PasswordInput, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { OtpInput } from './VerifyEmail'

export default function ResetPassword() {
  const [params] = useSearchParams()
  // Whichever channel forgot-password sent the code through is preserved in
  // the query string, so this page knows which field to send back — the
  // backend needs exactly one of email/phone, not both.
  const initialChannel = params.get('phone') ? 'phone' : 'email'
  const [channel] = useState(initialChannel)
  const [identifier, setIdentifier] = useState(
    params.get(initialChannel) || ''
  )
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!identifier.trim()) {
      next[channel] = channel === 'email' ? 'Enter your email address' : 'Enter your phone number'
    }
    if (code.length !== 6) next.code = 'Enter the six-digit code'
    if (password.length < 8) next.new_password = 'At least 8 characters'
    if (password !== confirm) next.confirm = 'Passwords do not match'
    if (Object.keys(next).length) return setErrors(next)

    setSubmitting(true)
    setErrors({})
    try {
      await api.post('/auth/reset-password', {
        [channel]: identifier.trim(), code, new_password: password,
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
      subtitle={channel === 'email'
        ? 'Enter the code we emailed you, then choose a new password.'
        : 'Enter the code we texted you, then choose a new password.'}
      footer={<Link to="/login" className="text-secondary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors._ && (
          <div className="bg-danger-bg border border-danger-border rounded px-3 py-2.5 text-body-md text-danger-text">
            {errors._}
          </div>
        )}

        <Field label={channel === 'email' ? 'Email address' : 'Phone number'}
               error={errors.email || errors.phone} required>
          <Input
            type={channel === 'email' ? 'email' : 'tel'}
            value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            error={errors.email || errors.phone}
          />
        </Field>

        <Field label="Reset code" error={errors.code} required>
          <OtpInput value={code} onChange={setCode} error={errors.code} />
        </Field>

        <Field label="New password" error={errors.new_password} required>
          <PasswordInput autoComplete="new-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} error={errors.new_password} />
        </Field>

        <Field label="Confirm new password" error={errors.confirm} required>
          <PasswordInput autoComplete="new-password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  )
}
