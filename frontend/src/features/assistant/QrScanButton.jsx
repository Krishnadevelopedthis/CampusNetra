import clsx from 'clsx'
import { QrCode, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Modal, Spinner, toast } from '@/components/ui'
import { PUBLIC_SITE_URL } from '@/lib/native'

const READER_ID = 'cn-qr-reader'

/**
 * Floating "Scan QR code" button, positioned just above the AI Assistant's
 * own floating button (same corner, same fixed-viewport pattern) so it
 * reads as part of the same cluster of quick actions rather than a
 * separate feature bolted on elsewhere.
 *
 * Scanning an asset's QR code decodes to a same-origin /scan/asset/:id
 * URL (see AdminAssetQR.jsx) — recognized here and handled as an in-app
 * navigation rather than a full page reload, so an already-authenticated
 * user lands straight on the pre-filled complaint form.
 */
export function QrScanButton() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('starting') // 'starting' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  const instanceRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('starting')
    setErrorMessage('')

    import('html5-qrcode').then(async ({ Html5Qrcode }) => {
      if (cancelled) return
      const qr = new Html5Qrcode(READER_ID)
      instanceRef.current = qr

      const onScan = (decodedText) => {
        let path = null
        try {
          const url = new URL(decodedText)
          // Printed codes name the public website; inside the Android app the
          // page origin is https://localhost, so both count as ours.
          if (url.origin === window.location.origin || url.origin === PUBLIC_SITE_URL) {
            path = url.pathname + url.search
          }
        } catch {
          // Not a URL at all — not one of ours, fall through to the error toast below.
        }
        setOpen(false)
        if (path) {
          navigate(path)
        } else {
          toast.error('That QR code is not a recognised CampusNetra asset code.')
        }
      }

      try {
        // { exact: 'environment' } — not just a preference, a requirement —
        // is what actually rules out the front/selfie camera on phones that
        // otherwise default to it; { facingMode: 'environment' } alone is
        // only a hint some browsers ignore.
        await qr.start(
          { facingMode: { exact: 'environment' } },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          onScan,
          () => {}, // per-frame "no code found yet" — expected on almost every frame, not an error
        )
        if (!cancelled) setStatus('ready')
      } catch {
        // Some laptops/desktops have no camera that reports as
        // "environment" at all — fall back to whatever camera exists
        // rather than leaving the scanner dead on those devices.
        try {
          await qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            onScan,
            () => {},
          )
          if (!cancelled) setStatus('ready')
        } catch (err) {
          if (cancelled) return
          setStatus('error')
          setErrorMessage(
            err?.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access and try again.'
              : 'Could not start the camera on this device.',
          )
        }
      }
    })

    return () => {
      cancelled = true
      const qr = instanceRef.current
      instanceRef.current = null
      if (qr) qr.stop().then(() => qr.clear()).catch(() => {})
    }
  }, [open, navigate])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Scan asset QR code"
        title="Scan asset QR code"
        className={clsx(
          'fixed z-40 grid place-items-center rounded-full shadow-level3',
          'bg-secondary text-white hover:brightness-110',
          // Stacked just above the assistant button, which itself clears the tab bar below lg.
          'bottom-[calc(8.25rem+env(safe-area-inset-bottom))] right-3 h-10 w-10 sm:bottom-[calc(9rem+env(safe-area-inset-bottom))] sm:right-6 sm:h-12 sm:w-12 lg:bottom-[6rem]',
          'transition-transform hover:scale-105 active:scale-95',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
        )}
      >
        <QrCode size={20} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Scan asset QR code" size="sm">
        <p className="text-body-sm text-ink-faint mb-3 flex items-center gap-1.5">
          <ScanLine size={14} className="text-secondary shrink-0" />
          Point your back camera at the QR code on the asset to raise a complaint for it directly.
        </p>

        <div className="relative rounded-lg overflow-hidden bg-surface-sunken min-h-[240px]">
          {status === 'starting' && (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner label="Starting camera…" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <p className="text-body-sm text-danger-text">{errorMessage}</p>
            </div>
          )}
          <div id={READER_ID} className={status === 'ready' ? '' : 'invisible'} />
        </div>
      </Modal>
    </>
  )
}
