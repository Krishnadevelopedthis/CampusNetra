import { AlertCircle, Camera, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Live camera capture.
 *
 * On a phone, <input capture> already opens the native camera, and that is a
 * better experience than anything rendered in a page. This exists for the
 * desktop case, where a laptop webcam is otherwise unreachable — a facility
 * manager at a desk should not have to email themselves a photo.
 *
 * The stream is stopped on every exit path. A camera light left on after the
 * dialog closes is alarming, and browsers do not clean this up for us.
 */
export function CameraCapture({ open, onClose, onCapture }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [shot, setShot] = useState(null)          // {url, blob}
  const [facing, setFacing] = useState('environment')
  const [hasChoice, setHasChoice] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const start = useCallback(async (mode) => {
    setError(null)
    stop()
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open a camera. Use "Browse files" instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)

      // Only offer the flip control when there is actually something to flip to.
      const cams = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'videoinput')
      setHasChoice(cams.length > 1)
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser’s site settings, or use "Browse files".'
          : err.name === 'NotFoundError'
            ? 'No camera was found on this device. Use "Browse files" instead.'
            : 'The camera could not be started. Use "Browse files" instead.',
      )
    }
  }, [stop])

  useEffect(() => {
    if (!open) return undefined
    start(facing)
    return stop
  }, [open, facing, start, stop])

  // Discard the preview object URL rather than leaking it for the tab's life.
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url) }, [shot])

  const shoot = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    // A selfie camera shows a mirrored preview; capturing it unmirrored would
    // hand back a photo that does not match what the user just framed.
    if (facing === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setShot({ url: URL.createObjectURL(blob), blob })
        stop()
      },
      'image/jpeg',
      0.9,
    )
  }

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(null)
    start(facing)
  }

  const use = () => {
    if (!shot) return
    const file = new File([shot.blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    URL.revokeObjectURL(shot.url)
    setShot(null)
    onCapture([file])
    close()
  }

  const close = () => {
    stop()
    if (shot) { URL.revokeObjectURL(shot.url); setShot(null) }
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary-950/70 backdrop-blur-sm" onClick={close} />

      <div className="relative w-full max-w-2xl bg-surface rounded-2xl border border-border-subtle shadow-level3 overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-widget py-3 border-b border-border-subtle">
          <h2 className="widget-title flex items-center gap-2">
            <Camera size={18} className="text-secondary" />
            {shot ? 'Use this photo?' : 'Take a photo'}
          </h2>
          <button onClick={close} className="btn-ghost h-8 w-8 p-0 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="relative bg-primary-950 aspect-video grid place-items-center">
          {error ? (
            <div className="text-center px-6 py-10">
              <AlertCircle size={28} className="text-warning mx-auto mb-3" />
              <p className="text-body-md text-white/80 max-w-sm">{error}</p>
            </div>
          ) : shot ? (
            <img src={shot.url} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef} playsInline muted
                className="w-full h-full object-contain"
                style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
              />
              {!ready && (
                <p className="absolute text-body-md text-white/70">Starting the camera…</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-widget py-3 border-t border-border-subtle">
          <div>
            {!shot && hasChoice && !error && (
              <button
                type="button"
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                className="btn-secondary btn-sm"
              >
                <RefreshCw size={14} /> Flip camera
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {shot ? (
              <>
                <button type="button" onClick={retake} className="btn-secondary">
                  <RotateCcw size={16} /> Retake
                </button>
                <button type="button" onClick={use} className="btn-primary">
                  Use photo
                </button>
              </>
            ) : (
              <button
                type="button" onClick={shoot} disabled={!ready}
                className="btn-primary btn-lg"
              >
                <Camera size={18} /> Capture
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** True when <input capture> will open a real camera rather than a file picker. */
export function isTouchDevice() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
}
