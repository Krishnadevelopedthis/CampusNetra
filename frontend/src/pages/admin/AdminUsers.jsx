import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserMinus, UserPlus, UserX } from 'lucide-react'
import { useState } from 'react'

import {
  Avatar, Button, EmptyState, ErrorState, Field, Input, Modal, Select,
  SkeletonRows, StatusPill, Widget, toast,
} from '@/components/ui'
import { api, mediaUrl } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { ago, dt } from '@/lib/format'

const ROLES = ['student', 'teacher', 'technician', 'facility_manager', 'admin']

// Roles that belong to a course rather than to a maintenance team.
const STUDY_ROLES = ['student', 'teacher']

// Values must match UserStatus in backend/app/core/enums.py — the filter is
// validated server-side, so a wrong entry here is a dropdown that 422s.
const STATUSES = ['active', 'deactivated', 'suspended', 'pending_verification']
const STATUS_LABEL = {
  active: 'Active only',
  deactivated: 'Deactivated only',
  suspended: 'Suspended only',
  pending_verification: 'Awaiting verification',
}

export default function AdminUsers() {
  const { isAdmin, user: me } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const params = {
    page, page_size: 20,
    q: q || undefined,
    role: role || undefined,
    status: statusFilter || undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => api.get('/admin/users', { params }),
    keepPreviousData: true,
  })
  const programmes = useQuery({
    queryKey: ['admin-programmes'], queryFn: () => api.get('/admin/programmes'),
  })
  const departments = useQuery({
    queryKey: ['admin-departments'], queryFn: () => api.get('/admin/departments'),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['admin-roles'] })
  }

  // One mutation is shared by every row, so its isPending is true for all of
  // them at once. Binding a row's spinner to that made a single click look like
  // it was deactivating the entire list. Track which row is actually in flight.
  const [pendingId, setPendingId] = useState(null)

  const setStatus = useMutation({
    mutationFn: ({ id, action }) => api.post(`/admin/users/${id}/${action}`),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: (d) => { toast.success(d.detail); invalidate() },
    onError: (err) => toast.error(err.detail),
    onSettled: () => setPendingId(null),
  })

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="space-y-5">
      <DeletionRequests onDecided={invalidate} />

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

          {/* Deactivated accounts are hidden by default, which makes them hard
              to find again — and reactivating one requires finding it first. */}
          <Select value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                  className="w-auto min-w-[170px]">
            <option value="">All statuses</option>
            {STATUSES.map((v) => (
              <option key={v} value={v}>{STATUS_LABEL[v]}</option>
            ))}
          </Select>

          {(role || statusFilter || q) && (
            <Button variant="ghost" size="sm"
                    onClick={() => { setRole(''); setStatusFilter(''); setQ(''); setPage(1) }}>
              Clear
            </Button>
          )}

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
                              {u.status === 'active' ? (
                                <Button size="sm" variant="ghost"
                                        className="text-danger-text"
                                        loading={pendingId === u.id}
                                        disabled={!!pendingId}
                                        onClick={() => {
                                          if (confirm(
                                            `Deactivate ${u.full_name}? They will be signed out `
                                            + 'of every device and cannot sign in until reactivated.',
                                          )) setStatus.mutate({ id: u.id, action: 'deactivate' })
                                        }}>
                                  Deactivate
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost"
                                        className="text-success-text"
                                        loading={pendingId === u.id}
                                        disabled={!!pendingId}
                                        onClick={() => setStatus.mutate({ id: u.id, action: 'activate' })}>
                                  Activate
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
        departments={departments.data || []}
        programmes={programmes.data || []} onDone={invalidate}
      />
      <EditUserModal
        user={editing} onClose={() => setEditing(null)}
        departments={departments.data || []}
        programmes={programmes.data || []} onDone={invalidate}
      />
    </div>
  )
}

