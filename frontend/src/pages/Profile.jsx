import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  Building2,
  Camera,
  Check,
  Clock,
  GraduationCap,
  IdCard,
  Loader2,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { Avatar, Button, Input, Modal, Widget, toast } from '@/components/ui'
import { api, upload } from '@/lib/api'
import { ROLE_LABEL, useAuth } from '@/lib/auth'
import { dt, titleCase } from '@/lib/format'
import { OtpInput } from './VerifyEmail'

// Falls back to the backend's own default (OTP_EXPIRE_MINUTES=10) for
// responses from a server build that predates the expires_in field, so the
// timer still shows something sane instead of stalling at 0:00.
const DEFAULT_OTP_SECONDS = 600
const RESEND_COOLDOWN_SECONDS = 30

export default function Profile() {
  const { user, setUser } = useAuth()
  const location = useLocation()

  // Contextual search (header) sends people here with a #section hash.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

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
          Preferences & security
        </Link>
      </header>

      <IdentityCard user={user} setUser={setUser} />

      <ContactCard user={user} setUser={setUser} />

      <Widget id="campus-record" title="Campus record" subtitle="Set by your administrator — contact them to correct anything here">
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
        <Avatar name={user?.full_name} src={user?.avatar_url} size={88} />
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
  // The address and number a code has gone to, while they wait to be confirmed.
  const [pendingEmail, setPendingEmail] = useState(null)
  const [pendingPhone, setPendingPhone] = useState(null)

  const save = useMutation({
    mutationFn: (patch) => api.patch('/auth/me', patch),
    onSuccess: (u) => { setUser(u); toast.success('Saved.') },
    onError: (err) => toast.error(err.detail || 'Could not save that change.'),
  })

  // Changing the address is two steps: a code goes to the new one, and the
  // account moves only once that code comes back. PATCH /auth/me takes no
  // email, so saving it like the other fields quietly changed nothing.
  const requestEmailChange = useMutation({
    mutationFn: (new_email) => api.post('/auth/me/change-email', { new_email }),
    onSuccess: (res, new_email) => {
      setPendingEmail({
        value: new_email,
        expiresAt: Date.now() + (res?.expires_in ?? DEFAULT_OTP_SECONDS) * 1000,
      })
      if (res?.dev_code) toast.info('Email is not configured on this server.', `Your code is ${res.dev_code}`)
      else toast.info(`A 6-digit code has been sent to ${new_email}.`)
    },
    onError: (err) => toast.error(err.detail || 'Could not send a code to that address.'),
  })

  const confirmEmailChange = useMutation({
    mutationFn: (otp_code) =>
      api.post('/auth/me/verify-email-change', { new_email: pendingEmail?.value, otp_code }),
    onSuccess: (u) => { setUser(u); setPendingEmail(null); toast.success('Email updated.') },
    onError: (err) => toast.error(err.detail || 'Could not confirm that code.'),
  })

  // The number goes the same way as the address: a code proves it can be
  // reached before anything moves. PATCH /auth/me stopped accepting phone at
  // all, so the old inline save reported success and changed nothing.
  const requestPhoneChange = useMutation({
    mutationFn: (new_phone) => api.post('/auth/me/change-phone', { new_phone }),
    onSuccess: (res, new_phone) => {
      setPendingPhone({
        value: new_phone,
        expiresAt: Date.now() + (res?.expires_in ?? DEFAULT_OTP_SECONDS) * 1000,
      })
      if (res?.dev_code) {
        toast.info('No SMS provider is configured on this server.', `Your code is ${res.dev_code}`)
      } else {
        toast.info(`A 6-digit code has been sent to ${new_phone}.`)
      }
    },
    onError: (err) => toast.error(err.detail || 'Could not send a code to that number.'),
  })

  const confirmPhoneChange = useMutation({
    mutationFn: (otp_code) =>
      api.post('/auth/me/verify-phone-change', { new_phone: pendingPhone?.value, otp_code }),
    onSuccess: (u) => { setUser(u); setPendingPhone(null); toast.success('Phone number updated.') },
    onError: (err) => toast.error(err.detail || 'Could not confirm that code.'),
  })

  // A name has nothing to send a code to, so it is proved with an ID card:
  // either the upload matches well enough to apply at once, or it waits for
  // an administrator. An error here is not worth surfacing — the row simply
  // shows no pending request.
  const nameRequest = useQuery({
    queryKey: ['my-name-change'],
    queryFn: () => api.get('/auth/me/name-change-request'),
    retry: false,
  })

  const requestNameChange = useMutation({
    mutationFn: ({ name, file }) => {
      const body = new FormData()
      body.append('new_full_name', name)
      body.append('id_document', file)
      return upload('/auth/me/change-name', body)
    },
    onSuccess: async (res) => {
      if (res?.status === 'auto_approved') {
        // The endpoint answers with the decision, not the user, so the stored
        // profile is refreshed from the server rather than patched by hand.
        setUser(await api.get('/auth/me'))
        toast.success('Name updated.')
      } else {
        toast.info('Sent for review.', res?.detail || 'An administrator will check your ID.')
      }
      // Best-effort OCR read of the card beyond the name itself -- shown as
      // information only, never written to the profile on its own (#10:
      // "do not blindly trust OCR output"). Whoever reviews the profile can
      // decide to update course/department/class by hand if it's right.
      const found = res?.detected_fields
      if (found && Object.keys(found).length > 0) {
        toast.info(
          'Also read from your ID',
          Object.entries(found).map(([k, v]) => `${titleCase(k)}: ${v}`).join(' · '),
        )
      }
      nameRequest.refetch()
    },
    onError: (err) => toast.error(err.detail || err.message || 'Could not submit that change.'),
  })

  const fields = [
    {
      key: 'phone',
      icon: Phone,
      label: 'Phone',
      value: user?.phone,
      type: 'tel',
      placeholder: 'e.g. 9998880000',
      empty: 'Add a number so technicians can reach you about a report',
      // Matches what the server accepts: +91 and a leading 0 are allowed and
      // stripped, which the old check rejected outright.
      validate: (v) => {
        const digits = (v || '').replace(/\D/g, '')
          .replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '')
        return digits.length === 10 ? null : 'Enter a 10-digit mobile number.'
      },
      saving: requestPhoneChange.isPending,
      onSave: (v) => requestPhoneChange.mutateAsync(v),
      pending: pendingPhone && {
        to: pendingPhone.value,
        expiresAt: pendingPhone.expiresAt,
        confirming: confirmPhoneChange.isPending,
        resending: requestPhoneChange.isPending,
        onConfirm: (code) => confirmPhoneChange.mutateAsync(code),
        onResend: () => requestPhoneChange.mutate(pendingPhone.value),
        onCancel: () => setPendingPhone(null),
      },
    },
    {
      key: 'designation',
      icon: Briefcase,
      label: 'Designation',
      value: user?.designation,
      placeholder: 'e.g. Lab Assistant',
      empty: 'Not set',
    },
    {
      key: 'email',
      icon: Mail,
      label: 'Email',
      value: user?.email,
      type: 'email',
      placeholder: 'you@campus.edu',
      validate: (v) =>
        (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Enter a valid email address.' : null),
      saving: requestEmailChange.isPending,
      onSave: (v) => requestEmailChange.mutateAsync(v),
      pending: pendingEmail && {
        to: pendingEmail.value,
        expiresAt: pendingEmail.expiresAt,
        confirming: confirmEmailChange.isPending,
        resending: requestEmailChange.isPending,
        onConfirm: (code) => confirmEmailChange.mutateAsync(code),
        onResend: () => requestEmailChange.mutate(pendingEmail.value),
        onCancel: () => setPendingEmail(null),
      },
    },
  ]

  return (
    <Widget id="profile-details" title="Details" subtitle="Your name, number and address need verifying when they change">
      <div className="divide-y divide-border-subtle -my-2">
        <NameRow
          icon={UserIcon} label="Full name" value={user?.full_name}
          pending={nameRequest.data?.status === 'pending' ? nameRequest.data : null}
          submitting={requestNameChange.isPending}
          onSubmit={(payload) => requestNameChange.mutateAsync(payload)}
        />
        {fields.map(({ key, onSave, saving, ...field }) => (
          <EditableRow
            key={key}
            {...field}
            saving={saving ?? (save.isPending && save.variables && key in save.variables)}
            onSave={onSave || ((v) => save.mutateAsync({ [key]: v }))}
          />
        ))}
      </div>
    </Widget>
  )
}

