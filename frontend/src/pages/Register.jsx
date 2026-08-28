import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { REGISTER_TABS, RoleTabs } from '@/features/auth/RoleTabs'
import { Button, Field, Input, Select, toast } from '@/components/ui'
import { useAuth } from '@/lib/auth'

/** Extra fields each account type needs beyond name/email/password. */
const EXTRA_FIELDS = {
  student:    [{ name: 'enrollment_no', label: 'Enrollment number', placeholder: '21BCE1234', required: true }],
  teacher:    [{ name: 'employee_id', label: 'Employee ID', placeholder: 'EMP-2041', required: true },
               { name: 'designation', label: 'Designation', placeholder: 'Assistant Professor' }],
  technician: [{ name: 'employee_id', label: 'Employee ID', placeholder: 'TECH-118', required: true }],
  enterprise: [{ name: 'organization_name', label: 'Institution name', placeholder: 'Main Campus Institute of Technology', required: true },
               { name: 'designation', label: 'Your designation', placeholder: 'Facilities Director' }],
}

const DEPARTMENTS = [
  { code: 'ELEC', name: 'Electrical & Maintenance' },
  { code: 'PLUMB', name: 'Plumbing & Sanitation' },
  { code: 'IT', name: 'IT Support' },
  { code: 'AV', name: 'AV & Media' },
  { code: 'CIVIL', name: 'Civil & Facility' },
]

export default function Register() {
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const extras = EXTRA_FIELDS[role] || []
  const isEnterprise = role === 'enterprise'

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})

    const next = {}
    if (!form.full_name?.trim()) next.full_name = 'Enter your full name'
    if (!form.email?.trim()) next.email = 'Enter your email address'
    if (!form.password) next.password = 'Choose a password'
    else if (form.password.length < 8) next.password = 'At least 8 characters'
    if (form.password && form.confirm !== form.password) next.confirm = 'Passwords do not match'
    extras.filter((f) => f.required).forEach((f) => {
      if (!form[f.name]?.trim()) next[f.name] = `${f.label} is required`
    })
    if (Object.keys(next).length) return setErrors(next)

    setSubmitting(true)
    try {
      const res = await register({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        // An institution signup provisions the tenant and makes this user its admin.
        role: isEnterprise ? 'student' : role,
        phone: form.phone || null,
        enrollment_no: form.enrollment_no || null,
        employee_id: form.employee_id || null,
        designation: form.designation || null,
        department_code: form.department_code || null,
        organization_name: isEnterprise ? form.organization_name : null,
      })
      toast.success(res?.detail || 'Account created. Check your email for the verification code.')
      // When the server has no mail configured it returns the code directly;
      // pass it along so the user is not stranded at a step they cannot complete.
      const q = new URLSearchParams({ email: form.email.trim() })
      if (res?.dev_code) q.set('code', res.dev_code)
      navigate(`/verify-email?${q}`)
    } catch (err) {
      if (err.fields) setErrors(err.fields)
      else setErrors({ _: err.detail || 'Registration failed. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join your campus on Campus Netra"
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="text-secondary font-medium hover:underline">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <RoleTabs value={role} onChange={setRole} tabs={REGISTER_TABS} />

        {errors._ && (
          <div className="bg-danger-bg border border-danger-border rounded px-3 py-2.5 text-body-md text-danger-text">
            {errors._}
          </div>
        )}
        {isEnterprise && (
          <div className="ai-surface px-3 py-2.5 text-body-md text-info-text">
            Registering an institution creates the campus workspace and makes you its administrator.
          </div>
        )}

        <Field label="Full name" error={errors.full_name} required>
          <Input value={form.full_name || ''} onChange={set('full_name')} placeholder="Alex Kumar" error={errors.full_name} />
        </Field>

        <Field label="Email address" error={errors.email} required>
          <Input type="email" value={form.email || ''} onChange={set('email')} placeholder="you@campus.edu" error={errors.email} />
        </Field>

        {extras.map((f) => (
          <Field key={f.name} label={f.label} error={errors[f.name]} required={f.required}>
            <Input value={form[f.name] || ''} onChange={set(f.name)} placeholder={f.placeholder} error={errors[f.name]} />
          </Field>
        ))}

        {role === 'technician' && (
          <Field label="Department" hint="Work orders in this department will route to you">
            <Select value={form.department_code || ''} onChange={set('department_code')}>
              <option value="">Select a department</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Phone" hint="Optional — used for urgent notifications">
          <Input type="tel" value={form.phone || ''} onChange={set('phone')} placeholder="+91 98765 43210" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Password" error={errors.password} required>
            <Input type="password" autoComplete="new-password" value={form.password || ''} onChange={set('password')} error={errors.password} />
          </Field>
          <Field label="Confirm password" error={errors.confirm} required>
            <Input type="password" autoComplete="new-password" value={form.confirm || ''} onChange={set('confirm')} error={errors.confirm} />
          </Field>
        </div>
        <p className="hint -mt-2">
          Use at least 8 characters with an uppercase letter, a lowercase letter and a digit.
        </p>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Create account
        </Button>
        <p className="text-body-sm text-ink-faint text-center">
          By continuing you agree to the Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthShell>
  )
}
