import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Bell,
  Clock,
  Contrast,
  Download,
  KeyRound,
  LogOut,
  Mail,
  Palette,
  ShieldAlert,
  Sparkles,
  Table2,
  Trash2,
  Type,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ColorThemeSwitcher } from '@/components/ColorThemeSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button, Field, Input, Select, Widget, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const SUPPORT_EMAIL = 'techcareit.in@gmail.com'

/**
 * Defaults for everything this page controls.
 *
 * Kept in one place and merged over whatever the server has, so a preference
 * added later reads as its default for existing accounts rather than as
 * `undefined` — which would otherwise render as an unchecked box and quietly
 * opt people out of notifications they never turned off.
 */
const DEFAULTS = {
  notify: {
    channel_email: true,
    channel_inapp: true,
    issue_status: true,
    work_assigned: true,
    lostfound_match: true,
    sla_breach: true,
    comments: true,
    digest: false,
  },
  display: {
    density: 'comfortable',
    time_format: '24h',
    week_start: 'monday',
    reduce_motion: false,
  },
}

function merge(saved) {
  return {
    notify: { ...DEFAULTS.notify, ...(saved?.notify || {}) },
    display: { ...DEFAULTS.display, ...(saved?.display || {}) },
  }
}

const NOTIFY_EVENTS = [
  ['issue_status', 'Issue status changes', 'When something you reported is assigned, resolved or closed.'],
  ['work_assigned', 'Work assigned to me', 'A new work order or inspection lands in your queue.'],
  ['lostfound_match', 'Lost & Found matches', 'A found item scores against something you reported lost.'],
  ['sla_breach', 'SLA at risk', 'A ticket you own is about to breach its response or resolution target.'],
  ['comments', 'Comments and mentions', 'Someone replies on a ticket you are part of.'],
  ['digest', 'Weekly summary', 'One email on Monday with the week ahead. Off by default.'],
]

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()

  const [prefs, setPrefs] = useState(() => merge(user?.preferences))
  const [dirty, setDirty] = useState(false)

  // Adopt the server's copy whenever it changes underneath us — another tab,
  // or the initial /auth/me landing after this page has already mounted.
  useEffect(() => {
    if (!dirty) setPrefs(merge(user?.preferences))
  }, [user?.preferences]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sent to the address on the account, never one supplied here — an export
  // that takes a destination is a way to read someone else's data.
  const exportData = useMutation({
    mutationFn: () => api.post('/auth/me/export'),
    onSuccess: (d) => toast.success(d.detail),
    onError: (err) => toast.error(err.detail || 'Could not prepare your data export.'),
  })

  const deletion = useQuery({
    queryKey: ['my-deletion-request'],
    queryFn: () => api.get('/auth/me/delete-request'),
    retry: false,
  })

  const requestDeletion = useMutation({
    mutationFn: (reason) => api.post('/auth/me/delete-request', { reason }),
    onSuccess: (d) => { toast.success(d.detail); deletion.refetch() },
    onError: (err) => toast.error(err.detail || 'Could not send your request.'),
  })

  const withdraw = useMutation({
    mutationFn: () => api.del('/auth/me/delete-request'),
    onSuccess: (d) => { toast.success(d.detail); deletion.refetch() },
    onError: (err) => toast.error(err.detail || 'Could not withdraw your request.'),
  })

  const save = useMutation({
    mutationFn: (next) => api.patch('/auth/me', { preferences: next }),
    onSuccess: (u) => { setUser(u); setDirty(false); toast.success('Preferences saved.') },
    onError: (err) => toast.error(err.detail || 'Could not save your preferences.'),
  })

  const update = (group, key, value) => {
    setPrefs((p) => ({ ...p, [group]: { ...p[group], [key]: value } }))
    setDirty(true)
  }

  // Motion is applied immediately rather than on save: a preference about
  // discomfort should take effect the moment it is set.
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !!prefs.display.reduce_motion)
  }, [prefs.display.reduce_motion])

  return (
    <div className="space-y-4 max-w-3xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg text-ink">Settings</h1>
          <p className="text-body-md text-ink-muted mt-1">
            How Campus Netra looks, what it tells you about, and your account security.
          </p>
        </div>
        <Link to="/profile" className="btn-secondary">My profile</Link>
      </header>

      {/* ---------------- Appearance ---------------- */}
      <Widget
        title={<span className="flex items-center gap-2"><Palette size={17} /> Appearance</span>}
        subtitle="Applies on this device only"
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-body-lg font-medium text-ink">Theme</p>
              <p className="text-body-md text-ink-muted mt-0.5">
                "Match device" follows your system setting and switches with it.
              </p>
            </div>
            <ThemeToggle variant="segmented" />
          </div>

          <hr className="border-border-subtle" />

          <ColorThemeSwitcher />

          <hr className="border-border-subtle" />

          <Row
            icon={Table2}
            title="Table density"
            desc="Compact fits roughly a third more rows on screen."
          >
            <Select
              value={prefs.display.density}
              onChange={(e) => update('display', 'density', e.target.value)}
              className="w-40"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </Select>
          </Row>

          <Row icon={Clock} title="Time format" desc="How times are shown across the app.">
            <Select
              value={prefs.display.time_format}
              onChange={(e) => update('display', 'time_format', e.target.value)}
              className="w-40"
            >
              <option value="24h">24-hour · 14:30</option>
              <option value="12h">12-hour · 2:30 PM</option>
            </Select>
          </Row>

          <Row icon={Type} title="Week starts on" desc="Used by calendars and weekly charts.">
            <Select
              value={prefs.display.week_start}
              onChange={(e) => update('display', 'week_start', e.target.value)}
              className="w-40"
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Row>

          <Row
            icon={Contrast}
            title="Reduce motion"
            desc="Removes the transitions on markers, panels and theme changes."
          >
            <Toggle
              checked={prefs.display.reduce_motion}
              onChange={(v) => update('display', 'reduce_motion', v)}
              label="Reduce motion"
            />
          </Row>
        </div>
      </Widget>

      {/* ---------------- Notifications ---------------- */}
      <Widget
        title={<span className="flex items-center gap-2"><Bell size={17} /> Notifications</span>}
        subtitle="What you are told about, and where"
      >
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <ChannelCard
              icon={Bell}
              title="In-app"
              desc="The bell in the header."
              checked={prefs.notify.channel_inapp}
              onChange={(v) => update('notify', 'channel_inapp', v)}
            />
            <ChannelCard
              icon={Mail}
              title="Email"
              desc={user?.email || 'Your registered address'}
              checked={prefs.notify.channel_email}
              onChange={(v) => update('notify', 'channel_email', v)}
            />
          </div>

          <hr className="border-border-subtle" />

          <div className="space-y-1">
            {NOTIFY_EVENTS.map(([key, title, desc]) => (
              <Row key={key} title={title} desc={desc} compact>
                <Toggle
                  checked={prefs.notify[key]}
                  onChange={(v) => update('notify', key, v)}
                  label={title}
                />
              </Row>
            ))}
          </div>

          {!prefs.notify.channel_email && !prefs.notify.channel_inapp && (
            <p className="text-body-md text-warning-text bg-warning-bg border border-warning-border rounded-xl px-3.5 py-2.5">
              Both channels are off, so nothing above can reach you. Urgent safety
              notices are still sent regardless.
            </p>
          )}
        </div>
      </Widget>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-body-sm text-ink-faint">Unsaved changes</span>}
        <Button
          onClick={() => save.mutate(prefs)}
          loading={save.isPending}
          disabled={!dirty}
        >
          Save preferences
        </Button>
      </div>

      <SecuritySection user={user} logout={logout} navigate={navigate} />

      {/* ---------------- Data ---------------- */}
      <Widget
        title={<span className="flex items-center gap-2"><ShieldAlert size={17} /> Your data</span>}
      >
        <div className="space-y-1">
          <Row
            icon={Download}
            title="Request a copy of your data"
            desc={user?.email
              ? `Everything stored against your account, emailed to ${user.email}.`
              : 'Everything stored against your account, by email.'}
            compact
          >
            <Button
              size="sm" variant="secondary"
              loading={exportData.isPending}
              onClick={() => exportData.mutate()}
            >
              Email it to me
            </Button>
          </Row>
          <Row
            icon={Trash2}
            title="Delete my account"
            desc="Reports you filed stay on the record; your name is removed from them."
            compact
          >
            {deletion.data?.status === 'pending' ? (
              <Button size="sm" variant="ghost" loading={withdraw.isPending}
                      onClick={() => withdraw.mutate()}>
                Withdraw request
              </Button>
            ) : (
              <Button
                size="sm" variant="secondary" className="text-danger-text"
                loading={requestDeletion.isPending}
                onClick={() => {
                  if (!confirm(
                    'Ask an administrator to remove your account?\n\n'
                    + 'It is reviewed first. If approved, your name and contact details '
                    + 'are removed and you can no longer sign in — the reports you filed '
                    + 'stay on the campus record without your name.',
                  )) return
                  const reason = prompt('Anything the administrator should know? (optional)')
                  requestDeletion.mutate(reason || null)
                }}
              >
                Request
              </Button>
            )}
          </Row>

          {/* The answer belongs where the question was asked, not only in a
              notification that scrolls away. */}
          {deletion.data?.status === 'pending' && (
            <p className="text-body-md text-warning-text bg-warning-bg border border-warning-border
                          rounded-xl px-3.5 py-2.5 mt-1">
              Awaiting an administrator's decision. You can withdraw it until then.
            </p>
          )}
          {deletion.data?.status === 'rejected' && (
            <p className="text-body-md text-ink-muted bg-surface-sunken border border-border-subtle
                          rounded-xl px-3.5 py-2.5 mt-1">
              Your last request was declined.
              {deletion.data.decision_note ? ` ${deletion.data.decision_note}` : ''}
            </p>
          )}
        </div>
      </Widget>

      <p className="text-body-sm text-ink-faint text-center pb-2 flex items-center justify-center gap-1.5">
        <Sparkles size={13} /> Campus Netra · Precision Intelligence
      </p>
    </div>
  )
}

