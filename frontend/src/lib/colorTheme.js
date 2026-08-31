import { create } from 'zustand'

const STORAGE_KEY = 'cn-color-theme'

/**
 * Available color themes with their palette definitions.
 * Each theme defines primary/secondary colors for both light and dark modes.
 */
export const COLOR_THEMES = {
  indigo: {
    name: 'Indigo',
    light: {
      primary: '30 27 75',           // Deep indigo
      primary50: '238 242 255',
      primary100: '224 231 255',
      primary800: '55 48 163',
      primary900: '30 27 75',
      brand: '30 27 75',
      brandSoft: '238 242 255',
      secondary: '59 130 246',       // Blue
      aiBackground: '240 247 255',
      aiBorder: '219 234 254',
    },
    dark: {
      primary: '55 48 163',
      primary50: '30 27 75',
      primary100: '40 36 96',
      primary800: '129 140 248',
      primary900: '165 180 252',
      brand: '165 180 252',
      brandSoft: '38 36 82',
      secondary: '96 165 250',
      aiBackground: '19 31 51',
      aiBorder: '30 58 95',
    },
  },
  green: {
    name: 'Green',
    light: {
      primary: '20 83 45',           // Forest green
      primary50: '240 253 244',
      primary100: '220 252 231',
      primary800: '22 101 52',
      primary900: '20 83 45',
      brand: '20 83 45',
      brandSoft: '240 253 244',
      secondary: '16 185 129',       // Emerald
      aiBackground: '240 253 250',
      aiBorder: '204 251 241',
    },
    dark: {
      primary: '34 197 94',
      primary50: '20 83 45',
      primary100: '21 94 51',
      primary800: '134 239 172',
      primary900: '187 247 208',
      brand: '134 239 172',
      brandSoft: '22 56 35',
      secondary: '52 211 153',
      aiBackground: '6 31 25',
      aiBorder: '20 83 63',
    },
  },
  purple: {
    name: 'Purple',
    light: {
      primary: '88 28 135',          // Deep purple
      primary50: '250 245 255',
      primary100: '243 232 255',
      primary800: '107 33 168',
      primary900: '88 28 135',
      brand: '88 28 135',
      brandSoft: '250 245 255',
      secondary: '168 85 247',       // Purple
      aiBackground: '250 245 255',
      aiBorder: '233 213 255',
    },
    dark: {
      primary: '147 51 234',
      primary50: '88 28 135',
      primary100: '107 33 168',
      primary800: '196 181 253',
      primary900: '221 214 254',
      brand: '196 181 253',
      brandSoft: '59 31 84',
      secondary: '168 85 247',
      aiBackground: '24 12 38',
      aiBorder: '88 28 115',
    },
  },
  orange: {
    name: 'Orange',
    light: {
      primary: '154 52 18',          // Deep orange
      primary50: '255 247 237',
      primary100: '255 237 213',
      primary800: '194 65 12',
      primary900: '154 52 18',
      brand: '154 52 18',
      brandSoft: '255 247 237',
      secondary: '249 115 22',       // Orange
      aiBackground: '255 247 237',
      aiBorder: '254 215 170',
    },
    dark: {
      primary: '251 146 60',
      primary50: '124 45 18',
      primary100: '154 52 18',
      primary800: '253 186 116',
      primary900: '254 215 170',
      brand: '253 186 116',
      brandSoft: '67 31 21',
      secondary: '251 146 60',
      aiBackground: '28 16 8',
      aiBorder: '124 58 23',
    },
  },
}

export const COLOR_THEME_IDS = Object.keys(COLOR_THEMES)

function storedColorTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return COLOR_THEME_IDS.includes(saved) ? saved : 'indigo'
  } catch {
    return 'indigo'
  }
}

/**
 * Apply the color theme by updating CSS variables.
 * Works alongside the light/dark theme system.
 */
function applyColorTheme(themeId, isDark) {
  const theme = COLOR_THEMES[themeId]
  if (!theme) return

  const palette = isDark ? theme.dark : theme.light
  const root = document.documentElement

  // Update CSS variables
  root.style.setProperty('--c-primary', palette.primary)
  root.style.setProperty('--c-primary-50', palette.primary50)
  root.style.setProperty('--c-primary-100', palette.primary100)
  root.style.setProperty('--c-primary-800', palette.primary800)
  root.style.setProperty('--c-primary-900', palette.primary900)
  root.style.setProperty('--c-brand', palette.brand)
  root.style.setProperty('--c-brand-soft', palette.brandSoft)
  root.style.setProperty('--c-secondary', palette.secondary)
  root.style.setProperty('--c-ai-bg', palette.aiBackground)
  root.style.setProperty('--c-ai-border', palette.aiBorder)

  // Store the theme color for mobile browser chrome
  const metaColor = isDark
    ? `rgb(${palette.primary})`
    : `rgb(${palette.primary})`
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', metaColor)
}

export const useColorTheme = create((set, get) => ({
  colorTheme: storedColorTheme(),

  setColorTheme(themeId) {
    if (!COLOR_THEME_IDS.includes(themeId)) return
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // Proceed even if we can't persist the choice
    }
    set({ colorTheme: themeId })

    // Apply immediately with current light/dark mode
    const isDark = document.documentElement.dataset.theme === 'dark'
    applyColorTheme(themeId, isDark)
  },
}))

/**
 * Initialize color theme system.
 * Should be called after the light/dark theme is initialized.
 */
export function initColorTheme(isDark) {
  const { colorTheme } = useColorTheme.getState()
  applyColorTheme(colorTheme, isDark)
}

/**
 * Re-apply color theme when light/dark mode changes.
 * Call this from the theme system when it switches.
 */
export function refreshColorTheme(isDark) {
  const { colorTheme } = useColorTheme.getState()
  applyColorTheme(colorTheme, isDark)
}