function CreateUserModal({ open, onClose, departments, programmes, onDone }) {
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
      programme_id: form.programme_id || null,
      academic_year: form.academic_year ? Number(form.academic_year) : null,
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
          <Field label="Maintenance department" hint="Work orders in this department route here">
            <Select value={form.department_id || ''} onChange={set('department_id')}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}

        {STUDY_ROLES.includes(form.role) && (
          <div className="grid sm:grid-cols-[1fr_120px] gap-4">
            <Field label="Course / Programme">
              <Select value={form.programme_id || ''} onChange={set('programme_id')}>
                <option value="">Not set</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={form.academic_year || ''} onChange={set('academic_year')}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </Select>
            </Field>
          </div>
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

function EditUserModal({ user, onClose, departments, programmes, onDone }) {
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
        {/* Which field applies depends on the role. A student has a course; a
            technician belongs to a maintenance team that work is routed to.
            Offering both to everyone invites filing a student under
            "Electrical & Maintenance", which would then send them every
            electrical fault reported on campus. */}
        {STUDY_ROLES.includes(form.role ?? user.role) ? (
          <div className="grid sm:grid-cols-[1fr_120px] gap-4">
            <Field label="Course / Programme" hint="What they are enrolled on.">
              <Select value={form.programme_id ?? user.programme_id ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, programme_id: e.target.value || null }))}>
                <option value="">Not set</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={form.academic_year ?? user.academic_year ?? ''}
                      onChange={(e) => setForm((f) => ({
                        ...f, academic_year: e.target.value ? Number(e.target.value) : null,
                      }))}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <Field label="Maintenance department" hint="The team work is routed to.">
            <Select value={form.department_id ?? user.department_id ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value || null }))}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Designation">
          <Input value={form.designation ?? user.designation ?? ''}
                 onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  )
}


/* ================== Account deletion requests ================== */

/**
 * Only rendered when somebody is waiting on an answer.
 *
 * A queue that is empty most of the time still has to be noticed on the day it
 * is not, so it sits above the user list rather than behind a tab — and
 * disappears entirely when there is nothing to decide.
 */
function DeletionRequests({ onDecided }) {
  const qc = useQueryClient()
  const requests = useQuery({
    queryKey: ['deletion-requests'],
    queryFn: () => api.get('/admin/deletion-requests'),
    retry: false,
  })

  const decide = useMutation({
    mutationFn: ({ id, action, note }) =>
      api.post(`/admin/deletion-requests/${id}/${action}`, { note }),
    onSuccess: (d) => {
      toast.success(d.detail)
      qc.invalidateQueries({ queryKey: ['deletion-requests'] })
      onDecided?.()
    },
    onError: (err) => toast.error(err.detail || 'Could not record that decision.'),
  })

  const pending = requests.data || []
  if (!pending.length) return null

  return (
    <Widget
      title={
        <span className="flex items-center gap-2">
          <UserMinus size={17} className="text-warning" />
          Account deletion requests
        </span>
      }
      subtitle={`${pending.length} awaiting a decision`}
      bodyClass="p-0"
    >
      <div className="divide-y divide-border-subtle">
        {pending.map((r) => (
          <div key={r.id} className="p-widget space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-lg font-medium text-ink">
                  {r.user.full_name}
                  <span className="pill bg-brand-soft text-brand ml-2">
                    {ROLE_LABEL[r.user.role]}
                  </span>
                </p>
                <p className="text-body-sm text-ink-faint">{r.user.email}</p>
                <p className="text-body-sm text-ink-faint mt-0.5">
                  Requested {ago(r.requested_at)}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm" variant="ghost"
                  loading={decide.isPending && decide.variables?.id === r.id}
                  onClick={() => {
                    const note = prompt(`Why is ${r.user.full_name}'s request being declined?`)
                    if (note === null) return
                    decide.mutate({ id: r.id, action: 'reject', note })
                  }}
                >
                  Decline
                </Button>
                <Button
                  size="sm" variant="danger"
                  loading={decide.isPending && decide.variables?.id === r.id}
                  onClick={() => {
                    if (!confirm(
                      `Anonymise ${r.user.full_name}'s account?\n\n`
                      + 'Their name, email and contact details are removed and they can '
                      + 'no longer sign in. This cannot be undone. The work listed below '
                      + 'stays on the record without their name.',
                    )) return
                    decide.mutate({ id: r.id, action: 'approve', note: null })
                  }}
                >
                  Approve
                </Button>
              </div>
            </div>

            {r.reason && (
              <p className="text-body-md text-ink-muted bg-surface-sunken rounded-xl px-3.5 py-2.5">
                “{r.reason}”
              </p>
            )}

            {/* What approval keeps. Shown because it is the whole reason a
                person has to look at this rather than a button doing it. */}
            <div className="flex flex-wrap gap-2">
              {[
                ['issues_reported', 'issues reported'],
                ['work_orders_assigned', 'work orders'],
                ['lost_found_reports', 'lost & found reports'],
              ].map(([key, label]) => (
                <span key={key} className="pill bg-surface-sunken text-ink-muted">
                  {r.retained?.[key] ?? 0} {label} kept
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}
