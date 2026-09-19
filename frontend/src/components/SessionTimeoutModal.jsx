import { Button, Modal } from '@/components/ui'
import { recordActivity, useSessionTimeoutStore } from '@/lib/sessionTimeout'

/**
 * Warning shown ~1 minute before an inactive session is signed out
 * automatically. Mounted once near the app root (App.jsx) and controlled
 * entirely by useSessionTimeoutStore, so it never renders more than one
 * instance regardless of route.
 */
export function SessionTimeoutModal({ onLogout }) {
  const warningOpen = useSessionTimeoutStore((s) => s.warningOpen)
  const secondsLeft = useSessionTimeoutStore((s) => s.secondsLeft)

  const stay = () => {
    // Same path a real click/keypress takes — also dismisses the modal via
    // the store update inside recordActivity()'s underlying applyActivity().
    recordActivity()
  }

  const mm = Math.floor(secondsLeft / 60)
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Modal
      open={warningOpen}
      // Dismissing via backdrop click or Escape reads as "still here", not
      // as a request to sign out — an accidental Escape shouldn't end the
      // session.
      onClose={stay}
      title="Session Expiring Soon"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onLogout}>Log Out</Button>
          <Button variant="primary" onClick={stay}>Stay Logged In</Button>
        </>
      }
    >
      <p className="text-body-md text-ink-muted">
        You have been inactive for a while. Your session will expire in{' '}
        <span className="font-medium text-ink tabular">{mm}:{ss}</span>{' '}
        due to inactivity.
      </p>
    </Modal>
  )
}
