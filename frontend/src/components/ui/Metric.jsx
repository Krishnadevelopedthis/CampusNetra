import clsx from 'clsx'
import { Children, cloneElement } from 'react'

// Compact KPI visualizations stay SVG-based so they remain crisp, lightweight,
// and responsive inside a small card at every viewport width.
const KNOWN_ACCENT_HEX = {
  '#f59e0b': 'rgb(var(--c-warning))',
  '#10b981': 'rgb(var(--c-success))',
  '#3b82f6': 'rgb(var(--c-info))',
  '#ef4444': 'rgb(var(--c-danger))',
}

function resolveAccent(hex) {
  if (!hex) return 'rgb(var(--c-secondary))'
  return KNOWN_ACCENT_HEX[hex.toLowerCase()] || hex
}

function MiniTrend({ data, color, hero = false }) {
  if (!data || data.length < 2) return <span className="h-10 w-24 shrink-0" aria-hidden="true" />

  const values = data.map((value) => Number(value) || 0)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const width = 132
  const height = hero ? 52 : 44
  const pad = 5
  const step = (width - pad * 2) / Math.max(values.length - 1, 1)
  const points = values.map((value, index) => {
    const x = pad + index * step
    const y = height - pad - ((value - min) / range) * (height - pad * 2)
    return [x, y]
  })
  const line = points.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`
  const barWidth = Math.max(3, Math.min(8, step * 0.42))

  return (
    <span className="relative block h-11 w-[clamp(5.5rem,28vw,8.25rem)] shrink-0 sm:h-12" aria-label="Recent trend">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id={`metric-fill-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
        {points.map(([x], index) => {
          const barHeight = Math.max(3, ((values[index] - min) / range) * (height - pad * 2))
          return <rect key={index} x={x - barWidth / 2} y={height - pad - barHeight} width={barWidth} height={barHeight} rx="2" fill={color} opacity="0.14" />
        })}
        <polygon points={area} fill={`url(#metric-fill-${color.replace(/[^a-z0-9]/gi, '')})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={hero ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={hero ? 3 : 2.5} fill={color} stroke="rgb(var(--c-surface))" strokeWidth="2" />
      </svg>
    </span>
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
        'widget dashboard-kpi flex min-h-[96px] min-w-0 flex-col justify-between gap-2 overflow-hidden',
        isHero ? 'min-h-[112px] p-4 sm:p-5' : 'p-3.5 sm:p-4',
        className,
      )}
      style={{
        // A quiet top glow replaces the old heavy left rail while preserving
        // the metric's semantic accent.
        background: `linear-gradient(135deg, color-mix(in srgb, ${resolvedAccent} ${isHero ? 9 : 6}%, transparent), transparent 58%)`,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[clamp(0.6rem,0.72vw,0.7rem)] font-bold uppercase tracking-[0.13em] text-ink-muted">
          <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: resolvedAccent }} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {Icon && <span className="icon-tile h-7 w-7 shrink-0 rounded-lg" style={{ color: resolvedAccent }}><Icon size={isHero ? 16 : 14} /></span>}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <span
            className={clsx('tabular block leading-none tracking-[-0.06em]', isHero ? 'text-[clamp(1.9rem,4.5vw,2.8rem)]' : 'text-[clamp(1.55rem,3vw,2.15rem)]')}
            style={{ color: resolvedAccent }}
          >
            {value}
          </span>
          {delta && <span className={clsx('mt-1 inline-flex pill text-[10px]', tones[deltaTone])}>{delta}</span>}
        </div>
        <MiniTrend data={sparkline} color={resolvedAccent} hero={isHero} />
      </div>
    </div>
  )
}

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
        <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-1">
          {rest}
        </div>
      )}
    </div>
  )
}
