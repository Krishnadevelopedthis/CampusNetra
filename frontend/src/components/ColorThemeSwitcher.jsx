import clsx from 'clsx'
import { Check } from 'lucide-react'

import { COLOR_THEMES, useColorTheme } from '@/lib/colorTheme'

/**
 * Color theme switcher component.
 * Displays curated palette options with dual light/dark preview swatches.
 */
export function ColorThemeSwitcher({ className }) {
  const colorTheme = useColorTheme((s) => s.colorTheme)
  const setColorTheme = useColorTheme((s) => s.setColorTheme)

  return (
    <div className={clsx('space-y-3', className)}>
      <div>
        <p className="text-body-lg font-medium text-ink">Palette</p>
        <p className="text-body-md text-ink-muted mt-0.5">
          Select an accent palette for navigation, active indicators, and highlights.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {Object.entries(COLOR_THEMES).map(([id, theme]) => {
          const isActive = colorTheme === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setColorTheme(id)}
              className={clsx(
                'relative flex flex-col items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150',
                isActive
                  ? 'border-secondary bg-surface shadow-level2 ring-2 ring-secondary/20'
                  : 'border-border-subtle hover:border-border-strong bg-surface hover:bg-surface-sunken/40',
              )}
              aria-label={`Switch to ${theme.name} palette`}
              aria-pressed={isActive}
            >
              {/* Dual preview pill */}
              <div className="flex items-center gap-1.5 w-full">
                <div
                  className="h-6 flex-1 rounded-md shadow-sm border border-black/10"
                  style={{ backgroundColor: theme.swatch.light }}
                  title={`${theme.name} light mode`}
                />
                <div
                  className="h-6 flex-1 rounded-md shadow-sm border border-white/10"
                  style={{ backgroundColor: theme.swatch.dark }}
                  title={`${theme.name} dark mode`}
                />
              </div>

              {/* Theme info */}
              <div className="min-w-0 w-full">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-body-md font-semibold text-ink truncate">
                    {theme.name}
                  </span>
                  {isActive && (
                    <span className="w-4 h-4 rounded-full bg-secondary text-white grid place-items-center shrink-0">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className="text-body-sm text-ink-faint block truncate">
                  {theme.description}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