/* ---------------- Security ---------------- */

function SecuritySection({ user, logout, navigate }) {
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', {
      current_password: pw.current_password,
      new_password: pw.new_password,
    }),
    onSuccess: (d) => {
      toast.success(d.detail || 'Password changed.')
      setPw({ current_password: '', new_password: '', confirm: '' })
      setErrors({})
    },
    onError: (err) => {
      if (err.fields) setErrors(err.fields)
      else toast.error(err.detail || 'Could not change your password.')
    },
  })

  const strength = useMemo(() => scorePassword(pw.new_password), [pw.new_password])

  const submit = (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) {
      setErrors({ confirm: 'These do not match.' })
      return
    }
    setErrors({})
    changePassword.mutate()
  }

  return (
    <Widget
      title={<span className="flex items-center gap-2"><KeyRound size={17} /> Security</span>}
      subtitle="Changing your password signs out every other device"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password" error={errors.current_password} required>
          <Input
            type="password" autoComplete="current-password"
            value={pw.current_password}
            onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="New password" error={errors.new_password} required>
            <Input
              type="password" autoComplete="new-password"
              value={pw.new_password}
              onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
            />
          </Field>
          <Field label="Confirm new password" error={errors.confirm} required>
            <Input
              type="password" autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            />
          </Field>
        </div>

        {pw.new_password && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden flex gap-0.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={clsx(
                    'flex-1 rounded-full transition-colors',
                    i < strength.score
                      ? strength.score <= 1 ? 'bg-danger'
                        : strength.score === 2 ? 'bg-warning' : 'bg-success'
                      : 'bg-transparent',
                  )}
                />
              ))}
            </div>
            <span className="text-body-sm text-ink-muted w-28 text-right">{strength.label}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <button
            type="button"
            onClick={async () => { await logout(); navigate('/login') }}
            className="btn-ghost btn-sm"
          >
            <LogOut size={14} /> Sign out everywhere
          </button>

          <Button
            type="submit"
            loading={changePassword.isPending}
            disabled={!pw.current_password || !pw.new_password}
          >
            Update password
          </Button>
        </div>
      </form>
    </Widget>
  )
}

