import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, ClipboardCheck, Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  Widget,
  toast,
} from '@/components/ui'
import { api } from '@/lib/api'

/* ============================ Inspection checklists ============================ */
export function AdminInspectionConfig() {
  const qc = useQueryClient()
  const [form, setForm] = useState(null)

  const templates = useQuery({
    queryKey: ['inspection-templates'], queryFn: () => api.get('/inspections/templates'),
  })

  const save = useMutation({
    mutationFn: (f) => f.id
      ? api.patch(`/admin/inspection-templates/${f.id}`, payload(f))
      : api.post('/admin/inspection-templates', payload(f)),
    onSuccess: (d) => {
      toast.success(`${d.name} saved with ${d.items} checks.`)
      setForm(null)
      qc.invalidateQueries({ queryKey: ['inspection-templates'] })
    },
    onError: (e) => toast.error(e.detail || 'Could not save the template'),
  })

  const deactivate = useMutation({
    mutationFn: (id) => api.del(`/admin/inspection-templates/${id}`),
    onSuccess: (d) => {
      toast.success(d.detail)
      qc.invalidateQueries({ queryKey: ['inspection-templates'] })
    },
    onError: (e) => toast.error(e.detail),
  })

  if (templates.isLoading) return <Spinner label="Loading checklists…" />
  if (templates.error) return <ErrorState error={templates.error} onRetry={templates.refetch} />

  const blank = () => setForm({
    name: '', description: '', frequency_days: 90,
    items: [{ prompt: '', requires_photo: false, is_critical: false }],
  })

  return (
    <div className="space-y-5">
      <Widget
        title="Inspection Checklists"
        subtitle="A failed critical check raises a routed, high-priority issue automatically"
        action={<Button icon={Plus} onClick={blank}>New checklist</Button>}
        bodyClass="p-0"
      >
        {templates.data.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No checklists yet"
                      description="Create one, then schedule inspections against it."
                      action={<Button onClick={blank}>New checklist</Button>} />
        ) : (
          <div className="divide-y divide-border-subtle">
            {templates.data.map((t) => (
              <div key={t.id} className="p-widget">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-lg text-ink">{t.name}</p>
                    {t.description && (
                      <p className="text-body-md text-ink-muted mt-0.5">{t.description}</p>
                    )}
                    <p className="text-body-sm text-ink-faint mt-1">
                      {t.items.length} checks
                      {t.items.filter((i) => i.is_critical).length > 0 &&
                        ` · ${t.items.filter((i) => i.is_critical).length} critical`}
                      {t.frequency_days && ` · every ${t.frequency_days} days`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="secondary"
                            onClick={() => setForm({ ...t, items: t.items.map((i) => ({ ...i })) })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-danger-text"
                            loading={deactivate.isPending}
                            onClick={() => deactivate.mutate(t.id)} />
                  </div>
                </div>

                <ol className="mt-3 space-y-1">
                  {t.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-body-md">
                      <span className="w-5 text-ink-faint tabular">{i.position}.</span>
                      <span className="text-ink">{i.prompt}</span>
                      {i.is_critical && (
                        <span className="pill bg-danger-bg text-danger-text text-body-sm">
                          <AlertTriangle size={11} /> Critical
                        </span>
                      )}
                      {i.requires_photo && (
                        <span className="pill bg-surface-sunken text-ink-muted text-body-sm">
                          <Camera size={11} /> Photo
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Widget>

      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.id ? `Edit ${form.name}` : 'New checklist'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button icon={Save} loading={save.isPending}
                    disabled={!form?.name || !form?.items?.some((i) => i.prompt.trim())}
                    onClick={() => save.mutate(form)}>
              {form?.id ? 'Save changes' : 'Create checklist'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Checklist name" required>
                <Input value={form.name} placeholder="Monthly Lab Safety Check"
                       onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Repeat every (days)" hint="Leave blank for ad-hoc checks">
                <Input type="number" min="1" value={form.frequency_days ?? ''}
                       onChange={(e) => setForm((f) => ({
                         ...f, frequency_days: e.target.value === '' ? null : Number(e.target.value) }))} />
              </Field>
            </div>
            <Field label="Description">
              <Input value={form.description || ''}
                     onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="label mb-0">Checks</p>
                <Button size="sm" variant="ghost" icon={Plus}
                        onClick={() => setForm((f) => ({
                          ...f, items: [...f.items, { prompt: '', requires_photo: false, is_critical: false }] }))}>
                  Add check
                </Button>
              </div>

              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="rounded border border-border-subtle p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-body-md text-ink-faint tabular mt-2 w-5">{idx + 1}.</span>
                      <Input
                        value={item.prompt} placeholder="What should the inspector verify?"
                        onChange={(e) => setForm((f) => {
                          const items = [...f.items]
                          items[idx] = { ...items[idx], prompt: e.target.value }
                          return { ...f, items }
                        })}
                      />
                      <Button size="sm" variant="ghost" icon={Trash2}
                              className="text-danger-text mt-0.5"
                              disabled={form.items.length === 1}
                              onClick={() => setForm((f) => ({
                                ...f, items: f.items.filter((_, i) => i !== idx) }))} />
                    </div>
                    <div className="flex gap-4 mt-2 ml-7">
                      {[
                        ['is_critical', 'Critical — a failure raises an issue'],
                        ['requires_photo', 'Requires a photo'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-body-sm text-ink-muted cursor-pointer">
                          <input type="checkbox" className="rounded border-border accent-secondary"
                                 checked={item[key]}
                                 onChange={(e) => setForm((f) => {
                                   const items = [...f.items]
                                   items[idx] = { ...items[idx], [key]: e.target.checked }
                                   return { ...f, items }
                                 })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {form.id && (
              <p className="text-body-sm text-ink-faint">
                Editing rewrites the checklist. Inspections already submitted keep the
                wording they were answered against.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

const payload = (f) => ({
  name: f.name, description: f.description || null,
  frequency_days: f.frequency_days || null,
  items: f.items.filter((i) => i.prompt.trim()).map((i) => ({
    prompt: i.prompt.trim(), help_text: i.help_text || null,
    requires_photo: !!i.requires_photo, is_critical: !!i.is_critical,
  })),
})

/* ========================== Notification templates ========================== */
export function AdminNotifications() {
  const qc = useQueryClient()
  const [form, setForm] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => api.get('/admin/notification-templates'),
  })

  const save = useMutation({
    mutationFn: (f) => api.put('/admin/notification-templates', {
      code: f.code, channel: f.channel, subject: f.subject || null,
      body: f.body, is_active: f.is_active ?? true,
    }),
    onSuccess: (d) => {
      toast.success(d.detail)
      setForm(null)
      qc.invalidateQueries({ queryKey: ['notification-templates'] })
    },
    onError: (e) => toast.error(e.detail || 'Could not save the template'),
  })

  if (isLoading) return <Spinner label="Loading templates…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const placeholders = data.available_codes.find((c) => c.code === form?.code)?.placeholders || []
  const configured = new Map(data.templates.map((t) => [`${t.code}|${t.channel}`, t]))

  return (
    <div className="space-y-5">
      <Widget
        title="Notification Templates"
        subtitle="What the platform says when it notifies someone"
        bodyClass="p-0"
      >
        {/* The two columns do not behave the same way, and the difference is
            not guessable from a pair of identical buttons. */}
        <div className="px-widget py-3 border-b border-border-subtle space-y-1.5">
          <p className="text-body-md text-ink-muted">
            <span className="text-ink font-medium">In-app</span> — an event with
            no template uses the platform's built-in wording, so leaving a row
            unset is a perfectly good answer.
          </p>
          <p className="text-body-md text-ink-muted">
            <span className="text-ink font-medium">Email</span> — no email is
            sent for an event until it has an email template. Writing one turns
            the email on; recipients who have switched that event off in their
            own settings still will not receive it.
          </p>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Event</th><th>Placeholders</th><th>Email</th><th>In-app</th></tr>
            </thead>
            <tbody>
              {data.available_codes.map((c) => (
                <tr key={c.code}>
                  <td className="font-mono text-mono-data text-ink">
                    {c.code}
                    {/* Saying so here is the only way an author finds out
                        before writing a message nobody receives. */}
                    {c.live === false && (
                      <span className="block font-sans text-body-sm text-warning-text mt-0.5">
                        Not sent yet
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {c.placeholders.map((ph) => (
                        <code key={ph} className="pill bg-surface-sunken text-ink-muted text-body-sm">
                          {`{{${ph}}}`}
                        </code>
                      ))}
                    </div>
                  </td>
                  {['email', 'in_app'].map((channel) => {
                    const existing = configured.get(`${c.code}|${channel}`)
                    return (
                      <td key={channel}>
                        <Button
                          size="sm" variant={existing ? 'secondary' : 'ghost'}
                          disabled={c.live === false}
                          onClick={() => setForm(existing
                            ? { ...existing }
                            : { code: c.code, channel, subject: '', body: '', is_active: true })}
                        >
                          {existing ? 'Edit' : 'Set up'}
                        </Button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      <Modal
        open={!!form} onClose={() => setForm(null)}
        title={form ? `${form.code} — ${form.channel === 'email' ? 'Email' : 'In-app'}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button icon={Save} loading={save.isPending} disabled={!form?.body?.trim()}
                    onClick={() => save.mutate(form)}>Save template</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <div className="ai-surface p-3">
              <p className="text-body-sm text-ink-muted mb-1.5">
                Available placeholders — anything else is rejected on save, so a typo
                cannot ship as literal text in someone's inbox.
              </p>
              <div className="flex flex-wrap gap-1">
                {placeholders.map((ph) => (
                  <button key={ph} type="button"
                          onClick={() => setForm((f) => ({ ...f, body: `${f.body || ''}{{${ph}}}` }))}
                          className="pill bg-surface border border-border-subtle text-ink hover:bg-surface-sunken text-body-sm">
                    {`{{${ph}}}`}
                  </button>
                ))}
              </div>
            </div>

            {form.channel === 'email' && (
              <Field label="Subject">
                <Input value={form.subject || ''} placeholder="{{reference}} has been assigned to you"
                       onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </Field>
            )}

            <Field label="Message" required>
              <Textarea value={form.body || ''} rows={5}
                        placeholder="Hello {{technician}}, {{reference}} ({{title}}) is now yours."
                        onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </Field>

            <label className="flex items-center gap-2 text-body-md text-ink-muted cursor-pointer">
              <input type="checkbox" className="rounded border-border accent-secondary"
                     checked={form.is_active ?? true}
                     onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
