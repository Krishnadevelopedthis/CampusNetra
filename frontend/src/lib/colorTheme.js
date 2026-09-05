import { create } from 'zustand'

/**
 * Per-user appearance management with server-side persistence.
 *
 * Color theme and accent color are stored in the authenticated user's
 * preferences on the backend (user.preferences.appearance).
 *
 * Flow:
 * 1. User logs in → AuthResponse includes user.preferences.appearance
 * 2. ColorTheme store loads from authenticated user's preferences
 * 3. On color change → saves to backend via PATCH /auth/me
 * 4. On logout → state cleared (next user gets their own preferences)
 * 5. On page refresh → preferences reloaded from auth state
 */

// `null` means "no accent chosen" — the stylesheet's own palette governs, which
// is the only way light and dark can each keep their proper shade. A single hex
// default cannot do that: it would pin both themes to the same colour.
const NO_ACCENT = null

/**
 * Convert hex color to RGB string format for CSS variables.
 * E.g., '#1e1b4b' → '30 27 75'
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '6 95 70' // fallback to emerald
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
}

const ACCENT_VARS = ['--c-primary', '--c-secondary', '--c-brand']

/**
 * Apply an accent by overriding the palette tokens, or clear the override.
 *
 * Passing null removes the inline properties rather than writing a default
 * colour over them, handing control back to theme.css — otherwise "no accent
 * chosen" would look identical to "accent set to whatever we picked as the
 * default", and light mode would inherit dark mode's shade.
 */
function applyColorTheme(hexColor) {
  const root = document.documentElement

  if (!hexColor) {
    ACCENT_VARS.forEach((v) => root.style.removeProperty(v))
    delete root.dataset.userColorTheme
    return
  }

  const rgb = hexToRgb(hexColor)
  ACCENT_VARS.forEach((v) => root.style.setProperty(v, rgb))
  root.dataset.userColorTheme = hexColor
}

export const useColorTheme = create((set) => ({
  // null until a signed-in user turns out to have chosen one.
  colorTheme: NO_ACCENT,
  isInitialized: false,

  /**
   * Load color from authenticated user's preferences.
   * Called after successful login to restore user's saved appearance.
   */
  loadFromUserPreferences(userPreferences) {
    const accentColor = userPreferences?.appearance?.accent_color
    const valid = typeof accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(accentColor)
    const next = valid ? accentColor : NO_ACCENT

    // Always applied, including the null case: signing in as someone with no
    // accent has to clear the previous account's override, and a fresh session
    // has to end up somewhere definite rather than leaving the store claiming a
    // colour the page never took.
    applyColorTheme(next)
    set({ colorTheme: next, isInitialized: true })
  },

  /**
   * Set accent color locally and signal that it needs to be saved.
   * The actual save happens in Settings via PATCH /auth/me.
   */
  setColorTheme(hexColor) {
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return

    applyColorTheme(hexColor)
    set({ colorTheme: hexColor })

    // NOTE: Actual persistence happens via Settings page
    // when user clicks "Save preferences" button
  },

  /**
   * Reset to default color (local only).
   * Actual persistence via Settings page.
   */
  resetColorTheme() {
    applyColorTheme(NO_ACCENT)
    set({ colorTheme: NO_ACCENT })
  },

  /**
   * Called on logout to clear private user theme state.
   * NOTE: This should NOT delete saved preferences - only clears in-memory state
   * if needed for security between user sessions.
   * The actual saved preference remains in the database and will be restored
   * when the user (or next user) logs in.
   */
  clearUserColorTheme() {
    // NO-OP: Do not reset to default or clear anything
    // Preferences are stored in user account on backend, not in-memory
    // Next login will fetch preferences via GET /auth/me
    // If this method is called, it's only to clear local state, not persistent data
  },
}))

/**
 * Initialize color theme on application mount.
 * Called during app initialization (index.html / main.jsx).
 * Applies default theme until authenticated user's preferences are loaded.
 */
export function initColorTheme() {
  applyColorTheme(NO_ACCENT)
}