function EditableRow({
  icon: Icon, label, value, type = 'text', placeholder, empty = 'Not set',
  validate, onSave, saving, pending,
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

  if (pending) {
    return (
      <>
        <div className="py-3">
          <div className="flex items-center gap-3">
            <Icon size={16} className="text-ink-faint shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-label-caps uppercase text-ink-muted">{label}</p>
              <p className="text-body-lg text-ink mt-0.5 truncate">{value || empty}</p>
            </div>
            <span className="pill bg-info-bg text-info-text shrink-0">Confirming</span>
          </div>
        </div>
        <CodeEntryModal icon={Icon} label={label} {...pending} />
      </>
    )
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
                  icon={Icon}
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

/**
 * The name row, which needs evidence rather than a code.
 *
 * Your name is what everyone else on the campus sees you as, so the server
 * wants a photo of an ID card alongside it. A confident match applies at
 * once; anything less waits for an administrator, and while it waits the row
 * says so rather than offering an edit that would be refused as a duplicate.
 */
function NameRow({ icon: Icon, label, value, pending, submitting, onSubmit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const cancel = () => { setEditing(false); setFile(null); setError(null); setDraft(value || '') }

  const submit = async () => {
    const name = draft.trim()
    if (name.length < 2) { setError('Enter at least two characters.'); return }
    if (name === (value || '')) { cancel(); return }
    if (!file) { setError('Add a photo of your ID card to prove the new name.'); return }
    try {
      await onSubmit({ name, file })
      cancel()
    } catch {
      // The mutation already surfaced the failure; keep what was typed.
    }
  }

  if (pending) {
    return (
      <div className="py-3">
        <div className="flex items-center gap-3">
          <Icon size={16} className="text-ink-faint shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-label-caps uppercase text-ink-muted">{label}</p>
            <p className="text-body-lg text-ink mt-0.5 truncate">{value}</p>
            <p className="text-body-sm text-ink-muted mt-1">
              Waiting for an administrator to approve{' '}
              <span className="text-ink font-medium">{pending.requested_name}</span>.
            </p>
          </div>
          <span className="pill bg-info-bg text-info-text shrink-0">In review</span>
        </div>
      </div>
    )
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-ink-faint shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-label-caps uppercase text-ink-muted">{label}</p>

          {editing ? (
            <>
              <div className="mt-1.5 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    ref={inputRef} icon={Icon} value={draft} placeholder="Your name" error={error}
                    aria-label="New full name"
                    onChange={(e) => { setDraft(e.target.value); setError(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submit() }
                      if (e.key === 'Escape') cancel()
                    }}
                  />
                  {error && <p className="field-error">{error}</p>}
                </div>
                <button
                  type="button" onClick={submit} disabled={submitting}
                  className="btn-primary h-10 w-10 p-0" aria-label="Submit name change"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button
                  type="button" onClick={cancel}
                  className="btn-secondary h-10 w-10 p-0" aria-label="Cancel"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button" onClick={() => fileRef.current?.click()}
                  className="btn-secondary btn-sm" aria-label="Choose a photo of your ID card"
                >
                  <IdCard size={14} /> {file ? 'Change ID photo' : 'Add ID photo'}
                </button>
                <span className="text-body-sm text-ink-faint truncate">
                  {file
                    ? file.name
                    : 'An ID card showing the new name and your enrolment or employee number'}
                </span>
                <input
                  ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null)
                    setError(null)
                    e.target.value = ''
                  }}
                />
              </div>
            </>
          ) : (
            <p className={clsx('text-body-lg mt-0.5 truncate', value ? 'text-ink' : 'text-ink-faint')}>
              {value || 'Not set'}
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

/** Formats a seconds count as mm:ss for the expiry/cooldown timers below. */
function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Second step of changing an address: a popup with the OTP entry, a
 * countdown to when the code expires, and a resend button that's disabled
 * for a short cooldown so a slow network doesn't turn one tap into three
 * codes racing each other.
 */
function CodeEntryModal({ icon: Icon, label, to, expiresAt, confirming, resending, onConfirm, onResend, onCancel }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [cooldownUntil, setCooldownUntil] = useState(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // A resend replaces expiresAt with a fresh one from the server response,
  // so treat that as the signal to restart the resend cooldown too.
  useEffect(() => { setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000) }, [expiresAt])

  const secondsLeft = Math.max(0, (expiresAt - now) / 1000)
  const expired = secondsLeft <= 0
  const cooldownLeft = Math.max(0, (cooldownUntil - now) / 1000)
  const canResend = cooldownLeft <= 0 && !resending

  const submit = async () => {
    if (expired) { setError('This code has expired. Send a new one.'); return }
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return }
    try {
      await onConfirm(code)
    } catch {
      // The mutation already surfaced the failure; keep the code for a retry.
    }
  }

  return (
    <Modal open onClose={onCancel} title={`Confirm your new ${label.toLowerCase()}`} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Icon size={18} className="text-ink-faint shrink-0 mt-0.5" />
          <p className="text-body-md text-ink-muted">
            Enter the code sent to <span className="text-ink font-medium">{to}</span>.
          </p>
        </div>

        <OtpInput value={code} onChange={(v) => { setCode(v); setError(null) }}
                  error={error} disabled={confirming} />
        {error && <p className="field-error text-center">{error}</p>}

        <div className="flex items-center justify-between text-body-sm">
          <span className={clsx('flex items-center gap-1.5', expired ? 'text-danger-text' : 'text-ink-faint')}>
            <Clock size={13} />
            {expired ? 'Code expired' : `Expires in ${formatCountdown(secondsLeft)}`}
          </span>
          <button
            type="button" onClick={onResend} disabled={!canResend}
            className={clsx(
              'font-medium',
              canResend ? 'text-secondary hover:underline' : 'text-ink-faint cursor-not-allowed',
            )}
          >
            {resending ? 'Sending…' : canResend ? 'Send again' : `Resend in ${formatCountdown(cooldownLeft)}`}
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className="flex-1" onClick={submit} loading={confirming} disabled={expired}>
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
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