/** Rough, honest feedback — length dominates, variety helps. */
function scorePassword(value) {
  if (!value) return { score: 0, label: '' }
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score += 1
  return {
    score,
    label: ['Too short', 'Weak', 'Reasonable', 'Strong', 'Very strong'][score] || '',
  }
}

/* ---------------- Small pieces ---------------- */

function Row({ icon: Icon, title, desc, children, compact }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4', compact ? 'py-2.5' : 'py-0')}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <Icon size={16} className="text-ink-faint shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <p className="text-body-lg font-medium text-ink">{title}</p>
          {desc && <p className="text-body-md text-ink-muted mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ChannelCard({ icon: Icon, title, desc, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={clsx(
        'flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-colors',
        checked
          ? 'border-secondary bg-info-bg'
          : 'border-border-subtle bg-surface hover:border-border-strong',
      )}
    >
      <span
        className={clsx(
          'w-9 h-9 rounded-lg grid place-items-center shrink-0',
          checked ? 'bg-secondary/15 text-secondary' : 'bg-surface-sunken text-ink-faint',
        )}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-lg font-medium text-ink">{title}</span>
        <span className="block text-body-sm text-ink-muted truncate">{desc}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={title} asSpan />
    </button>
  )
}

function Toggle({ checked, onChange, label, asSpan }) {
  const Tag = asSpan ? 'span' : 'button'
  return (
    <Tag
      {...(asSpan ? { 'aria-hidden': true } : {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        onClick: () => onChange(!checked),
      })}
      className={clsx(
        'relative inline-flex items-center h-6 w-11 rounded-full transition-colors shrink-0',
        checked ? 'bg-secondary-600' : 'bg-border-strong',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </Tag>
  )
}
