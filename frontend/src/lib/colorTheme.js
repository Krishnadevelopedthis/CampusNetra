import { create } from 'zustand'

const STORAGE_KEY = 'cn-color-theme'

export const COLOR_THEMES = {
  indigo: {
    name: 'Indigo',
    description: 'Corporate & Modern',
    swatch: {
      light: '#1e1b4b',
      dark: '#818cf8',
    },
  },
  green: {
    name: 'Emerald',
    description: 'Natural & Fresh',
    swatch: {
      light: '#064e3b',
      dark: '#34d399',
    },
  },
  purple: {
    name: 'Purple',
    description: 'Creative & Vibrant',
    swatch: {
      light: '#3b0764',
      dark: '#c084fc',
    },
  },
  orange: {
    name: 'Amber',
    description: 'Warm & Dynamic',
    swatch: {
      light: '#451a03',
      dark: '#fb923c',
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
 * Apply the color theme by setting data-color-theme on document root.
 */
function applyColorTheme(themeId) {
  const root = document.documentElement
  root.dataset.colorTheme = themeId
}

export const useColorTheme = create((set) => ({
  colorTheme: storedColorTheme(),

  setColorTheme(themeId) {
    if (!COLOR_THEME_IDS.includes(themeId)) return
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // Ignore storage errors in private browsing
    }
    applyColorTheme(themeId)
    set({ colorTheme: themeId })
  },
}))

/**
 * Initialize color theme on application mount.
 */
export function initColorTheme() {
  const { colorTheme } = useColorTheme.getState()
  applyColorTheme(colorTheme)
}
