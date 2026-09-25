import { readAuth } from './api'

/**
 * Global access to the signed-in user's `preferences.display` block
 * (time_format, week_start — set in Settings.jsx), without threading it
 * through every component that formats a date.
 *
 * Same pattern as lib/colorTheme.js for appearance: lib/auth.js calls
 * setDisplayPrefs() at every point it establishes/refreshes the user object
 * (init, login, verifyEmail, setUser), so lib/format.js and
 * components/DateTimePicker.jsx can read the current values synchronously.
 *
 * Before this file existed, Settings.jsx's "Time format" and "Week starts
 * on" controls saved a real value to the backend but nothing in the app
 * ever read it back — changing them had zero visible effect anywhere.
 */

const DEFAULTS = { time_format: '24h', week_start: 'monday' }

// Seed synchronously from whatever was already persisted locally, so the
// very first render (before lib/auth.js's init() resolves) already matches
// the signed-in user's saved choice instead of flashing the default.
let current = { ...DEFAULTS, ...(readAuth()?.user?.preferences?.display || {}) }

export function setDisplayPrefs(preferences) {
  current = { ...DEFAULTS, ...(preferences?.display || {}) }
}

export function getDisplayPrefs() {
  return current
}
