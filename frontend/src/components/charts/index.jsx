/**
 * Chart kit in the shadcn/ui pattern (https://ui.shadcn.com/charts), built on
 * the Recharts already in the bundle -- shadcn's charts are Recharts plus a
 * thin layer of conventions, and this is that layer:
 *
 *  - ChartContainer   sizes the chart responsively and exposes each series'
 *                     colour as a CSS variable (--color-<key>), so every part
 *                     (bars, tooltip dots, legend) reads one source of truth
 *                     and follows light/dark mode.
 *  - ChartTooltip*    one tooltip look everywhere: label, a coloured
 *                     indicator per series, right-aligned tabular values.
 *  - ChartLegend*     a legend whose items toggle their series on click.
 *  - DonutChart       hover/tap grows a slice and puts its value in the
 *                     centre; the side list highlights in step.
 *  - RadialScore      a 0..100 gauge.
 *
 * Grid, axis and cursor colours come from the stylesheet (.chart in
 * index.css) rather than inline props, so a theme switch needs no re-render.
 */
import { createContext, useContext, useId, useMemo, useState } from 'react'
import {
  Cell,
  Label,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from 'recharts'

const ChartContext = createContext({ config: {} })
export const useChart = () => useContext(ChartContext)

/** Brand-tuned palette for categorical data (a slice / bar per category). */
export const CHART_COLORS = [
  'rgb(var(--c-secondary))',
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#0ea5e9',
  '#8b5cf6',
  '#ef4444',
  '#64748b',
]

/**
 * config: { [dataKey]: { label, color } }. The colour is published as
 * --color-<dataKey>, so a series is drawn with fill="var(--color-created)".
 */
export function ChartContainer({ config = {}, className = '', children, ...rest }) {
  const id = useId().replace(/:/g, '')
  const style = useMemo(() => {
    const vars = {}
    for (const [key, item] of Object.entries(config)) {
      if (item?.color) vars[`--color-${key}`] = item.color
    }
    return vars
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-chart={id} className={`chart w-full min-w-0 ${className}`} style={style} {...rest}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

export { Tooltip as ChartTooltip }

/**
 * The tooltip body. Pass as <ChartTooltip content={<ChartTooltipContent />} />.
 *  indicator   'dot' | 'line' | 'dashed'
 *  hideLabel   omit the heading (single-series charts)
 *  valueFormatter(value, name, item) -> node
 *  labelFormatter(label, payload) -> node
 *  footer(payload) -> node, e.g. a total row
 */
export function ChartTooltipContent({
  active, payload, label, indicator = 'dot', hideLabel = false,
  valueFormatter, labelFormatter, footer, nameKey,
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  const heading = hideLabel ? null : labelFormatter ? labelFormatter(label, payload) : label

  return (
    <div className="chart-tooltip min-w-[9rem] max-w-[18rem] rounded-lg border border-border-subtle bg-surface/95 px-3 py-2 text-body-sm shadow-level3 backdrop-blur-sm">
      {heading != null && heading !== '' && <p className="mb-1.5 font-medium text-ink">{heading}</p>}
      <div className="space-y-1">
        {payload.map((item, i) => {
          const key = (nameKey && item.payload?.[nameKey]) || item.dataKey || item.name
          const cfg = config[key] || {}
          const colour = item.payload?.fill || item.color || cfg.color || `var(--color-${key})`
          return (
            <div key={`${key}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  indicator === 'line' ? 'h-3 w-1 shrink-0 rounded-full'
                    : indicator === 'dashed' ? 'h-0 w-3 shrink-0 border-t-2 border-dashed'
                      : 'h-2.5 w-2.5 shrink-0 rounded-[3px]'
                }
                style={indicator === 'dashed' ? { borderColor: colour } : { background: colour }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {cfg.label || item.payload?.label || item.name}
              </span>
              <span className="tabular font-mono font-medium text-ink">
                {valueFormatter ? valueFormatter(item.value, key, item) : item.value?.toLocaleString?.() ?? item.value}
              </span>
            </div>
          )
        })}
      </div>
      {footer && <div className="mt-1.5 border-t border-border-subtle pt-1.5">{footer(payload)}</div>}
    </div>
  )
}

/**
 * Legend chips that toggle a series. Use with useSeriesToggle():
 *   const series = useSeriesToggle(['created', 'resolved'])
 *   <ChartLegendContent keys={series.keys} hidden={series.hidden} onToggle={series.toggle} />
 *   <Bar hide={series.hidden.has('created')} ... />
 */
export function ChartLegendContent({ keys, hidden = new Set(), onToggle, totals, config: own, className = '' }) {
  const fromContext = useChart().config
  const config = own || fromContext
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3 ${className}`}>
      {keys.map((key) => {
        const off = hidden.has(key)
        return (
          <button
            key={key} type="button" onClick={() => onToggle?.(key)} aria-pressed={!off}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-body-sm transition-opacity hover:bg-surface-sunken ${off ? 'opacity-40' : ''}`}
            title={off ? 'Show' : 'Hide'}
          >
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: config[key]?.color }} />
            <span className="text-ink-muted">{config[key]?.label || key}</span>
            {totals?.[key] != null && <span className="tabular font-medium text-ink">{totals[key]}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function useSeriesToggle(keys) {
  const [hidden, setHidden] = useState(() => new Set())
  const toggle = (key) => setHidden((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    // Never hide the last visible series -- an empty plot reads as "no data".
    else if (keys.length - next.size > 1) next.add(key)
    return next
  })
  return { keys, hidden, toggle }
}

/** Axis tick that truncates long category names; the tooltip carries the full one. */
export function TruncatedTick({ x, y, payload, max = 14, anchor = 'end' }) {
  const text = String(payload?.value ?? '')
  const short = text.length > max ? `${text.slice(0, max - 1)}…` : text
  return (
    <text x={x} y={y} dy={4} textAnchor={anchor} className="chart-tick">
      <title>{text}</title>
      {short}
    </text>
  )
}

/** The hovered slice: pushed out a little, with a soft outer ring. */
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
              startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={4} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 12}
              startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.35} cornerRadius={2} />
    </g>
  )
}

/**
 * Donut with a centre readout and a synced legend list.
 *  data          [{ key, label, value, color, ...anything for the tooltip }]
 *  centerLabel   caption under the centre number ("assets")
 *  tooltip       optional custom tooltip element (receives the slice in payload)
 *  valueFormatter(value) -> string
 */
export function DonutChart({
  data, centerLabel = 'total', tooltip, valueFormatter = (v) => v.toLocaleString(),
  className = '', chartClassName = 'h-[220px] sm:h-[240px]', footnote,
}) {
  const [active, setActive] = useState(null)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const current = active != null ? data[active] : null
  const config = useMemo(
    () => Object.fromEntries(data.map((d) => [d.key, { label: d.label, color: d.color }])), [data])

  return (
    <div className={`grid items-center gap-5 sm:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] ${className}`}>
      <ChartContainer config={config} className={`mx-auto max-w-[260px] ${chartClassName}`}>
        <PieChart>
          {/* The centre already reads out the hovered slice; a tooltip is only
              added when it carries more (e.g. which rooms a slice covers). */}
          {tooltip && <Tooltip cursor={false} content={tooltip} wrapperStyle={{ zIndex: 30, outline: 'none' }} />}
          <Pie
            data={data} dataKey="value" nameKey="label"
            innerRadius="58%" outerRadius="80%" paddingAngle={data.length > 1 ? 2 : 0} cornerRadius={4}
            stroke="none" activeIndex={active ?? undefined} activeShape={ActiveSlice}
            onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}
            onClick={(_, i) => setActive((a) => (a === i ? null : i))}
            animationDuration={700}
          >
            {data.map((d, i) => (
              <Cell key={d.key} fill={d.color}
                    opacity={active == null || active === i ? 1 : 0.45}
                    style={{ transition: 'opacity 150ms ease', cursor: 'pointer', outline: 'none' }} />
            ))}
            <Label
              position="center"
              content={({ viewBox }) => {
                const { cx, cy } = viewBox || {}
                if (cx == null) return null
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy - 6} className="chart-center-value">
                      {valueFormatter(current ? current.value : total)}
                    </tspan>
                    <tspan x={cx} y={cy + 16} className="chart-center-label">
                      {current ? current.label : centerLabel}
                    </tspan>
                  </text>
                )
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="min-w-0 space-y-1">
        {data.map((d, i) => {
          const pct = total ? (d.value / total) * 100 : 0
          return (
            <button
              key={d.key} type="button"
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              className={`group w-full rounded-md px-2 py-1.5 text-left transition-colors ${active === i ? 'bg-surface-sunken' : 'hover:bg-surface-sunken'}`}
            >
              <div className="flex items-center justify-between gap-2 text-body-sm">
                <span className="flex min-w-0 items-center gap-2 text-ink-muted">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                  <span className="truncate">{d.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="tabular font-medium text-ink">{valueFormatter(d.value)}</span>
                  <span className="tabular w-10 text-right text-body-xs text-ink-faint">{pct.toFixed(pct < 10 && pct > 0 ? 1 : 0)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: d.color }} />
              </div>
            </button>
          )
        })}
        {footnote && <p className="px-2 pt-1 text-body-xs text-ink-faint">{footnote}</p>}
      </div>
    </div>
  )
}

/** 0..100 gauge (shadcn "Radial Chart - Text"). */
export function RadialScore({ score = 0, color, caption = '/100', className = 'h-[170px] w-[170px]' }) {
  const fill = color || (score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444')
  return (
    <ChartContainer config={{ score: { label: 'Score', color: fill } }} className={className}>
      <RadialBarChart data={[{ name: 'score', value: score }]} startAngle={90} endAngle={-270}
                      innerRadius="76%" outerRadius="100%" barSize={14}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar dataKey="value" background={{ className: 'chart-radial-track' }} cornerRadius={10}
                   fill="var(--color-score)" animationDuration={900} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
          <tspan x="50%" dy="-4" className="chart-center-value chart-center-value-lg">{score}</tspan>
          <tspan x="50%" dy="24" className="chart-center-label" style={{ fill }}>{caption}</tspan>
        </text>
      </RadialBarChart>
    </ChartContainer>
  )
}
