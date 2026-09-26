import clsx from 'clsx'
import { Children, cloneElement } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer } from 'recharts'

// Split out of components/ui/index.jsx: this is the only thing in that
// whole shared UI kit that needs recharts, and index.jsx is imported
// eagerly by App.jsx (for RingLoader/Toaster) -- with Metric/Sparkline
// defined in that same file, Rollup had no module boundary to tree-shake
// recharts out of, so every visitor (including an anonymous landing-page
// one who never sees a Metric tile) downloaded it anyway. A live
// Lighthouse run against production confirmed the real cost: a 1.1MB main
// bundle and 4.76s of main-thread blocking time on the landing page.

// The backend sends a fixed hex per metric (warning/success/info intent),
// the same value regardless of theme. Recognize the known ones and route
// them through the theme-aware token instead of using the literal hex --
// this is the only way these colors can actually shift with light/dark,
// since the raw string from the API never will.
const KNOWN_ACCENT_HEX = {
  '#f59e0b': 'rgb(var(--c-warning))',
  '#10b981': 'rgb(var(--c-success))',
  '#3b82f6': 'rgb(var(--c-info))',
  '#ef4444': 'rgb(var(--c-danger))',
}
function resolveAccent(hex) {
  if (!hex) return undefined
  return KNOWN_ACCENT_HEX[hex.toLowerCase()] || hex
}

// A KPI card with a bare number reads as a snapshot; the same card with a
// trend beside it reads as something moving. `sparkline` is optional and
// only ever real data already fetched for this dashboard (each day's own
// count) -- never fabricated points, since a graph that doesn't correspond
// to anything real is worse than no graph.
// Bars, not a smoothed line: each point is one day's real count, and a
// `type="monotone"` curve interpolates *between* those days, which can bow
// a line up above zero (or below its neighbours) even when every real
// value it passes through is flat at 0 -- a shape that doesn't correspond
// to anything that actually happened. A bar per day has no such overshoot:
// zero days sit flush on the baseline and only render taller as the count
// climbs, so the shape tracks the numbers directly.
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null
  const allZero = data.every((v) => !v)
  return (
    <div className="h-9 -mx-1 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((v) => ({ v }))} margin={{ top: 2, right: 1, bottom: 0, left: 1 }} barCategoryGap="20%">
          <Bar dataKey="v" radius={[1.5, 1.5, 0, 0]} isAnimationActive={false}>
            {data.map((v, i) => (
              <Cell key={i} fill={color} fillOpacity={allZero ? 0.25 : 0.35 + 0.65 * (i / (data.length - 1))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Metric({
  label, value, delta, deltaTone = 'neutral', accent, icon: Icon, size = 'default', className,
  sparkline,
}) {
  const tones = {
    up: 'bg-success-bg text-success-text',
    down: 'bg-danger-bg text-danger-text',
    neutral: 'bg-surface-sunken text-ink-muted',
  }
  const resolvedAccent = resolveAccent(accent)
  const isHero = size === 'hero'
  return (
    <div
      className={clsx(
        'widget flex flex-col gap-2 min-w-0',
        isHero ? 'p-6 sm:p-7' : 'p-widget',
        className,
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: resolvedAccent,
        // A hero tile earns a faint wash of its own accent so it visually
        // leads the row -- everything else stays on the plain surface,
        // matching "one accent stands out, the rest don't compete".
        background: isHero && resolvedAccent ? `linear-gradient(135deg, color-mix(in srgb, ${resolvedAccent} 10%, transparent), transparent 60%)` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-label-caps uppercase text-ink-muted">{label}</span>
        {Icon && <Icon size={isHero ? 20 : 16} className="text-ink-faint shrink-0" />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={clsx('tabular leading-none', isHero ? 'text-display-hero' : 'text-display-metrics')}
          style={resolvedAccent ? { color: resolvedAccent } : undefined}
        >
          {value}
        </span>
        {delta && <span className={clsx('pill text-body-sm', tones[deltaTone])}>{delta}</span>}
      </div>
      <Sparkline data={sparkline} color={resolvedAccent || 'rgb(var(--c-secondary))'} />
    </div>
  )
}

// Wraps a set of <Metric> elements so the first visually leads (bigger,
// tinted) and the rest sit smaller beside/below it -- the "one primary,
// several supporting" KPI hierarchy every page with a stat row should
// have, applied by wrapping the existing <Metric> children rather than
// restructuring each page's own metric list into a separate data shape.
export function MetricRow({ children, className }) {
  const items = Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  const [hero, ...rest] = items
  return (
    <div className={clsx('grid grid-cols-2 gap-3', className)}>
      {cloneElement(hero, {
        size: 'hero',
        className: clsx('col-span-2 sm:col-span-1', hero.props.className),
      })}
      {rest.length > 0 && (
        <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-3">
          {rest}
        </div>
      )}
    </div>
  )
}
