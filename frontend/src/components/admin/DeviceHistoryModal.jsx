import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, AlertTriangle, Droplets, Fan, RefreshCw, Thermometer, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis,
} from 'recharts'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/charts'
import { ErrorState, Modal } from '@/components/ui'
import { api } from '@/lib/api'
import { dt } from '@/lib/format'

/**
 * Telemetry history for one ESP32 device, read from InfluxDB.
 *
 * Three stacked panels (power, climate, fan & light) share one time axis and
 * one hover: pointing anywhere shows the readings from that same moment in all
 * three, so a drop in current can be read against the fan and light at once.
 * Health events raised in the window are drawn as dashed red lines and listed
 * below, so "when did it go wrong" is visible next to what the sensors said.
 */

const RANGES = [
  { key: '1h', label: '1h', long: 'hour' },
  { key: '6h', label: '6h', long: '6 hours' },
  { key: '24h', label: '24h', long: '24 hours' },
  { key: '7d', label: '7d', long: '7 days' },
]

const SYNC = 'device-history'
const REFRESH_MS = 30_000

// Colour is reserved for meaning elsewhere in the app (red = fault, green =
// healthy), so the series use the brand and neutral hues and only fault
// markers are red.
const COLOR = {
  current_a: 'rgb(var(--c-secondary))',
  temperature_c: '#6366f1',
  humidity_pct: '#0ea5e9',
  fan_pct: '#8b5cf6',
  light: '#64748b',
}
const FAULT = '#ef4444'

const UNAVAILABLE = {
  not_configured: "History storage isn't configured for this deployment.",
  no_read_access: "The InfluxDB token can only write. Give it read access to the bucket to see history.",
  timeout: 'The history store took too long to answer.',
  unreachable: 'The history store could not be reached right now.',
}

const KIND = (k) => String(k || '').replaceAll('_', ' ')

/** Evenly spaced, round-numbered ticks in local time (10 min, 1 h, 4 h or midnight),
 *  so the axis always reads cleanly however the readings happen to fall. */
function makeTicks(since, until, rangeKey) {
  if (!since || !until) return undefined
  const step = { '1h': 10 * 60e3, '6h': 3600e3, '24h': 4 * 3600e3, '7d': 86400e3 }[rangeKey]
  const d = new Date(since)
  if (rangeKey === '7d') d.setHours(0, 0, 0, 0)
  else if (rangeKey === '24h') d.setHours(Math.floor(d.getHours() / 4) * 4, 0, 0, 0)
  else if (rangeKey === '6h') d.setMinutes(0, 0, 0)
  else d.setMinutes(Math.floor(d.getMinutes() / 10) * 10, 0, 0)
  const ticks = []
  for (let t = d.getTime(); t <= until; t += step) if (t >= since) ticks.push(t)
  return ticks
}

/** Faults that happen close together would stack into an unreadable smear of
 *  lines and labels; draw one marker per burst. The list below names every one. */
function clusterEvents(events, spanMs) {
  const sorted = [...events].sort((a, b) => a.at - b.at)
  const gap = spanMs * 0.012
  const out = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (last && e.at - last.end <= gap) { last.count += 1; last.end = e.at } else out.push({ at: e.at, end: e.at, count: 1, reference: e.reference })
  }
  // Only name a marker when it sits clear of the last named one, or the labels collide.
  let lastLabelled = -Infinity
  for (const c of out) {
    c.label = c.at - lastLabelled >= spanMs * 0.12
    if (c.label) lastLabelled = c.at
  }
  return out
}

const bucketName = (sec) => (sec >= 3600 ? '1-hour' : `${Math.round(sec / 60)}-minute`)

/** Insert a break wherever readings stop for a while (device offline) so the
 *  line stops there instead of drawing a straight, made-up segment across it. */
function withGaps(points, bucketSeconds) {
  if (!points.length || !bucketSeconds) return points
  const limit = bucketSeconds * 1000 * 2.5
  const out = []
  points.forEach((p, i) => {
    if (i > 0 && p.t - points[i - 1].t > limit) out.push({ t: points[i - 1].t + bucketSeconds * 1000 })
    out.push(p)
  })
  return out
}

