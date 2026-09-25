/**
 * Inactivity-based session timeout.
 *
 * Independent of auth.js's token lifecycle: the backend/refresh-token flow
 * in lib/api.js remains the source of truth for whether a session is valid
 * at all. This module only tracks how long the *person* has been idle and
 * calls the supplied `onExpire` once that idle time crosses the threshold —
 * `onExpire` is responsible for actually clearing the session (see App.jsx,
 * which wires it to `useAuth().logout()` + a redirect to /login).
 *
 * A background token refresh, a WebSocket heartbeat, notification polling,
 * or the tab simply being open are deliberately NOT activity: only the DOM
 * events below (plus SPA route changes, recorded by App.jsx) reset the
 * timer.
 */
import { create } from 'zustand'

export const SESSION_INACTIVITY_TIMEOUT = 10 * 60 * 1000
export const SESSION_WARNING_TIME = 60 * 1000

// How often the wall clock is re-checked. Deliberately NOT the only thing
// standing between "inactive" and "expired": see the visibilitychange/focus
// listeners below, which re-check immediately rather than waiting for the
// next tick after the tab was hidden, throttled, or the laptop slept.
const CHECK_INTERVAL_MS = 3000

// Activity events fire far more often than the timer needs (mousemove can
// fire hundreds of times a second); this drops everything but the first one
// in each window before it ever reaches React/zustand state.
const ACTIVITY_THROTTLE_MS = 1000

// How often one tab tells the others "someone is still here". Small enough
// that a second tab's timer never drifts meaningfully behind, large enough
// that normal mouse movement doesn't flood BroadcastChannel.
const BROADCAST_THROTTLE_MS = 2000

const CHANNEL_NAME = 'cn.session'

const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'pointerdown',
]

export const useSessionTimeoutStore = create((set) => ({
  warningOpen: false,
  secondsLeft: Math.ceil(SESSION_WARNING_TIME / 1000),
  _set: (warningOpen, secondsLeft) => set((s) => ({
    warningOpen,
    secondsLeft: secondsLeft ?? s.secondsLeft,
  })),
}))

/**
 * Close the warning popup directly, independent of the monitor's own
 * activity/expiry logic — used when the user takes an action (Log Out)
 * that ends the session outright, so the popup doesn't keep floating over
 * whatever page comes next while it waits on an indirect chain (auth state
 * clearing -> an effect noticing -> that effect's cleanup -> only then
 * closing it) that has no guaranteed timing relative to the navigation
 * that follows it.
 */
export function dismissWarning() {
  useSessionTimeoutStore.getState()._set(false)
}

function openChannel() {
  try {
    return 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null
  } catch {
    // Safari private browsing and some older WebViews throw rather than
    // simply lacking the constructor. Multi-tab sync degrades gracefully —
    // each tab still enforces its own timeout independently.
    return null
  }
}

// Set while a monitor is running, so the standalone recordActivity() export
// below (used by the "Stay Logged In" button and route-change tracking in
// App.jsx) can reach it without every caller needing a reference to the
// specific monitor instance.
let active = null

/**
 * Start the inactivity monitor for this tab. Call once per authenticated
 * session (see App.jsx: keyed on the user going from null -> present).
 * Returns a stop() function — call it on logout or when the owning
 * component unmounts. Safe to start again afterwards for a new session.
 */
export function startSessionTimeoutMonitor(onExpire) {
  let lastActivity = Date.now()
  let lastBroadcast = 0
  let stopped = false

  const channel = openChannel()

  const applyActivity = (ts, { broadcast = true } = {}) => {
    if (ts <= lastActivity) return
    lastActivity = ts

    if (useSessionTimeoutStore.getState().warningOpen) {
      useSessionTimeoutStore.getState()._set(false)
    }

    if (broadcast && channel && ts - lastBroadcast > BROADCAST_THROTTLE_MS) {
      lastBroadcast = ts
      try {
        channel.postMessage({ type: 'activity', ts })
      } catch {
        /* channel closed mid-flight; the next tick still self-corrects */
      }
    }
  }

  const onActivityEvent = () => {
    // While the warning is up, the only interactive surface on screen is
    // the modal itself (a full-screen backdrop blocks everything else),
    // and its two buttons already call recordActivity()/dismissWarning()
    // directly. If a passive event here (mousemove fires well before the
    // click that follows it, as the cursor crosses the modal on its way
    // to a button) closes the modal first, the modal unmounts mid-gesture
    // and the click that was headed for "Log Out" lands on nothing —
    // so leave this generic listener out of it entirely until the modal
    // is dismissed through one of its own explicit actions.
    if (useSessionTimeoutStore.getState().warningOpen) return

    const now = Date.now()
    if (now - lastActivity < ACTIVITY_THROTTLE_MS) return
    applyActivity(now)
  }

  ACTIVITY_EVENTS.forEach((evt) =>
    window.addEventListener(evt, onActivityEvent, { passive: true }))

  if (channel) {
    channel.onmessage = (e) => {
      if (stopped) return
      const data = e.data || {}
      if (data.type === 'activity' && typeof data.ts === 'number') {
        applyActivity(data.ts, { broadcast: false })
      } else if (data.type === 'logout') {
        // Another tab already ran the full logout/redirect flow (either its
        // own timeout, or a manual sign-out) — mirror it here without
        // re-broadcasting, so the two tabs don't ping-pong the message.
        onExpire?.({ silent: true })
      }
    }
  }

  const tick = () => {
    if (stopped) return

    const remaining = SESSION_INACTIVITY_TIMEOUT - (Date.now() - lastActivity)

    if (remaining <= 0) {
      useSessionTimeoutStore.getState()._set(false)
      onExpire?.({ silent: false })
      return
    }

    if (remaining <= SESSION_WARNING_TIME) {
      useSessionTimeoutStore.getState()._set(true, Math.max(1, Math.ceil(remaining / 1000)))
    } else if (useSessionTimeoutStore.getState().warningOpen) {
      useSessionTimeoutStore.getState()._set(false)
    }
  }

  const intervalId = setInterval(tick, CHECK_INTERVAL_MS)

  // A laptop that sleeps for 20 minutes doesn't fire 400 timer ticks it
  // missed — it fires none, then resumes. Re-checking wall-clock time the
  // moment the tab becomes visible/focused again (rather than waiting up to
  // CHECK_INTERVAL_MS for the next scheduled tick) is what makes that case
  // expire immediately instead of only "eventually, next time the interval
  // happens to fire".
  const onWake = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)

  active = { applyActivity }

  return function stop() {
    stopped = true
    clearInterval(intervalId)
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivityEvent))
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener('focus', onWake)

    if (channel) {
      channel.onmessage = null
      channel.close()
    }

    if (active?.applyActivity === applyActivity) active = null

    useSessionTimeoutStore.getState()._set(false)
  }
}

/**
 * Record real user activity from outside the automatic DOM listeners —
 * currently: SPA route changes (App.jsx) and the "Stay Logged In" button
 * (SessionTimeoutModal.jsx). No-ops if no monitor is currently running
 * (logged out, or not yet initialised), so callers never need to guard.
 */
export function recordActivity() {
  active?.applyActivity(Date.now())
}

/**
 * Tell any other open CampusNetra tabs that this tab just ended the
 * session (timeout or manual sign-out), so they transition to the login
 * state too instead of continuing to show authenticated UI.
 */
export function broadcastSessionEnded() {
  const channel = openChannel()
  if (!channel) return
  try {
    channel.postMessage({ type: 'logout' })
  } finally {
    channel.close()
  }
}
