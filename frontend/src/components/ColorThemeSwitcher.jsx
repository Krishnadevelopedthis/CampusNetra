import clsx from 'clsx'
import { Check } from 'lucide-react'

import { COLOR_THEMES, useColorTheme } from '@/lib/colorTheme'

/**
 * Color theme switcher component.
 * Displays color palette options as clickable swatches.
 * Works alongside the light/dark theme toggle.
 */
export function ColorThemeSwitcher({ className }) {
  const colorTheme = useColorTheme((s) => s.colorTheme)
  const setColorTheme = useColorTheme((s) => s.setColorTheme)

  return (
    <div className={clsx('space-y-3', className)}>
      <label className="block text-body-sm font-medium text-ink-muted">
        Color Theme
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(COLOR_THEMES).map(([id, theme]) => {
          const isActive = colorTheme === id
          return (
            <button
              key={id}
              onClick={() => setColorTheme(id)}
              className={clsx(
                'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-strong bg-surface',
              )}
              aria-label={`Switch to ${theme.name} theme`}
              aria-pressed={isActive}
            >
              {/* Color preview swatch */}
              <div className="flex gap-1.5">
                <div
                  className="w-7 h-7 rounded-md shadow-sm"
                  style={{ backgroundColor: `rgb(${theme.light.primary})` }}
                  title="Light mode preview"
                />
                <div
                  className="w-7 h-7 rounded-md shadow-sm"
                  style={{ backgroundColor: `rgb(${theme.dark.primary})` }}
                  title="Dark mode preview"
                />
              </div>

              {/* Theme name */}
              <span
                className={clsx(
                  'text-body-sm font-medium',
                  isActive ? 'text-primary' : 'text-ink',
                )}
              >
                {theme.name}
              </span>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-level2">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
