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

const DEFAULT_ACCENT_COLOR = '#065f46' // Emerald

/**
 * Convert hex color to RGB string format for CSS variables.
 * E.g., '#1e1b4b' → '30 27 75'
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '6 95 70' // fallback to emerald
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
}

/**
 * Apply accent color by updating CSS custom properties.
 */
function applyColorTheme(hexColor) {
  const root = document.documentElement
  const rgb = hexToRgb(hexColor)

  // Set primary color (used as accent throughout the app)
  root.style.setProperty('--c-primary', rgb)
  root.style.setProperty('--c-secondary', rgb)
  root.style.setProperty('--c-brand', rgb)

  // Store the hex for display purposes
  root.dataset.userColorTheme = hexColor
}

export const useColorTheme = create((set) => ({
  // Authenticated user's accent color (from server preferences)
  colorTheme: DEFAULT_ACCENT_COLOR,

  /**
   * Load color from authenticated user's preferences.
   * Called after successful login.
   */
  loadFromUserPreferences(userPreferences) {
    if (!userPreferences) return

    const appearance = userPreferences.appearance || {}
    const accentColor = appearance.accent_color || DEFAULT_ACCENT_COLOR

    // Validate hex format
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
      applyColorTheme(DEFAULT_ACCENT_COLOR)
      set({ colorTheme: DEFAULT_ACCENT_COLOR })
      return
    }

    applyColorTheme(accentColor)
    set({ colorTheme: accentColor })
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
    applyColorTheme(DEFAULT_ACCENT_COLOR)
    set({ colorTheme: DEFAULT_ACCENT_COLOR })
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
  applyColorTheme(DEFAULT_ACCENT_COLOR)
}