const SERIES = ['current_a', 'temperature_c', 'humidity_pct', 'fan_pct', 'light']

/** A reading with nothing on either side (a short spell of data between silences)
 *  draws no line at all, so it would vanish. Flag those so they can be drawn as dots. */
function markSolo(points) {
  return points.map((p, i) => {
    const out = { ...p }
    for (const k of SERIES) {
      out[`solo_${k}`] = p[k] != null && points[i - 1]?.[k] == null && points[i + 1]?.[k] == null
    }
    return out
  })
}

const soloDot = (key, color) => function SoloDot({ cx, cy, payload }) {
  if (!payload?.[`solo_${key}`] || cx == null || cy == null) return <g />
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="rgb(var(--c-surface))" strokeWidth={1.5} />
}

const avg = (pts, key) => {
  const v = pts.map((p) => p[key]).filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const maxOf = (pts, key) => {
  const v = pts.map((p) => p[key]).filter((x) => x != null)
  return v.length ? Math.max(...v) : null
}
const fmt = (v, nd = 1, unit = '') => (v == null ? '—' : `${Number(v).toFixed(nd)}${unit}`)

function Kpi({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-subtle bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-body-xs text-ink-faint">
        <Icon size={13} style={{ color: tone }} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className="tabular mt-1 text-[1.35rem] font-semibold leading-none tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 truncate text-body-xs text-ink-faint">{hint}</p>}
    </div>
  )
}

function Panel({ title, legend, children }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h4 className="text-body-sm font-medium text-ink">{title}</h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-xs text-ink-muted">
          {legend.map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: COLOR[key] }} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
      {children}
    </section>
  )
}

