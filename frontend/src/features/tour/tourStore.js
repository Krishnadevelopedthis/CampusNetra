import { create } from 'zustand'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/**
 * Whether the first-run tour is showing, and whether this person has already
 * seen it. "Seen" is saved on the account (preferences.tour) so it holds on
 * every device, and on this device too, so it never reappears while the save
 * is in flight or if the network drops.
 */
const VERSION = 'v1'
const localKey = (userId) => `cn.tour.${VERSION}.${userId}`

export function hasSeenTour(user) {
  if (!user) return true
  if (user.preferences?.tour?.[VERSION]) return true
  try { return localStorage.getItem(localKey(user.id)) === 'done' } catch { return false }
}

async function markSeen() {
  const { user, setUser } = useAuth.getState()
  if (!user) return
  try { localStorage.setItem(localKey(user.id), 'done') } catch { /* storage blocked */ }
  if (user.preferences?.tour?.[VERSION]) return
  const preferences = { ...(user.preferences || {}), tour: { ...(user.preferences?.tour || {}), [VERSION]: true } }
  try {
    const updated = await api.patch('/auth/me', { preferences })
    setUser(updated)
  } catch { /* saved locally; the server copy is a convenience */ }
}

export const useTour = create((set) => ({
  open: false,
  start: () => set({ open: true }),
  // Finishing and skipping both count as seen.
  close: () => { set({ open: false }); markSeen() },
}))
