import { useEffect, useState } from 'react'

import { useTheme } from '@/lib/theme'

/** Reads a palette token off the document and returns it as `rgb(r g b)`. */
function token(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim()
  return raw ? `rgb(${raw})` : fallback
}

/**
 * Chart colours for Recharts, which takes plain colour strings and cannot read
 * a Tailwind class. Recomputed whenever the theme changes, so grid lines and
 * axis labels move with the rest of the page instead of staying light-mode.
 */
export function useChartTheme() {
  const resolved = useTheme((s) => s.resolved)
  const [palette, setPalette] = useState(() => read())

  useEffect(() => {
    // The theme attribute lands before this effect runs, but the transition
    // class is still settling; a frame's delay reads the final values.
    const id = requestAnimationFrame(() => setPalette(read()))
    return () => cancelAnimationFrame(id)
  }, [resolved])

  return palette
}

function read() {
  return {
    grid: token('border-subtle', '#e2e8f0'),
    axis: token('ink-faint', '#64748b'),
    ink: token('ink', '#0b1c30'),
    surface: token('surface', '#ffffff'),
    surfaceSunken: token('surface-sunken', '#f1f5f9'),
    border: token('border', '#cbd5e1'),
    // Two-series comparisons: the muted "before" and the emphatic "after".
    seriesMuted: token('border-strong', '#cbd5e1'),
    seriesStrong: token('secondary', '#1e1b4b'),
    // Categorical scale for pies and stacked bars.
    categories: [
      token('secondary', '#3b82f6'),
      token('twin-inspection', '#8b5cf6'),
      token('twin-healthy', '#10b981'),
      token('twin-warning', '#f59e0b'),
      token('twin-fault', '#ef4444'),
      token('ink-faint', '#64748b'),
      token('primary-400', '#818cf8'),
      token('twin-maintenance', '#0ea5e9'),
    ],
    /** Recharts tooltips are inline-styled, so they need the values too. */
    tooltip: {
      contentStyle: {
        background: token('surface', '#fff'),
        border: `1px solid ${token('border-subtle', '#e2e8f0')}`,
        borderRadius: 8,
        fontSize: 13,
        color: token('ink', '#0b1c30'),
        boxShadow: 'var(--shadow-popover)',
      },
      labelStyle: { color: token('ink', '#0b1c30'), fontWeight: 600 },
      itemStyle: { color: token('ink-muted', '#47464f') },
      cursor: { fill: token('surface-sunken', '#f1f5f9') },
    },
  }
}
