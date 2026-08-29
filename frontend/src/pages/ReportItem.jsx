import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, HandHeart, PackageSearch, SearchX, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, Input, Select, Textarea, Widget, toast } from '@/components/ui'
import { DateTimePicker } from '@/components/DateTimePicker'
import { ImageUpload } from '@/components/ImageUpload'
import { api } from '@/lib/api'

export default function ReportItem() {
  const navigate = useNavigate()
  const [kind, setKind] = useState('lost')
  const [form, setForm] = useState({
    // Default to now, trimmed to minutes for the datetime-local input.
    occurred_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16),
  })
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})

  const categories = useQuery({ queryKey: ['lf-categories'], queryFn: () => api.get('/lost-found/categories') })
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = useMutation({
    mutationFn: (payload) => api.post('/lost-found/items', payload),
    onSuccess: (data) => {
      toast.success(data.message || `${data.item.reference} recorded.`)
      navigate(`/lost-found/items/${data.item.id}`)
    },
    onError: (err) => {
      if (err.fields) setErrors(err.fields)
      else toast.error(err.detail || 'Could not submit the report')
    },
  })

  const onSubmit = (e) => {
    e.preventDefault()
    const next = {}
    if (!form.title?.trim()) next.title = 'What is the item?'
    if (!form.occurred_at) next.occurred_at = `When was it ${kind}?`
    if (Object.keys(next).length) return setErrors(next)

    setErrors({})
    submit.mutate({
      kind,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      category_id: form.category_id || null,
      colour: form.colour?.trim() || null,
      brand: form.brand?.trim() || null,
      distinguishing_marks: form.distinguishing_marks?.trim() || null,
      campus_id: campusId || null,
      building_id: form.building_id || null,
      location_note: form.location_note?.trim() || null,
      zone_code: form.zone_code?.trim() || null,
      occurred_at: new Date(form.occurred_at).toISOString(),
      contact_pref: form.contact_pref || 'in_app',
      holding_location: kind === 'found' ? (form.holding_location?.trim() || null) : null,
      attachments: photos.map((p, i) => ({
        url: p.url, thumb_url: p.thumb_url, filename: p.filename,
        // The primary image's hash is what the L&F matcher compares on.
        phash: p.phash, is_primary: i === 0,
      })),
    })
  }


  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-4xl">
      <header>
        <h1 className="text-headline-lg text-ink">Report an item</h1>
        <p className="text-body-md text-ink-muted mt-1">
          The more detail you give, the more accurately Campus Netra can match it.
        </p>
      </header>

      {/* Which side of the exchange the reporter is on. This choice changes the
          rest of the form, so it is deliberately the largest control on the
          page rather than a pair of radio buttons. */}
      <fieldset>
        <legend className="label mb-2">What are you reporting?</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              value: 'lost',
              icon: SearchX,
              title: 'I lost an item',
              desc: 'Describe it and we will watch for a match.',
              tone: 'warning',
            },
            {
              value: 'found',
              icon: HandHeart,
              title: 'I found an item',
              desc: 'Hand it in so the owner can claim it.',
              tone: 'success',
            },
          ].map(({ value, icon: Icon, title, desc, tone }) => {
            const active = kind === value
            return (
              <button
                key={value} type="button" onClick={() => setKind(value)}
                aria-pressed={active}
                className={clsx(
                  'relative text-left p-4 rounded-xl border-2 flex gap-3.5 items-start transition-all',
                  active
                    ? 'border-secondary bg-info-bg shadow-level2'
                    : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-sunken',
                )}
              >
                <span
                  className={clsx(
                    'w-11 h-11 rounded-xl grid place-items-center shrink-0 transition-colors',
                    active
                      ? tone === 'warning'
                        ? 'bg-warning-bg text-warning-text'
                        : 'bg-success-bg text-success-text'
                      : 'bg-surface-sunken text-ink-faint',
                  )}
                >
                  <Icon size={22} />
                </span>

                <span className="min-w-0">
                  <span className="block text-body-lg font-semibold text-ink">{title}</span>
                  <span className="block text-body-sm text-ink-muted mt-0.5">{desc}</span>
                </span>

                {active && (
                  <CheckCircle2
                    size={18}
                    className="absolute top-3 right-3 text-secondary"
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Widget title="Item details">
        <div className="space-y-4">
          <Field label="What is it?" error={errors.title} required>
            <Input value={form.title || ''} onChange={set('title')}
                   placeholder="e.g. Black Backpack" error={errors.title} />
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Category">
              <Select value={form.category_id || ''} onChange={set('category_id')}>
                <option value="">Select category</option>
                {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Colour">
              <Input value={form.colour || ''} onChange={set('colour')} placeholder="Black" />
            </Field>
            <Field label="Brand">
              <Input value={form.brand || ''} onChange={set('brand')} placeholder="Skybags" />
            </Field>
          </div>

          <Field label="Description">
            <Textarea value={form.description || ''} onChange={set('description')}
                      placeholder="Describe the item and anything it contained." />
          </Field>

          <Field
            label="Distinguishing marks"
            hint={kind === 'found'
              ? 'Noting a unique detail helps verify the real owner later.'
              : 'A detail only you would know strengthens your claim.'}
          >
            <Input value={form.distinguishing_marks || ''} onChange={set('distinguishing_marks')}
                   placeholder="e.g. blue braided cord keychain on the front zip" />
          </Field>
        </div>
      </Widget>

      <Widget title="Where and when">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Building">
            <Select value={form.building_id || ''} onChange={set('building_id')}>
              <option value="">Select building</option>
              {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field
            label={kind === 'found' ? 'When did you find it?' : 'When did you last have it?'}
            error={errors.occurred_at} required
          >
            <DateTimePicker
              value={form.occurred_at || ''}
              onChange={(v) => setForm((f) => ({ ...f, occurred_at: v }))}
              error={errors.occurred_at}
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            />
          </Field>
          <Field label="Specific location" className="sm:col-span-2">
            <Input value={form.location_note || ''} onChange={set('location_note')}
                   placeholder="e.g. North Wing Library, 2nd Floor Study Area" />
          </Field>
          {kind === 'found' && (
            <Field label="Where is it being held?" className="sm:col-span-2"
                   hint="So the owner knows where to collect it.">
              <Input value={form.holding_location || ''} onChange={set('holding_location')}
                     placeholder="e.g. Security Desk, Main Gate" />
            </Field>
          )}
        </div>
      </Widget>

      <Widget title="Photo" subtitle="A clear photo is the strongest matching signal">
        <ImageUpload
          value={photos} onChange={setPhotos} purpose={kind} max={4}
          hint="The first image is used as the primary. Image similarity is one of the five factors the matcher scores on."
        />
      </Widget>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate('/lost-found')}>Cancel</Button>
        <Button type="submit" icon={Send} loading={submit.isPending}>
          Submit and run matching
        </Button>
      </div>
    </form>
  )
}
