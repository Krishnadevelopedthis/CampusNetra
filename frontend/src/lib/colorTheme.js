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
 * Lightness targets for the generated shade ramp.
 *
 * 950 is deliberately absent. It is used as the scrim behind modals, drawers
 * and the camera viewport, where the job is to darken what is underneath — a
 * pale accent would turn every overlay into a white wash. It stays a fixed
 * dark regardless of the accent, because it is not really a brand colour.
 */
const RAMP = {
  50: 0.97, 100: 0.93, 200: 0.86, 300: 0.77, 400: 0.66,
  500: 0.58, 600: 0.50, 700: 0.42, 800: 0.34, 900: 0.27,
}

/** Hue and saturation of a hex colour, for regenerating its ramp. */
function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r
    ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: sat, l }
}

function hslToRgbString(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return t.map((v) => Math.round((v + m) * 255)).join(' ')
}

/**
 * Regenerate the numbered shades from the chosen accent.
 *
 * The picker set --c-primary, --c-secondary and --c-brand but left the numbered
 * shades at their built-in blue, so the main button — filled with
 * secondary-600, not secondary — never followed the accent at all.
 *
 * The chosen colour is placed at 600 unchanged, and the rest of the ramp is
 * offset from it, rather than every step being forced onto a fixed lightness.
 * Forcing it destroys the choice: a deep emerald at 50% lightness and full
 * saturation comes back as neon mint, and a deep maroon as bright red. Someone
 * picking "deep, authoritative red" should get it on the button they are
 * looking at, not a brighter relative of it.
 */
const ANCHOR = 600

function applyShadeRamp(root, hex, rgb) {
  const hsl = hexToHsl(hex)
  if (!hsl) return
  for (const [step, lightness] of Object.entries(RAMP)) {
    const shade = Number(step) === ANCHOR
      ? rgb
      : hslToRgbString(
        hsl.h,
        hsl.s,
        Math.min(0.97, Math.max(0.06, hsl.l + (lightness - RAMP[ANCHOR]))),
      )
    root.style.setProperty(`--c-secondary-${step}`, shade)
    root.style.setProperty(`--c-primary-${step}`, shade)
  }
}

const RAMP_VARS = Object.keys(RAMP).flatMap((step) => [
  `--c-secondary-${step}`, `--c-primary-${step}`,
])

/** Fill token → the token holding the text colour that rides on it. */
const FOREGROUND_PAIRS = [
  ['--c-primary', '--c-on-primary'],
  ['--c-secondary', '--c-on-secondary'],
  ['--c-secondary-600', '--c-on-secondary-600'],
  ['--c-brand', '--c-on-brand'],
]

/** WCAG relative luminance of an "r g b" triple. */
function luminance(rgb) {
  const [r, g, b] = rgb.split(' ').map(Number).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The label colour that stays legible on a given accent.
 *
 * The accent is chosen by the user at runtime, so no fixed pairing works:
 * white on a pale accent and near-black on a deep one are both unreadable, and
 * which one applies is not known until they pick. Whichever of the two has the
 * better contrast wins, so a button's own label can never become the thing that
 * fails the page.
 */
const INK_ON_LIGHT = '17 19 43'
const INK_ON_DARK = '255 255 255'

function foregroundFor(rgb) {
  return contrast(rgb, INK_ON_DARK) >= contrast(rgb, INK_ON_LIGHT)
    ? INK_ON_DARK
    : INK_ON_LIGHT
}

/**
 * Recompute every accent foreground from the fill actually in force.
 *
 * Read from the cascade rather than from a table, so this stays correct
 * whichever way the fill got its value — the light/dark stylesheet, or the
 * user's own accent. Called on both, since either can change the fill.
 */
export function syncAccentForegrounds() {
  const root = document.documentElement
  const computed = getComputedStyle(root)
  for (const [fill, foreground] of FOREGROUND_PAIRS) {
    const rgb = computed.getPropertyValue(fill).trim()
    if (/^\d+\s+\d+\s+\d+$/.test(rgb)) {
      root.style.setProperty(foreground, foregroundFor(rgb))
    }
  }
}

/**
 * Apply an accent by overriding the palette tokens, or clear the override.
 *
 * Passing null removes the inline properties rather than writing a default
 * colour over them, handing control back to theme.css — otherwise "no accent
 * chosen" would look identical to "accent set to whatever we picked as the
 * default", and light mode would inherit dark mode's shade.
 */
export function applyColorTheme(hexColor) {
  const root = document.documentElement

  if (!hexColor) {
    // Undo exactly what the branch below sets, nothing more or less: the
    // three fills it overrides, plus their paired foregrounds. This used to
    // only clear the foregrounds -- the actual accent colour (--c-primary/
    // -secondary/-brand) stayed inline-overridden, so "clear the accent"
    // visibly did nothing; the old colour just kept rendering.
    FOREGROUND_PAIRS.forEach(([fg]) => root.style.removeProperty(fg))
    root.style.removeProperty('--c-primary')
    root.style.removeProperty('--c-secondary')
    root.style.removeProperty('--c-brand')
    delete root.dataset.userColorTheme
    syncAccentForegrounds()
    return
  }

  const rgb = hexToRgb(hexColor)
  FOREGROUND_PAIRS.forEach(([fill, fg]) => root.style.setProperty(fg, foregroundFor(rgb)))
  root.style.setProperty('--c-primary', rgb)
  root.style.setProperty('--c-secondary', rgb)
  root.style.setProperty('--c-brand', rgb)
  root.dataset.userColorTheme = hexColor
  syncAccentForegrounds()
}

/**
 * Initialize color theme on application mount.
 * Called during app initialization (index.html / main.jsx).
 * Applies default theme until authenticated user's preferences are loaded.
 */
export function initColorTheme() {
  applyColorTheme(DEFAULT_ACCENT_COLOR)
}

export const useColorTheme = create((set, get) => ({
  // null until a signed-in user turns out to have chosen one.
  colorTheme: DEFAULT_ACCENT_COLOR,
  isInitialized: false,

  /**
   * Load color from authenticated user's preferences.
   * Called after successful login to restore user's saved appearance.
   */
  loadFromUserPreferences(userPreferences) {
    if (!userPreferences) {
      // No preferences - use default and mark initialized
      set({ colorTheme: DEFAULT_ACCENT_COLOR, isInitialized: true })
      applyColorTheme(DEFAULT_ACCENT_COLOR)
      return
    }

    const appearance = userPreferences.appearance || {}
    const accentColor = appearance.accent_color || DEFAULT_ACCENT_COLOR

    // Validate hex format
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
      applyColorTheme(DEFAULT_ACCENT_COLOR)
      set({ colorTheme: DEFAULT_ACCENT_COLOR, isInitialized: true })
      return
    }

    // Apply the user's saved color
    applyColorTheme(accentColor)
    set({ colorTheme: accentColor, isInitialized: true }) // Mark initialized
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
   * Called on logout to remove the signed-out user's accent override from
   * the page.
   *
   * Deliberately applyColorTheme(null), not resetColorTheme()'s
   * DEFAULT_ACCENT_COLOR -- those are different things. Passing the default
   * colour still paints an explicit accent (emerald) over the page, which
   * reads the same as "someone's colour choice is still showing" even
   * though it happens to be the stock one. null removes the inline
   * override entirely and hands control back to theme.css's own baseline,
   * the actual "nobody's signed in, nothing is customised" look.
   *
   * Does NOT touch the saved preference -- that stays on the account in
   * the database and comes back via loadFromUserPreferences() next login.
   */
  clearUserColorTheme() {
    applyColorTheme(null)
    set({ colorTheme: null })
  },
}))