import { useMutation, useQuery } from '@tanstack/react-query'
import { Camera, PackageSearch, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, Input, Select, Textarea, Widget, toast } from '@/components/ui'
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
        url: p.url, filename: p.name, is_primary: i === 0,
      })),
    })
  }

  const addPhotos = (files) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setPhotos((prev) => [
      ...prev,
      ...imgs.map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    ].slice(0, 4))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-4xl">
      <header>
        <h1 className="text-headline-lg text-ink">Report an item</h1>
        <p className="text-body-md text-ink-muted mt-1">
          The more detail you give, the more accurately Campus Netra can match it.
        </p>
      </header>

      {/* Lost vs Found */}
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          ['lost', 'I lost something', 'Report an item you can no longer find.'],
          ['found', 'I found something', 'Hand in an item you found on campus.'],
        ].map(([value, title, desc]) => (
          <button
            key={value} type="button" onClick={() => setKind(value)}
            className={`text-left p-4 rounded border transition-colors ${
              kind === value
                ? 'border-secondary bg-info-bg ring-1 ring-secondary'
                : 'border-border-subtle bg-surface hover:bg-surface-sunken'
            }`}
          >
            <p className="text-body-lg font-medium text-ink">{title}</p>
            <p className="text-body-sm text-ink-muted mt-0.5">{desc}</p>
          </button>
        ))}
      </div>

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
          <Field label={`Date & time ${kind}`} error={errors.occurred_at} required>
            <Input type="datetime-local" value={form.occurred_at || ''}
                   onChange={set('occurred_at')} error={errors.occurred_at}
                   max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} />
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
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files) }}
          className="flex flex-col items-center justify-center gap-2 py-8 rounded border-2 border-dashed border-secondary/30 bg-info-bg/40 cursor-pointer hover:bg-info-bg transition-colors"
        >
          <div className="w-11 h-11 rounded-lg bg-secondary/10 grid place-items-center">
            <Camera size={20} className="text-secondary" />
          </div>
          <p className="text-body-md text-ink text-center">
            Drag and drop photos here<br />
            <span className="text-ink-faint">or click to browse</span>
          </p>
          <input type="file" accept="image/*" multiple className="hidden"
                 onChange={(e) => addPhotos(e.target.files)} />
        </label>

        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {photos.map((p, i) => (
              <div key={i} className="relative w-24 h-24 rounded overflow-hidden border border-border-subtle">
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-0 inset-x-0 bg-primary/80 text-white text-[10px] text-center py-0.5">
                    Primary
                  </span>
                )}
                <button type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, x) => x !== i))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary-950/70 text-white grid place-items-center">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
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
