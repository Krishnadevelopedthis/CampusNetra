import clsx from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'

import { useTheme } from '@/lib/theme'

const OPTIONS = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'Match device' },
]

/**
 * Three-state control: the "system" option is not a nicety, it is the only way
 * to say "keep following the device" once an explicit choice has been made.
 *
 * `variant="segmented"` shows all three at once for the settings page;
 * the default is a single cycling button, which is what fits in a header.
 */
export function ThemeToggle({ variant = 'button', className }) {
  const mode = useTheme((s) => s.mode)
  const resolved = useTheme((s) => s.resolved)
  const setMode = useTheme((s) => s.setMode)
  const cycle = useTheme((s) => s.cycle)

  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label="Theme"
        className={clsx('inline-grid grid-cols-3 gap-1 p-1 bg-surface-sunken rounded-lg', className)}
      >
        {OPTIONS.map(({ mode: m, icon: Icon, label }) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={clsx(
              'flex items-center justify-center gap-2 h-9 px-3 rounded-md text-body-sm font-medium transition-colors',
              mode === m
                ? 'bg-surface text-ink shadow-level2'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
    )
  }

  // The icon shows what you are looking at, not what you would get next —
  // a control that previews the next state reads as if it is already applied.
  const Icon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun
  const title =
    mode === 'system'
      ? `Theme: matching your device (${resolved})`
      : `Theme: ${mode}`

  return (
    <button
      onClick={cycle}
      title={`${title} — click to change`}
      aria-label={title}
      className={clsx('btn-ghost h-9 w-9 p-0 rounded-lg relative', className)}
    >
      <Icon size={18} />
      {mode === 'system' && (
        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-secondary" />
      )}
    </button>
  )
}
