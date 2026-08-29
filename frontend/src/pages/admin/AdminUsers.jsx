import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus, UserX } from 'lucide-react'
import { useState } from 'react'

import {
  Avatar, Button, EmptyState, ErrorState, Field, Input, Modal, Select,
  SkeletonRows, StatusPill, Widget, toast,
} from '@/components/ui'
import { api, mediaUrl } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { dt } from '@/lib/format'

const ROLES = ['student', 'teacher', 'technician', 'facility_manager', 'admin']

export default function AdminUsers() {
  const { isAdmin, user: me } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const params = { page, page_size: 20, q: q || undefined, role: role || undefined }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => api.get('/admin/users', { params }),
    keepPreviousData: true,
  })
  const departments = useQuery({
    queryKey: ['admin-departments'], queryFn: () => api.get('/admin/departments'),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['admin-roles'] })
  }

  const deactivate = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/deactivate`),
    onSuccess: (d) => { toast.success(d.detail); invalidate() },
    onError: (err) => toast.error(err.detail),
  })

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="space-y-5">
      <Widget bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 p-widget border-b border-border-subtle">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input className="input pl-9" placeholder="Search name, email or ID…"
                   value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          </div>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}
                  className="w-auto min-w-[170px]">
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
          {isAdmin() && (
            <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>Add user</Button>
          )}
        </div>

        {isLoading ? <SkeletonRows rows={6} cols={6} />
          : error ? <ErrorState error={error} onRetry={refetch} />
          : data.items.length === 0 ? (
            <EmptyState icon={UserX} title="No users match"
                        description="Try a different search or role filter." />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Role</th><th>Identifier</th><th>Status</th>
                        <th>Last sign-in</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.items.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.full_name} src={mediaUrl(u.avatar_url)} size={32} />
                            <div className="min-w-0">
                              <p className="text-ink truncate">
                                {u.full_name}
                                {u.id === me?.id && (
                                  <span className="text-body-sm text-ink-faint ml-1.5">(you)</span>
                                )}
                              </p>
                              <p className="text-body-sm text-ink-faint truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="pill bg-brand-soft text-brand">{ROLE_LABEL[u.role]}</span>
                        </td>
                        <td className="font-mono text-[11px] text-ink-muted">
                          {u.employee_id || u.enrollment_no || '—'}
                        </td>
                        <td><StatusPill status={u.status === 'active' ? 'verified' : u.status} /></td>
                        <td className="text-ink-muted whitespace-nowrap">
                          {u.last_login_at ? dt(u.last_login_at, 'd MMM, HH:mm') : 'Never'}
                        </td>
                        <td>
                          {isAdmin() && u.id !== me?.id && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                              {u.status === 'active' && (
                                <Button size="sm" variant="ghost"
                                        className="text-danger-text"
                                        loading={deactivate.isPending}
                                        onClick={() => deactivate.mutate(u.id)}>
                                  Deactivate
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 p-widget border-t border-border-subtle">
                  <p className="text-body-sm text-ink-muted">
                    {(data.page - 1) * data.page_size + 1}–
                    {Math.min(data.page * data.page_size, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
      </Widget>

      <CreateUserModal
        open={createOpen} onClose={() => setCreateOpen(false)}
        departments={departments.data || []} onDone={invalidate}
      />
      <EditUserModal
        user={editing} onClose={() => setEditing(null)}
        departments={departments.data || []} onDone={invalidate}
      />
    </div>
  )
}

function CreateUserModal({ open, onClose, departments, onDone }) {
  const [form, setForm] = useState({ role: 'student' })
  const [errors, setErrors] = useState({})

  const create = useMutation({
    mutationFn: () => api.post('/admin/users', {
      email: form.email, full_name: form.full_name, role: form.role,
      password: form.password, phone: form.phone || null,
      department_id: form.department_id || null,
      employee_id: form.employee_id || null,
      enrollment_no: form.enrollment_no || null,
      designation: form.designation || null,
    }),
    onSuccess: (u) => {
      toast.success(`${u.full_name} created and activated.`)
      setForm({ role: 'student' }); setErrors({}); onClose(); onDone()
    },
    onError: (err) => {
      if (err.fields) setErrors(err.fields)
      else toast.error(err.detail || 'Could not create user')
    },
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isStudent = form.role === 'student'

  return (
    <Modal
      open={open} onClose={onClose} title="Add a user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending}
                  disabled={!form.email || !form.full_name || !form.password}
                  onClick={() => create.mutate()}>Create user</Button>
        </>
      }
    >
      <p className="text-body-md text-ink-muted mb-4">
        Admin-created accounts skip email verification and are active immediately.
        This is the only way to provision technician, manager and admin roles.
      </p>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" error={errors.full_name} required>
            <Input value={form.full_name || ''} onChange={set('full_name')} error={errors.full_name} />
          </Field>
          <Field label="Email" error={errors.email} required>
            <Input type="email" value={form.email || ''} onChange={set('email')} error={errors.email} />
          </Field>
          <Field label="Role" required>
            <Select value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label={isStudent ? 'Enrollment number' : 'Employee ID'}>
            <Input value={(isStudent ? form.enrollment_no : form.employee_id) || ''}
                   onChange={set(isStudent ? 'enrollment_no' : 'employee_id')} />
          </Field>
        </div>

        {['technician', 'facility_manager'].includes(form.role) && (
          <Field label="Department" hint="Work orders in this department route here">
            <Select value={form.department_id || ''} onChange={set('department_id')}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Temporary password" error={errors.password} required
               hint="At least 8 characters with an uppercase letter, a lowercase letter and a digit.">
          <Input type="text" value={form.password || ''} onChange={set('password')}
                 error={errors.password} placeholder="Campus@2026" />
        </Field>
      </div>
    </Modal>
  )
}

function EditUserModal({ user, onClose, departments, onDone }) {
  const [form, setForm] = useState({})

  const update = useMutation({
    mutationFn: () => api.patch(`/admin/users/${user.id}`, form),
    onSuccess: (u) => { toast.success(`${u.full_name} updated.`); setForm({}); onClose(); onDone() },
    onError: (err) => toast.error(err.detail || 'Could not update'),
  })

  if (!user) return null

  return (
    <Modal
      open={!!user} onClose={onClose} title={`Edit ${user.full_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={update.isPending} disabled={Object.keys(form).length === 0}
                  onClick={() => update.mutate()}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role">
          <Select value={form.role ?? user.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status ?? user.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {['active', 'suspended', 'deactivated'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={form.department_id ?? user.department_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value || null }))}>
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Designation">
          <Input value={form.designation ?? user.designation ?? ''}
                 onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  )
}
