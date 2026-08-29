import clsx from 'clsx'
import { Camera, ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { CameraCapture, isTouchDevice } from '@/components/CameraCapture'
import { toast } from '@/components/ui'
import { mediaUrl, upload } from '@/lib/api'

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
  const [cameraOpen, setCameraOpen] = useState(false)
  const inputRef = useRef(null)
  const captureRef = useRef(null)

  const addFiles = useCallback(
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

      const done = []

      await Promise.all(
        batch.map(async (file, i) => {
          const mark = marks[i]
          const body = new FormData()
          body.append('file', file)
          try {
            done.push(await upload('/uploads/image', body, { params: { purpose } }))
          } catch (err) {
            toast.error(`${file.name}: ${err.detail || err.message}`)
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
      <div
        onDragOver={(e) => { e.preventDefault(); if (!atLimit) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!atLimit) addFiles(e.dataTransfer.files) }}
        className={clsx(
          'flex flex-col items-center justify-center gap-3 py-7 px-4 rounded-xl border-2 border-dashed transition-colors',
          atLimit
            ? 'border-border bg-surface-sunken opacity-60'
            : dragging
              ? 'border-secondary bg-info-bg'
              : 'border-secondary/30 bg-info-bg/40',
        )}
      >
        <div className="w-11 h-11 rounded-xl bg-secondary/10 grid place-items-center">
          <ImagePlus size={20} className="text-secondary" />
        </div>

        <p className="text-body-md text-ink text-center">
          {atLimit
            ? `Maximum of ${max} images attached`
            : <>Drag and drop photos here<br />
                <span className="text-ink-faint">or pick one of the options below</span></>}
        </p>

        {!atLimit && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-secondary btn-sm"
            >
              <Upload size={14} /> Browse files
            </button>
            <button
              type="button"
              onClick={() => {
                // A phone's own camera app beats anything we can render, and it
                // is the one place <input capture> actually opens a camera.
                if (isTouchDevice()) captureRef.current?.click()
                else setCameraOpen(true)
              }}
              className="btn-secondary btn-sm"
            >
              <Camera size={14} /> Take photo
            </button>
          </div>
        )}

        <input
          ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          disabled={atLimit}
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
        <input
          ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden"
          disabled={atLimit}
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(files) => addFiles(files)}
      />

      {hint && <p className="hint">{hint}</p>}

      {(value.length > 0 || pending.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((img, i) => (
            <div key={img.url}
                 className="relative w-24 h-24 rounded-xl overflow-hidden border border-border-subtle group">
              <img src={mediaUrl(img.thumb_url || img.url)} alt={img.filename || 'Attachment'}
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
                 className="relative w-24 h-24 rounded-xl overflow-hidden border border-border-subtle">
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
