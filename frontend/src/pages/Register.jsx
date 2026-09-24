import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import { REGISTER_TABS, RoleTabs } from '@/features/auth/RoleTabs'
import { Button, Field, Input, PasswordInput, PasswordStrengthMeter, Select, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { scorePassword } from '@/lib/format'

/** Extra fields each account type needs beyond name/email/password. */
const EXTRA_FIELDS = {
  student:    [{ name: 'enrollment_no', label: 'Enrollment number', placeholder: '2143210',
                 required: true, numeric: true, hint: 'Seven digits.' }],
  teacher:    [{ name: 'employee_id', label: 'Employee ID', placeholder: '2143210',
                 required: true, numeric: true, hint: 'Seven digits.' },
               { name: 'designation', label: 'Designation', placeholder: 'Assistant Professor' }],
  technician: [{ name: 'employee_id', label: 'Employee ID', placeholder: '2143210',
                 required: true, numeric: true, hint: 'Seven digits.' }],
  enterprise: [{ name: 'organization_name', label: 'Institution name', placeholder: 'Main Campus Institute of Technology', required: true },
               { name: 'designation', label: 'Your designation', placeholder: 'Facilities Director' }],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const strength = useMemo(() => scorePassword(form.password), [form.password])
  const [submitting, setSubmitting] = useState(false)
  // Two deliberately separate picklists: departments are the maintenance
  // org chart (who a technician's work orders route to); programmes are
  // academic courses (a student's/teacher's degree/subject). Mixing them —
  // the bug this replaced — let a course like "Computer Science" show up
  // as a candidate team for a broken tap, and vice versa.
  const [options, setOptions] = useState({ departments: [], programmes: [] })
  const { register } = useAuth()
  const navigate = useNavigate()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const extras = EXTRA_FIELDS[role] || []
  const isEnterprise = role === 'enterprise'
  const isAcademic = role === 'student' || role === 'teacher'
  const isTechnician = role === 'technician'

  // Loaded once up front for the common single-campus deployment (no email
  // needed to know which organization's lists to show), and re-loaded once
  // the person finishes typing a plausible email — a multi-campus
  // deployment resolves the organization from the email's domain, so the
  // right lists may only become known at that point.
  useEffect(() => {
    api.get('/auth/register-options')
      .then(setOptions)
      .catch(() => {}) // Registration itself still works with empty lists.
  }, [])

  const refreshOptionsForEmail = () => {
    const email = form.email?.trim()
    if (!email || !EMAIL_RE.test(email)) return
    api.get(`/auth/register-options?email=${encodeURIComponent(email)}`)
      .then(setOptions)
      .catch(() => {})
  }

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

    // Checked here as well as on the server so the answer arrives while the
    // field is still in front of you, rather than after a round trip.
    if (form.enrollment_no?.trim() && !/^\d{7}$/.test(form.enrollment_no.trim())) {
      next.enrollment_no = 'Seven digits, e.g. 2143210'
    }
    if (form.employee_id?.trim() && !/^\d{7}$/.test(form.employee_id.trim())) {
      next.employee_id = 'Seven digits, e.g. 2143210'
    }
    if (form.phone?.trim()) {
      // Spaces, dashes and +91 are all ways of writing the same number.
      const digits = form.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '')
      if (digits.length !== 10) next.phone = 'Enter a 10-digit mobile number'
    }
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
        department_code: isTechnician ? (form.department_code || null) : null,
        programme_code: isAcademic ? (form.programme_code || null) : null,
        academic_year: (role === 'student' && form.academic_year) ? Number(form.academic_year) : null,
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
          <Input type="email" value={form.email || ''} onChange={set('email')} onBlur={refreshOptionsForEmail}
                 placeholder="you@campus.edu" error={errors.email} />
        </Field>

        {extras.map((f) => (
          <Field key={f.name} label={f.label} error={errors[f.name]}
                 required={f.required} hint={f.hint}>
            <Input value={form[f.name] || ''} onChange={set(f.name)}
                   inputMode={f.numeric ? 'numeric' : undefined}
                   placeholder={f.placeholder} error={errors[f.name]} />
          </Field>
        ))}

        {/* Academic programme — students and teachers. A course (Computer
            Science, Data Science, Mass Media, Finance, ...), never the
            maintenance org chart below. */}
        {isAcademic && (
          <Field label="Course / Department" hint="Your academic programme">
            <Select value={form.programme_code || ''} onChange={set('programme_code')}>
              <option value="">Select your course</option>
              {options.programmes.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </Select>
            {options.programmes.length === 0 && (
              <p className="hint mt-1">
                No courses are configured yet — you can add this later from your profile.
              </p>
            )}
          </Field>
        )}

        {role === 'student' && (
          <Field label="Academic year" hint="Which year of your course you're in">
            <Select value={form.academic_year || ''} onChange={set('academic_year')}>
              <option value="">Select a year</option>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* Operational department — technicians only. The team a
            technician's work orders route through (Electrical & Maintenance,
            AV & Media, ...), never an academic course. */}
        {isTechnician && (
          <Field label="Department" hint="Work orders and issues will route to this department">
            <Select value={form.department_code || ''} onChange={set('department_code')}>
              <option value="">Select a department</option>
              {options.departments.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </Select>
            {options.departments.length === 0 && (
              <p className="hint mt-1">
                No departments are configured yet — an administrator can assign one later.
              </p>
            )}
          </Field>
        )}

        <Field label="Phone" error={errors.phone}
               hint="Optional — used for urgent notifications">
          <Input type="tel" inputMode="numeric" value={form.phone || ''} onChange={set('phone')}
                 error={errors.phone} placeholder="98765 43210" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Password" error={errors.password} required>
            <PasswordInput autoComplete="new-password" value={form.password || ''} onChange={set('password')} error={errors.password} />
          </Field>
          <Field label="Confirm password" error={errors.confirm} required>
            <PasswordInput autoComplete="new-password" value={form.confirm || ''} onChange={set('confirm')} error={errors.confirm} />
          </Field>
        </div>
        {form.password && <PasswordStrengthMeter score={strength.score} label={strength.label} />}
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
