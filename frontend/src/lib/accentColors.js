// Tailwind's compiler scans source files for literal class-name strings —
// it cannot see a class assembled at runtime like `bg-${color}-500/15`,
// because that exact string never appears anywhere in the source. The
// interpolated version silently renders as nothing (no background, no
// border, no text color), which is why cards using this pattern show up
// as flat, colorless boxes regardless of what `color` actually is.
//
// Fix: every class this file's components need, for every color they
// use, is written here as a complete literal string. Look it up by name
// at runtime; never interpolate a class name again.
export const ACCENT = {
  secondary: {
    bg10: 'bg-secondary-500/10', bg15: 'bg-secondary-500/15', bg20: 'bg-secondary-500/20',
    bg500: 'bg-secondary-500', border500: 'border-secondary-500',
    border30: 'border-secondary-400/30', text400: 'text-secondary-400', glow: 'glow-secondary',
    from400: 'from-secondary-400', via400: 'via-secondary-400', to500: 'to-secondary-500',
  },
  primary: {
    bg10: 'bg-primary-500/10', bg15: 'bg-primary-500/15', bg20: 'bg-primary-500/20',
    bg500: 'bg-primary-500', border500: 'border-primary-500',
    border30: 'border-primary-400/30', text400: 'text-primary-400', glow: 'glow-primary',
    from400: 'from-primary-400', via400: 'via-primary-400', to500: 'to-primary-500',
  },
  cyan: {
    bg10: 'bg-cyan-500/10', bg15: 'bg-cyan-500/15', bg20: 'bg-cyan-500/20',
    bg500: 'bg-cyan-500', border500: 'border-cyan-500',
    border30: 'border-cyan-400/30', text400: 'text-cyan-400', glow: 'glow-cyan',
    from400: 'from-cyan-400', via400: 'via-cyan-400', to500: 'to-cyan-500',
  },
  emerald: {
    bg10: 'bg-emerald-500/10', bg15: 'bg-emerald-500/15', bg20: 'bg-emerald-500/20',
    bg500: 'bg-emerald-500', border500: 'border-emerald-500',
    border30: 'border-emerald-400/30', text400: 'text-emerald-400', glow: 'glow-emerald',
    from400: 'from-emerald-400', via400: 'via-emerald-400', to500: 'to-emerald-500',
  },
  amber: {
    bg10: 'bg-amber-500/10', bg15: 'bg-amber-500/15', bg20: 'bg-amber-500/20',
    bg500: 'bg-amber-500', border500: 'border-amber-500',
    border30: 'border-amber-400/30', text400: 'text-amber-400', glow: 'glow-amber',
    from400: 'from-amber-400', via400: 'via-amber-400', to500: 'to-amber-500',
  },
  // Semantic tokens don't have numbered 400/500 steps (theme.css defines
  // them as single flat colors, not a ramp) -- map onto their bg/border/
  // text/DEFAULT variants instead, and fall back to secondary's glow
  // since there's no glow-success/glow-warning/glow-info defined.
  success: {
    bg10: 'bg-success-bg', bg15: 'bg-success-bg', bg20: 'bg-success-bg',
    bg500: 'bg-success', border500: 'border-success',
    border30: 'border-success-border', text400: 'text-success-text', glow: 'glow-emerald',
    from400: 'from-success', via400: 'via-success', to500: 'to-success',
  },
  warning: {
    bg10: 'bg-warning-bg', bg15: 'bg-warning-bg', bg20: 'bg-warning-bg',
    bg500: 'bg-warning', border500: 'border-warning',
    border30: 'border-warning-border', text400: 'text-warning-text', glow: 'glow-amber',
    from400: 'from-warning', via400: 'via-warning', to500: 'to-warning',
  },
  danger: {
    bg10: 'bg-danger-bg', bg15: 'bg-danger-bg', bg20: 'bg-danger-bg',
    bg500: 'bg-danger', border500: 'border-danger',
    border30: 'border-danger-border', text400: 'text-danger-text', glow: 'glow-amber',
    from400: 'from-danger', via400: 'via-danger', to500: 'to-danger',
  },
  info: {
    bg10: 'bg-info-bg', bg15: 'bg-info-bg', bg20: 'bg-info-bg',
    bg500: 'bg-info', border500: 'border-info',
    border30: 'border-info-border', text400: 'text-info-text', glow: 'glow-primary',
    from400: 'from-info', via400: 'via-info', to500: 'to-info',
  },
}

// Safe accessor -- falls back to `secondary` for any color name that
// shows up in data but isn't in the map above, rather than throwing or
// silently rendering nothing.
export function accent(colorName) {
  return ACCENT[colorName] || ACCENT.secondary
}
