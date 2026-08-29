import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  Building2,
  Camera,
  Check,
  GraduationCap,
  IdCard,
  Loader2,
  Pencil,
  Phone,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Avatar, Input, Widget, toast } from '@/components/ui'
import { api, mediaUrl, upload } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { dt } from '@/lib/format'

export default function Profile() {
  const { user, setUser } = useAuth()

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/admin/departments'),
    // Students have no reason to see the department list and cannot read it.
    enabled: ['technician', 'facility_manager', 'admin', 'super_admin'].includes(user?.role),
    retry: false,
  })

  const programmes = useQuery({
    queryKey: ['programmes'],
    queryFn: () => api.get('/admin/programmes'),
    enabled: !!user?.programme_id,
    retry: false,
  })

  const department = (departments.data || []).find((d) => d.id === user?.department_id)
  const programme = (programmes.data || []).find((p) => p.id === user?.programme_id)

  return (
    <div className="space-y-4 max-w-4xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg text-ink">My Profile</h1>
          <p className="text-body-md text-ink-muted mt-1">
            How you appear to everyone else on campus.
          </p>
        </div>
        <Link to="/settings" className="btn-secondary">
          Preferences &amp; security
        </Link>
      </header>

      <IdentityCard user={user} setUser={setUser} />

      <ContactCard user={user} setUser={setUser} />

      <Widget title="Campus record" subtitle="Set by your administrator — contact them to correct anything here">
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          <ReadOnlyRow icon={ShieldCheck} label="Role" value={ROLE_LABEL[user?.role] || '—'} />
          {/* A student has a course; staff belong to a maintenance team. Showing
              the row that does not apply is just a permanent "Not assigned". */}
          {['student', 'teacher'].includes(user?.role) ? (
            <ReadOnlyRow
              icon={GraduationCap}
              label="Course"
              value={programme
                ? `${programme.name}${user?.academic_year ? ` · Year ${user.academic_year}` : ''}`
                : 'Not set'}
            />
          ) : (
            <ReadOnlyRow
              icon={Building2}
              label="Department"
              value={department?.name || (user?.department_id ? '—' : 'Not assigned')}
            />
          )}
          {user?.enrollment_no && (
            <ReadOnlyRow icon={IdCard} label="Enrollment number" value={user.enrollment_no} mono />
          )}
          {user?.employee_id && (
            <ReadOnlyRow icon={IdCard} label="Employee ID" value={user.employee_id} mono />
          )}
          <ReadOnlyRow
            icon={BadgeCheck}
            label="Email verified"
            value={user?.email_verified_at ? dt(user.email_verified_at, 'd MMM yyyy') : 'Not verified'}
          />
          <ReadOnlyRow
            icon={UserIcon}
            label="Member since"
            value={user?.created_at ? dt(user.created_at, 'd MMM yyyy') : '—'}
          />
        </dl>
      </Widget>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Identity: the avatar and the name, which is what other people see.
 * ------------------------------------------------------------------ */

function IdentityCard({ user, setUser }) {
  return (
    <div className="widget overflow-hidden">
      {/* A band rather than a flat header, so the avatar has something to sit
          against and the card reads as a profile rather than another form. */}
      <div className="h-24 bg-primary relative">
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
          aria-hidden
        />
      </div>

      <div className="px-widget pb-widget -mt-12">
        <AvatarPicker user={user} setUser={setUser} />

        <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-headline-md text-ink truncate">{user?.full_name}</h2>
            <p className="text-body-md text-ink-muted truncate flex items-center gap-1.5 mt-0.5">
              <AtSign size={14} className="shrink-0 text-ink-faint" />
              {user?.email}
              {user?.email_verified_at && (
                <BadgeCheck size={15} className="text-success shrink-0" aria-label="Verified" />
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="pill bg-brand-soft text-brand">{ROLE_LABEL[user?.role]}</span>
            {user?.designation && (
              <span className="pill bg-surface-sunken text-ink-muted">{user.designation}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AvatarPicker({ user, setUser }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.')
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const data = await upload('/uploads/image', body, { params: { purpose: 'avatar' } })
      const updated = await api.patch('/auth/me', { avatar_url: data.thumb_url || data.url })
      setUser(updated)
      toast.success('Photo updated.')
    } catch (err) {
      toast.error(err.detail || err.message || 'Could not update your photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative inline-block">
      <div className="rounded-full ring-4 ring-surface">
        <Avatar name={user?.full_name} src={mediaUrl(user?.avatar_url)} size={88} />
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Change profile photo"
        className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-secondary-600 text-white
                   grid place-items-center ring-2 ring-surface hover:bg-secondary-700
                   transition-colors disabled:opacity-70"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
      </button>

      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Editable details.
 *
 * Each field can be edited on its own rather than putting the whole card
 * into an edit mode: changing a phone number should not mean re-confirming
 * a name you did not touch.
 * ------------------------------------------------------------------ */

function ContactCard({ user, setUser }) {
  const save = useMutation({
    mutationFn: (patch) => api.patch('/auth/me', patch),
    onSuccess: (u) => { setUser(u); toast.success('Saved.') },
    onError: (err) => toast.error(err.detail || 'Could not save that change.'),
  })

  const fields = [
    {
      key: 'full_name',
      icon: UserIcon,
      label: 'Full name',
      value: user?.full_name,
      placeholder: 'Your name',
      validate: (v) => (v.trim().length < 2 ? 'Enter at least two characters.' : null),
    },
    {
      key: 'phone',
      icon: Phone,
      label: 'Phone',
      value: user?.phone,
      type: 'tel',
      placeholder: 'e.g. 9867943963',
      empty: 'Add a number so technicians can reach you about a report',
      validate: (v) =>
        v && !/^[+\d][\d\s-]{6,19}$/.test(v.trim()) ? 'That does not look like a phone number.' : null,
    },
    {
      key: 'designation',
      icon: Briefcase,
      label: 'Designation',
      value: user?.designation,
      placeholder: 'e.g. Lab Assistant',
      empty: 'Not set',
    },
  ]

  return (
    <Widget title="Details" subtitle="Everything here is editable">
      <div className="divide-y divide-border-subtle -my-2">
        {fields.map(({ key, ...field }) => (
          <EditableRow
            key={key}
            {...field}
            saving={save.isPending && save.variables && key in save.variables}
            onSave={(v) => save.mutateAsync({ [key]: v })}
          />
        ))}
      </div>
    </Widget>
  )
}

function EditableRow({
  icon: Icon, label, value, type = 'text', placeholder, empty = 'Not set',
  validate, onSave, saving,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const cancel = () => { setEditing(false); setDraft(value || ''); setError(null) }

  const commit = async () => {
    const problem = validate?.(draft) ?? null
    if (problem) { setError(problem); return }
    if ((draft || '') === (value || '')) { cancel(); return }
    try {
      await onSave(draft.trim() || null)
      setEditing(false)
      setError(null)
    } catch {
      // The mutation already surfaced the failure; keep the draft so the
      // user's typing is not thrown away by a network blip.
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-ink-faint shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-label-caps uppercase text-ink-muted">{label}</p>

          {editing ? (
            <div className="mt-1.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <Input
                  ref={inputRef}
                  type={type}
                  value={draft}
                  placeholder={placeholder}
                  error={error}
                  onChange={(e) => { setDraft(e.target.value); setError(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit() }
                    if (e.key === 'Escape') cancel()
                  }}
                />
                {error && <p className="field-error">{error}</p>}
              </div>
              <button
                type="button" onClick={commit} disabled={saving}
                className="btn-primary h-10 w-10 p-0" aria-label={`Save ${label}`}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              </button>
              <button
                type="button" onClick={cancel}
                className="btn-secondary h-10 w-10 p-0" aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className={clsx('text-body-lg mt-0.5 truncate', value ? 'text-ink' : 'text-ink-faint')}>
              {value || empty}
            </p>
          )}
        </div>

        {!editing && (
          <button
            type="button" onClick={() => setEditing(true)}
            className="btn-ghost btn-sm shrink-0" aria-label={`Edit ${label}`}
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>
    </div>
  )
}

function ReadOnlyRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon size={16} className="text-ink-faint shrink-0" />
      <dt className="text-body-md text-ink-muted flex-1 min-w-0">{label}</dt>
      <dd className={clsx('text-body-md text-ink text-right', mono && 'font-mono text-body-sm')}>
        {value}
      </dd>
    </div>
  )
}
