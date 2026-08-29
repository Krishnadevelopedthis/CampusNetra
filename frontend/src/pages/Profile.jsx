import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Save } from 'lucide-react'
import { useState } from 'react'

import { Avatar, Button, Field, Input, Widget, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { dt } from '@/lib/format'

export default function Profile() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  })
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})

  const save = useMutation({
    mutationFn: () => api.patch('/auth/me', form),
    onSuccess: (u) => { setUser(u); toast.success('Profile updated.') },
    onError: (err) => toast.error(err.detail || 'Could not save'),
  })

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', {
      current_password: pw.current_password, new_password: pw.new_password,
    }),
    onSuccess: (d) => {
      toast.success(d.detail)
      setPw({ current_password: '', new_password: '', confirm: '' })
      setErrors({})
    },
    onError: (err) => {
      if (err.fields) setErrors(err.fields)
      else toast.error(err.detail || 'Could not change password')
    },
  })

  const submitPassword = (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return setErrors({ confirm: 'Passwords do not match' })
    setErrors({})
    changePassword.mutate()
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-headline-lg text-ink">My Profile</h1>
        <p className="text-body-md text-ink-muted mt-1">Your account details and security settings.</p>
      </header>

      <Widget>
        <div className="flex items-center gap-4 pb-5 border-b border-border-subtle">
          <Avatar name={user?.full_name} src={user?.avatar_url} size={64} />
          <div className="min-w-0">
            <p className="text-headline-md text-ink truncate">{user?.full_name}</p>
            <p className="text-body-md text-ink-muted truncate">{user?.email}</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <span className="pill bg-brand-soft text-brand">{ROLE_LABEL[user?.role]}</span>
              {user?.enrollment_no && (
                <span className="pill bg-surface-sunken text-ink-muted font-mono text-body-sm">
                  {user.enrollment_no}
                </span>
              )}
              {user?.employee_id && (
                <span className="pill bg-surface-sunken text-ink-muted font-mono text-body-sm">
                  {user.employee_id}
                </span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="pt-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name">
              <Input value={form.full_name}
                     onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone}
                     onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="Designation" className="sm:col-span-2">
              <Input value={form.designation}
                     onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" icon={Save} loading={save.isPending}>Save changes</Button>
          </div>
        </form>
      </Widget>

      <Widget title={<span className="flex items-center gap-2"><KeyRound size={17} /> Change password</span>}
              subtitle="Changing your password signs out every other device.">
        <form onSubmit={submitPassword} className="space-y-4">
          <Field label="Current password" error={errors.current_password} required>
            <Input type="password" autoComplete="current-password" value={pw.current_password}
                   onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="New password" error={errors.new_password} required>
              <Input type="password" autoComplete="new-password" value={pw.new_password}
                     onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />
            </Field>
            <Field label="Confirm new password" error={errors.confirm} required>
              <Input type="password" autoComplete="new-password" value={pw.confirm}
                     onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={changePassword.isPending}
                    disabled={!pw.current_password || !pw.new_password}>
              Update password
            </Button>
          </div>
        </form>
      </Widget>

      <Widget title="Account">
        <dl className="space-y-3">
          {[
            ['Email verified', user?.email_verified_at ? dt(user.email_verified_at, 'd MMM yyyy') : 'Not verified'],
            ['Last sign-in', user?.last_login_at ? dt(user.last_login_at) : '—'],
            ['Member since', user?.created_at ? dt(user.created_at, 'd MMM yyyy') : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-body-md text-ink-muted">{k}</dt>
              <dd className="text-body-md text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Widget>
    </div>
  )
}
