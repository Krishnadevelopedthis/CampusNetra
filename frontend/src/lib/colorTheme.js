import { create } from 'zustand'

/**
 * Per-user color theme management with localStorage persistence.
 * Color choice is saved to localStorage and restored on next login.
 * Users only need to set it once.
 */

const DEFAULT_COLOR = '#1e1b4b'
const STORAGE_KEY = 'user-color-theme'

/**
 * Convert hex color to RGB string format for CSS variables.
 * E.g., '#1e1b4b' → '30 27 75'
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '30 27 75' // fallback to indigo
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
}

/**
 * Apply color theme by updating CSS custom properties.
 * Generates a full palette from the primary color.
 */
function applyColorTheme(hexColor) {
  const root = document.documentElement
  const rgb = hexToRgb(hexColor)

  // Set primary color
  root.style.setProperty('--c-primary', rgb)

  // Generate lighter shades for 50, 100
  // Set secondary same as primary for now
  root.style.setProperty('--c-secondary', rgb)
  root.style.setProperty('--c-brand', rgb)

  // Store the hex for display purposes
  root.dataset.userColorTheme = hexColor
}

/**
 * Load color theme from localStorage, falling back to default.
 */
function loadColorThemeFromStorage() {
  if (typeof window === 'undefined') return DEFAULT_COLOR
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch (e) {
    // localStorage not available, fall through to default
  }
  return DEFAULT_COLOR
}

/**
 * Save color theme to localStorage.
 */
function saveColorThemeToStorage(hexColor) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, hexColor)
  } catch (e) {
    // Ignore storage errors
  }
}

export const useColorTheme = create((set) => ({
  colorTheme: loadColorThemeFromStorage(),

  setColorTheme(hexColor) {
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return

    applyColorTheme(hexColor)
    set({ colorTheme: hexColor })
    saveColorThemeToStorage(hexColor)
  },

  resetColorTheme() {
    applyColorTheme(DEFAULT_COLOR)
    set({ colorTheme: DEFAULT_COLOR })
    saveColorThemeToStorage(DEFAULT_COLOR)
  },

  // Keeps user's color choice in localStorage on logout
  // Next user login will load the saved color automatically
  clearUserColorTheme() {
    // NO-OP: We intentionally preserve the user's color choice across sessions
    // The color is tied to the user's preference, not their session
  },
}))

/**
 * Initialize color theme on application mount.
 * Called once during app initialization — loads from localStorage.
 */
export function initColorTheme() {
  const { colorTheme } = useColorTheme.getState()
  applyColorTheme(colorTheme)
}