import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, ClipboardList, LogIn, PackageSearch, Search,
  Trash2, UserMinus, UserPlus, UserX, Wrench,
} from 'lucide-react'
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

// Rolling windows, matching the `joined` parameter the API validates.
const JOINED = [
  ['week', 'Joined this week'],
  ['month', 'Joined this month'],
  ['year', 'Joined this year'],
]

export default function AdminUsers() {
  const { isAdmin, user: me } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [joined, setJoined] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const params = {
    page, page_size: 20,
    q: q || undefined,
    role: role || undefined,
    status: statusFilter || undefined,
    joined: joined || undefined,
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

  // Deleting outright is only possible while nothing on the campus record
  // points at the account. When something does, the API says so and offers to
  // strip the person from the row instead — which is a different enough
  // outcome that it gets its own confirmation rather than happening silently.
  const remove = useMutation({
    mutationFn: ({ id, anonymise }) =>
      api.del(`/admin/users/${id}`, { params: anonymise ? { anonymise: 1 } : undefined }),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: (d) => { toast.success(d.detail); invalidate(); setViewing(null) },
    onSettled: () => setPendingId(null),
  })

  const askRemove = (u) => {
    if (!confirm(
      `Delete ${u.full_name}?\n\nThis removes the account permanently and cannot `
      + 'be undone.',
    )) return
    remove.mutate({ id: u.id, anonymise: false }, {
      onError: (err) => {
        if (err.status !== 409) return toast.error(err.detail || 'Could not delete')
        if (confirm(
          `${err.detail}\n\nRemove their name from the account instead? They will no `
          + 'longer be able to sign in, and their reports stay on the record without '
          + 'their name. This cannot be undone.',
        )) {
          remove.mutate({ id: u.id, anonymise: true },
                        { onError: (e) => toast.error(e.detail || 'Could not delete') })
        }
      },
    })
  }

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

          <Select value={joined} onChange={(e) => { setJoined(e.target.value); setPage(1) }}
                  className="w-auto min-w-[170px]">
            <option value="">Joined any time</option>
            {JOINED.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>

          {(role || statusFilter || joined || q) && (
            <Button variant="ghost" size="sm"
                    onClick={() => {
                      setRole(''); setStatusFilter(''); setJoined(''); setQ(''); setPage(1)
                    }}>
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
                      <tr key={u.id} onClick={() => setViewing(u)}
                          className="cursor-pointer hover:bg-surface-sunken"
                          title={`Open ${u.full_name}'s record`}>
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
                        {/* Buttons sit inside the clickable row, so their
                            clicks must not also open the record behind them. */}
                        <td onClick={(e) => e.stopPropagation()}>
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
                              <Button size="sm" variant="ghost" icon={Trash2}
                                      className="text-danger-text"
                                      aria-label={`Delete ${u.full_name}`}
                                      loading={pendingId === u.id}
                                      disabled={!!pendingId}
                                      onClick={() => askRemove(u)} />
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
      <UserDetailModal
        user={viewing} onClose={() => setViewing(null)}
        onEdit={(u) => { setViewing(null); setEditing(u) }}
        onDelete={askRemove} canManage={isAdmin() && viewing?.id !== me?.id}
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


/* ================== One person's record ================== */

/**
 * Opened by clicking a row: everything held about that account in one place.
 *
 * Deliberately the same collector the person's own data export uses, so what an
 * administrator sees here and what the individual can ask for cannot drift
 * apart. Sign-ins are shown before the reports because the question that brings
 * anyone to this screen is usually "when was this account last used, and by
 * whom" rather than "what have they filed".
 */
function UserDetailModal({ user, onClose, onEdit, onDelete, canManage }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-user-detail', user?.id],
    queryFn: () => api.get(`/admin/users/${user.id}/detail`),
    enabled: !!user,
  })

  if (!user) return null
  const a = data?.account

  return (
    <Modal
      open={!!user} onClose={onClose} size="lg"
      title={
        <span className="flex items-center gap-2.5">
          <Avatar name={user.full_name} src={mediaUrl(user.avatar_url)} size={32} />
          {user.full_name}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => onEdit(user)}>Edit</Button>
              <Button variant="danger" icon={Trash2}
                      onClick={() => onDelete(user)}>Delete</Button>
            </>
          )}
        </>
      }
    >
      {isLoading ? <SkeletonRows rows={5} cols={2} />
        : error ? <ErrorState error={error} onRetry={refetch} />
        : (
          <div className="space-y-5">
            {data.can_hard_delete === false && canManage && (
              <p className="flex gap-2 items-start text-body-sm text-ink-muted
                            bg-surface-sunken rounded-xl px-3.5 py-2.5">
                <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
                This account is referenced by the campus record below, so it cannot be
                deleted outright. Deleting offers to remove their name instead.
              </p>
            )}

            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Email', a.email],
                ['Role', ROLE_LABEL[a.role] || a.role],
                ['Status', a.status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())],
                ['Phone', a.phone],
                [a.enrollment_no ? 'Enrollment number' : 'Employee ID',
                 a.enrollment_no || a.employee_id],
                ['Designation', a.designation],
                ['Department', a.department],
                ['Course', a.programme && `${a.programme}${a.academic_year ? `, year ${a.academic_year}` : ''}`],
                ['Registered', a.created_at && `${dt(a.created_at, 'd MMM yyyy, HH:mm')} (${ago(a.created_at)})`],
                ['Email verified', a.email_verified_at
                  ? dt(a.email_verified_at, 'd MMM yyyy, HH:mm') : 'Not verified'],
                ['Last sign-in', a.last_login_at
                  ? `${dt(a.last_login_at, 'd MMM yyyy, HH:mm')} (${ago(a.last_login_at)})` : 'Never'],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-body-sm text-ink-faint">{label}</dt>
                  <dd className="text-ink truncate">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              {[
                [ClipboardList, data.issues_reported.length, 'issues reported'],
                [PackageSearch, data.lost_found_reports.length, 'lost & found reports'],
                [Wrench, data.work_orders_assigned.length, 'work orders'],
                [CalendarClock, data.inspections_assigned.length, 'inspections'],
                [LogIn, data.sign_ins.length, 'recorded sign-ins'],
              ].map(([Icon, n, label]) => (
                <span key={label} className="pill bg-surface-sunken text-ink-muted gap-1.5">
                  <Icon size={13} />{n} {label}
                </span>
              ))}
            </div>

            <DetailList
              title="Sign-in history" icon={LogIn} rows={data.sign_ins}
              empty="This account has never signed in."
              render={(l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-ink whitespace-nowrap">
                    {dt(l.at, 'd MMM yyyy, HH:mm')}
                  </span>
                  <span className="text-body-sm text-ink-faint truncate text-right">
                    {l.succeeded ? (l.ip || 'signed in')
                      : `failed — ${l.failure_reason || 'wrong credentials'}`}
                  </span>
                </div>
              )}
            />

            <DetailList
              title="Issues reported" icon={ClipboardList} rows={data.issues_reported}
              empty="They have not reported anything."
              render={(x) => (
                <div key={x.reference} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="font-mono text-[11px] text-ink-faint mr-2">{x.reference}</span>
                    <span className="text-ink">{x.title}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusPill status={x.status} />
                    <span className="text-body-sm text-ink-faint whitespace-nowrap">
                      {dt(x.created_at, 'd MMM yy')}
                    </span>
                  </span>
                </div>
              )}
            />

            <DetailList
              title="Lost & found" icon={PackageSearch} rows={data.lost_found_reports}
              empty="No lost or found items reported."
              render={(x) => (
                <div key={x.reference} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="pill bg-brand-soft text-brand mr-2">{x.kind}</span>
                    <span className="text-ink">{x.title}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusPill status={x.status} />
                    <span className="text-body-sm text-ink-faint whitespace-nowrap">
                      {dt(x.created_at, 'd MMM yy')}
                    </span>
                  </span>
                </div>
              )}
            />

            {data.work_orders_assigned.length > 0 && (
              <DetailList
                title="Work orders assigned" icon={Wrench} rows={data.work_orders_assigned}
                render={(x) => (
                  <div key={x.reference} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="font-mono text-[11px] text-ink-faint mr-2">{x.reference}</span>
                      <span className="text-ink">{x.title}</span>
                    </span>
                    <StatusPill status={x.status} />
                  </div>
                )}
              />
            )}
          </div>
        )}
    </Modal>
  )
}

/**
 * A section showing its first few rows, expandable in place.
 *
 * The obvious approach — a fixed-height box with its own scrollbar — puts a
 * scroll container inside a scrolling dialog, and an account with 75 sign-ins
 * gets five of them. A wheel over the list then moves the list instead of the
 * dialog, so scrolling past a section becomes impossible. Growing the section
 * on request leaves the dialog as the only thing that scrolls.
 */
const PREVIEW_ROWS = 5

function DetailList({ title, icon: Icon, rows, render, empty }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS)

  return (
    <section>
      <h4 className="flex items-center gap-2 text-body-sm font-medium text-ink-muted mb-1.5">
        <Icon size={14} />{title}
        {rows.length > 0 && <span className="text-ink-faint">({rows.length})</span>}
      </h4>
      {rows.length === 0 ? (
        <p className="text-body-sm text-ink-faint">{empty}</p>
      ) : (
        <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle px-3.5">
          {shown.map(render)}
          {rows.length > PREVIEW_ROWS && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
                    className="w-full text-left text-body-sm text-brand py-2 hover:underline">
              {expanded ? 'Show fewer'
                : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </section>
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
