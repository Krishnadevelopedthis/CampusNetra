import clsx from 'clsx'
import { QrCode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Modal, toast } from '@/components/ui'

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
  const navigate = useNavigate()
  const scannerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let scanner

    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (cancelled) return
      scanner = new Html5QrcodeScanner(READER_ID, { fps: 10, qrbox: 240 }, false)
      scannerRef.current = scanner
      scanner.render(
        (decodedText) => {
          let path = null
          try {
            const url = new URL(decodedText)
            if (url.origin === window.location.origin) path = url.pathname + url.search
          } catch {
            // Not a URL at all — not one of ours, fall through to the error toast below.
          }
          scanner.clear().catch(() => {})
          setOpen(false)
          if (path) {
            navigate(path)
          } else {
            toast.error('That QR code is not a recognised CampusNetra asset code.')
          }
        },
        () => {}, // per-frame "no code found yet" — expected on almost every frame, not an error
      )
    })

    return () => {
      cancelled = true
      scannerRef.current?.clear().catch(() => {})
      scannerRef.current = null
    }
  }, [open, navigate])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Scan asset QR code"
        className={clsx(
          'fixed z-40 grid place-items-center rounded-full shadow-level3',
          'bg-surface border border-border-subtle text-ink-muted hover:text-secondary hover:border-secondary',
          'bottom-[4.25rem] right-3 h-9 w-9 sm:bottom-[5.75rem] sm:right-6 sm:h-11 sm:w-11',
          'transition-transform hover:scale-105 active:scale-95',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
        )}
      >
        <QrCode size={18} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Scan asset QR code" size="sm">
        <p className="text-body-sm text-ink-faint mb-3">
          Point your camera at the QR code on the asset to raise a complaint for it directly.
        </p>
        <div id={READER_ID} />
      </Modal>
    </>
  )
}
