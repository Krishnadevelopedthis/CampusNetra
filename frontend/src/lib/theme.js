import { create } from 'zustand'
import { refreshColorTheme, initColorTheme } from './colorTheme'

const STORAGE_KEY = 'cn-theme'

export const THEME_MODES = ['light', 'dark', 'system']

/** What the OS is currently asking for. */
function deviceTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEME_MODES.includes(saved) ? saved : 'system'
  } catch {
    // Private windows and blocked site data both throw here. Following the
    // device is a perfectly good answer when we cannot remember a choice.
    return 'system'
  }
}

/**
 * Paint the resolved theme. The `system` mode is resolved to a concrete value
 * here rather than in a media query, so one attribute always describes what is
 * on screen — which is also what lets an explicit choice override the device.
 */
function apply(mode, { animate = true } = {}) {
  const resolved = mode === 'system' ? deviceTheme() : mode
  const root = document.documentElement

  if (animate && root.dataset.theme !== resolved) {
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 220)
  }
  root.dataset.theme = resolved

  // Re-apply color theme with the new light/dark mode
  refreshColorTheme(resolved === 'dark')

  return resolved
}

export const useTheme = create((set, get) => ({
  mode: storedMode(),
  resolved: document.documentElement.dataset.theme || 'light',

  setMode(mode) {
    if (!THEME_MODES.includes(mode)) return
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Not being able to remember the choice is not a reason to ignore it.
    }
    set({ mode, resolved: apply(mode) })
  },

  /** Cycles light -> dark -> system, which is the order the toggle displays. */
  cycle() {
    const next = { light: 'dark', dark: 'system', system: 'light' }[get().mode]
    get().setMode(next)
  },
}))

/**
 * Called once at startup. The inline script in index.html has already painted
 * the right theme; this keeps it correct if the device setting changes while
 * the tab is open, which only matters while the user is on `system`.
 */
export function initTheme() {
  const { mode } = useTheme.getState()
  const resolved = apply(mode, { animate: false })
  useTheme.setState({ resolved })

  // Initialize color theme system
  initColorTheme(resolved === 'dark')

  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener?.('change', () => {
    if (useTheme.getState().mode !== 'system') return
    useTheme.setState({ resolved: apply('system') })
  })
}
