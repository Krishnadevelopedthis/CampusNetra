import clsx from 'clsx'
import { AlertCircle, Camera, Loader2, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { toast } from '@/components/ui'
import { readAuth } from '@/lib/api'

/**
 * Uploads images as soon as they are picked, rather than at form submit.
 *
 * The parent receives records that already contain a real server URL and a
 * perceptual hash, so submitting the form is a plain JSON post. It also means a
 * failed upload surfaces immediately instead of at the end of a long form.
 *
 * `value` / `onChange` hold the uploaded records; local previews for in-flight
 * files are kept separately so a failure never leaves a phantom attachment.
 */
export function ImageUpload({
  value = [],
  onChange,
  purpose = 'report',
  max = 5,
  hint = 'A photo speeds up diagnosis considerably.',
}) {
  const [pending, setPending] = useState([])   // {id, name, preview}
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const upload = useCallback(
    async (files) => {
      const picked = Array.from(files)
      const images = picked.filter((f) => f.type.startsWith('image/'))
      if (images.length < picked.length) {
        toast.error('Only image files can be attached.')
      }

      const room = max - value.length - pending.length
      if (room <= 0) {
        toast.error(`You can attach at most ${max} images.`)
        return
      }
      const batch = images.slice(0, room)
      if (batch.length < images.length) {
        toast.info(`Only the first ${room} image(s) were added — limit is ${max}.`)
      }

      const marks = batch.map((f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        preview: URL.createObjectURL(f),
      }))
      setPending((p) => [...p, ...marks])

      const token = readAuth()?.access_token
      const done = []

      await Promise.all(
        batch.map(async (file, i) => {
          const mark = marks[i]
          const body = new FormData()
          body.append('file', file)
          try {
            const res = await fetch(`/api/v1/uploads/image?purpose=${purpose}`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body,
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Upload failed')
            done.push(data)
          } catch (err) {
            toast.error(`${file.name}: ${err.message}`)
          } finally {
            URL.revokeObjectURL(mark.preview)
            setPending((p) => p.filter((x) => x.id !== mark.id))
          }
        }),
      )

      if (done.length) onChange([...value, ...done])
    },
    [value, pending.length, max, purpose, onChange],
  )

  const remove = (index) => onChange(value.filter((_, i) => i !== index))
  const atLimit = value.length + pending.length >= max

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }}
        className={clsx(
          'flex flex-col items-center justify-center gap-2 py-8 px-4 rounded border-2 border-dashed transition-colors',
          atLimit
            ? 'border-border bg-surface-sunken cursor-not-allowed opacity-60'
            : dragging
              ? 'border-secondary bg-info-bg cursor-pointer'
              : 'border-secondary/30 bg-info-bg/40 hover:bg-info-bg cursor-pointer',
        )}
      >
        <div className="w-11 h-11 rounded-lg bg-secondary/10 grid place-items-center">
          <Camera size={20} className="text-secondary" />
        </div>
        <p className="text-body-md text-ink text-center">
          {atLimit ? (
            `Maximum of ${max} images attached`
          ) : (
            <>Drag and drop photos here<br />
              <span className="text-ink-faint">or click to browse</span></>
          )}
        </p>
        <input
          ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          disabled={atLimit}
          onChange={(e) => { upload(e.target.files); e.target.value = '' }}
        />
      </label>

      {hint && <p className="hint">{hint}</p>}

      {(value.length > 0 || pending.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((img, i) => (
            <div key={img.url}
                 className="relative w-24 h-24 rounded overflow-hidden border border-border-subtle group">
              <img src={img.thumb_url || img.url} alt={img.filename || 'Attachment'}
                   className="w-full h-full object-cover" />
              <button
                type="button" onClick={() => remove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary-950/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Remove ${img.filename || 'image'}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {pending.map((p) => (
            <div key={p.id}
                 className="relative w-24 h-24 rounded overflow-hidden border border-border-subtle">
              <img src={p.preview} alt="" className="w-full h-full object-cover opacity-40" />
              <div className="absolute inset-0 grid place-items-center bg-surface/40">
                <Loader2 size={18} className="animate-spin text-secondary" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