export function DeviceHistoryModal({ device, roomLabel, onClose }) {
  const [range, setRange] = useState('6h')

  const history = useQuery({
    queryKey: ['device-history', device?.id, range],
    queryFn: () => api.get(`/health/devices/${device.id}/history`, { params: { range } }),
    enabled: !!device?.id,
    refetchInterval: REFRESH_MS,
    placeholderData: (prev) => prev,   // keep the old chart while the next range loads
  })

  // Re-render each few seconds so "Updated 12s ago" stays honest.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5_000)
    return () => clearInterval(id)
  }, [])

  const data = history.data
  const raw = data?.points || []
  const points = useMemo(() => markSolo(withGaps(raw, data?.bucket_seconds)), [raw, data?.bucket_seconds])
  const events = data?.events || []
  const domain = data ? [data.since, data.until] : ['dataMin', 'dataMax']
  const longRange = range === '7d'
  const tickFormat = (t) => dt(new Date(t), longRange ? 'EEE d' : 'HH:mm')
  const labelFormat = (t) => dt(new Date(t), 'EEE d MMM, HH:mm')

  const fanAvg = avg(raw, 'fan_pct')
  const ticks = useMemo(() => makeTicks(data?.since, data?.until, range), [data?.since, data?.until, range])
  const clusters = useMemo(
    () => (data ? clusterEvents(events, data.until - data.since) : []),
    [events, data],
  )

  const xAxis = (visible) => (
    <XAxis
      dataKey="t" type="number" scale="time" domain={domain} hide={!visible} ticks={ticks}
      tickFormatter={tickFormat} tickMargin={8} interval={0} axisLine={false} tickLine={false}
    />
  )
  // A chart with named y-axes needs the marker tied to one of them.
  const markers = (yAxisId, labelled = false) => clusters.map((c) => (
    <ReferenceLine
      key={c.at} x={c.at} yAxisId={yAxisId} stroke={FAULT} strokeDasharray="4 3" strokeWidth={1.5}
      strokeOpacity={0.8} ifOverflow="hidden"
      label={labelled && c.label
        ? { value: c.count > 1 ? `${c.count} faults` : c.reference, position: 'insideTopLeft', fill: FAULT, fontSize: 11, fontWeight: 600 }
        : undefined}
    />
  ))
  const tooltip = (formatter) => (
    <ChartTooltip
      cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeDasharray: '4 4' }}
      content={<ChartTooltipContent labelFormatter={labelFormat} valueFormatter={formatter} />}
    />
  )

  const body = () => {
    if (history.isLoading) {
      return (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[74px] rounded-lg" />)}
          </div>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[190px] rounded-lg" />)}
        </div>
      )
    }
    if (history.isError) return <ErrorState error={history.error} onRetry={history.refetch} />
    if (!data.available) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
          <Activity size={22} className="text-ink-faint" aria-hidden="true" />
          <p className="text-body-md font-medium text-ink">History is unavailable right now</p>
          <p className="max-w-sm text-body-sm text-ink-muted">
            {UNAVAILABLE[data.reason] || UNAVAILABLE.unreachable} Live status and fault detection are not affected.
          </p>
          <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => history.refetch()}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )
    }
    if (!raw.length) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
          <Activity size={22} className="text-ink-faint" aria-hidden="true" />
          <p className="text-body-md font-medium text-ink">No readings in this period</p>
          <p className="max-w-sm text-body-sm text-ink-muted">
            This device sent nothing in the last {RANGES.find((r) => r.key === range)?.long}.
            Try a longer range, or check that it is powered and connected.
          </p>
        </div>
      )
    }

    const common = { data: points, syncId: SYNC, margin: { top: 8, right: 8, bottom: 0, left: 0 } }
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi icon={Zap} tone={COLOR.current_a} label="Average current" value={fmt(avg(raw, 'current_a'), 2, ' A')}
               hint={`Peak ${fmt(maxOf(raw, 'current_a'), 2, ' A')}`} />
          <Kpi icon={Thermometer} tone={COLOR.temperature_c} label="Average temperature"
               value={fmt(avg(raw, 'temperature_c'), 1, '°C')} hint={`Peak ${fmt(maxOf(raw, 'temperature_c'), 1, '°C')}`} />
          <Kpi icon={Droplets} tone={COLOR.humidity_pct} label="Average humidity"
               value={fmt(avg(raw, 'humidity_pct'), 0, '%')} hint={`Peak ${fmt(maxOf(raw, 'humidity_pct'), 0, '%')}`} />
          <Kpi icon={Fan} tone={COLOR.fan_pct} label="Fan turning"
               value={fanAvg == null ? '—' : `${Math.round(fanAvg)}%`} hint="of the time readings were received" />
        </div>

        <Panel title="Power draw" legend={[['current_a', 'Current (A)']]}>
          <ChartContainer className="h-[170px]" config={{ current_a: { label: 'Current', color: COLOR.current_a } }}>
            <AreaChart {...common} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="hist-current" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR.current_a} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLOR.current_a} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              {xAxis(false)}
              <YAxis width={44} domain={[0, 'auto']} tickFormatter={(v) => `${v}A`} axisLine={false} tickLine={false} />
              {tooltip((v) => fmt(v, 3, ' A'))}
              <Area type="monotone" dataKey="current_a" stroke={COLOR.current_a} strokeWidth={2}
                    fill="url(#hist-current)" dot={soloDot('current_a', COLOR.current_a)} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              {markers(undefined, true)}
            </AreaChart>
          </ChartContainer>
        </Panel>

        <Panel title="Temperature and humidity"
               legend={[['temperature_c', 'Temperature (°C)'], ['humidity_pct', 'Humidity (%)']]}>
          <ChartContainer className="h-[170px]" config={{
            temperature_c: { label: 'Temperature', color: COLOR.temperature_c },
            humidity_pct: { label: 'Humidity', color: COLOR.humidity_pct },
          }}>
            <LineChart {...common} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              {xAxis(false)}
              <YAxis yAxisId="t" width={44} allowDecimals={false}
                     domain={[(min) => Math.floor(min - 1), (max) => Math.ceil(max + 1)]} tickFormatter={(v) => `${v}°`}
                     axisLine={false} tickLine={false} />
              <YAxis yAxisId="h" orientation="right" width={44} domain={[0, 100]}
                     tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              {tooltip((v, key) => (key === 'temperature_c' ? fmt(v, 1, '°C') : fmt(v, 0, '%')))}
              <Line yAxisId="t" type="monotone" dataKey="temperature_c" stroke={COLOR.temperature_c} strokeWidth={2}
                    dot={soloDot('temperature_c', COLOR.temperature_c)} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              <Line yAxisId="h" type="monotone" dataKey="humidity_pct" stroke={COLOR.humidity_pct} strokeWidth={2}
                    dot={soloDot('humidity_pct', COLOR.humidity_pct)} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              {markers('t')}
            </LineChart>
          </ChartContainer>
        </Panel>

        <Panel title="Fan and light" legend={[['fan_pct', 'Fan turning (%)'], ['light', 'Light (raw sensor value)']]}>
          <ChartContainer className="h-[190px]" config={{
            fan_pct: { label: 'Fan turning', color: COLOR.fan_pct },
            light: { label: 'Light (raw)', color: COLOR.light },
          }}>
            <ComposedChart {...common} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              {xAxis(true)}
              <YAxis yAxisId="f" width={44} domain={[0, 108]} ticks={[0, 50, 100]}
                     tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              {/* Zoomed to the data: the raw sensor value moves by tens on a 0-4095 scale, which a
                  zero-based axis would flatten into a straight line. */}
              <YAxis yAxisId="l" orientation="right" width={44} allowDecimals={false}
                     domain={['dataMin - 25', 'dataMax + 25']} axisLine={false} tickLine={false} />
              {tooltip((v, key) => (key === 'fan_pct' ? fmt(v, 0, '%') : fmt(v, 0)))}
              <Area yAxisId="f" type="stepAfter" dataKey="fan_pct" stroke={COLOR.fan_pct} strokeWidth={1.75}
                    fill={COLOR.fan_pct} fillOpacity={0.16} dot={soloDot('fan_pct', COLOR.fan_pct)} activeDot={{ r: 4 }}
                    connectNulls={false} isAnimationActive={false} />
              <Line yAxisId="l" type="monotone" dataKey="light" stroke={COLOR.light} strokeWidth={2}
                    dot={soloDot('light', COLOR.light)} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              {markers('f')}
            </ComposedChart>
          </ChartContainer>
        </Panel>

        <p className="px-1 text-body-xs text-ink-faint">
          Each point is the average of the readings received in a {bucketName(data.bucket_seconds)} window.
          A break in a line means the device sent nothing then. Times are in your local time.
        </p>

        {events.length > 0 && (
          <section className="rounded-lg border border-border-subtle bg-surface p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-body-sm font-medium text-ink">
              <AlertTriangle size={14} style={{ color: FAULT }} aria-hidden="true" />
              Faults in this period ({events.length})
              <span className="font-normal text-ink-faint">· red dashed lines on the charts</span>
            </h4>
            <ul className="max-h-52 divide-y divide-border-subtle overflow-y-auto">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-body-sm">
                  <span className="font-mono text-mono-data text-secondary">{e.reference}</span>
                  <span className="capitalize text-ink">{KIND(e.kind)}</span>
                  <span className="pill bg-neutral-bg text-neutral-text capitalize">{KIND(e.status)}</span>
                  <span className="ml-auto text-ink-faint tabular">{labelFormat(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  const updated = history.dataUpdatedAt ? Math.max(0, Math.round((Date.now() - history.dataUpdatedAt) / 1000)) : null

  return (
    <Modal open={!!device} onClose={onClose} title={`Device history · ${device?.device_id || ''}`} size="xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-body-sm text-ink-muted">{roomLabel}</p>
          <div className="flex items-center gap-3">
            {updated != null && (
              <span className="inline-flex items-center gap-1.5 text-body-xs text-ink-faint" aria-live="off">
                <i className={clsx('h-1.5 w-1.5 rounded-full', history.isFetching ? 'animate-pulse bg-secondary' : 'bg-ink-faint')} />
                {history.isFetching ? 'Updating…' : `Updated ${updated < 5 ? 'just now' : `${updated}s ago`}`}
              </span>
            )}
            <div role="tablist" aria-label="Time range" className="inline-flex rounded-lg bg-surface-sunken p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key} type="button" role="tab" aria-selected={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={clsx(
                    'h-8 rounded-md px-3 text-body-sm font-medium transition-colors',
                    range === r.key ? 'bg-surface text-ink shadow-level2' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {body()}
      </div>
    </Modal>
  )
}
