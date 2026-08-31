import { create } from 'zustand'

/**
 * Per-user color theme management (session-only).
 * Colors are NOT persisted across sessions — resets to default indigo on each visit.
 * Users must go to Settings and re-select their preferred color each time.
 */

const DEFAULT_COLOR = '#1e1b4b'

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

export const useColorTheme = create((set) => ({
  colorTheme: DEFAULT_COLOR,

  setColorTheme(hexColor) {
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return

    applyColorTheme(hexColor)
    set({ colorTheme: hexColor })
  },

  resetColorTheme() {
    applyColorTheme(DEFAULT_COLOR)
    set({ colorTheme: DEFAULT_COLOR })
  },
}))

/**
 * Initialize color theme on application mount.
 * Called once during app initialization — always starts with default.
 */
export function initColorTheme() {
  const { colorTheme } = useColorTheme.getState()
  applyColorTheme(colorTheme)
}