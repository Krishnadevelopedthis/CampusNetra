import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Clock, Columns2, History, Pause, Play, RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button, EmptyState, ErrorState, Select, Spinner, Widget,
} from '@/components/ui'
import { FloorPlan, TwinLegend } from '@/features/twin/FloorPlan'
import { api } from '@/lib/api'
import { TWIN_STATE, dt, titleCase } from '@/lib/format'

/** Playback speeds, as multiples of "one hour of history per second". */
const SPEEDS = [
  { label: '1×', hoursPerSecond: 1 },
  { label: '4×', hoursPerSecond: 4 },
  { label: '12×', hoursPerSecond: 12 },
]

const EVENT_LABEL = {
  asset_state_changed: 'Asset state changed',
  issue_created: 'Issue reported',
  issue_status_changed: 'Issue updated',
  work_order_created: 'Work order created',
  work_order_status_changed: 'Work order updated',
  inspection_submitted: 'Inspection submitted',
  sla_breached: 'SLA breached',
}

export default function EventReplay() {
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [position, setPosition] = useState(1)      // 0 = start of history, 1 = now
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [compare, setCompare] = useState(false)
  const [comparePosition, setComparePosition] = useState(0)
  const frame = useRef(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const range = useQuery({
    queryKey: ['replay-range', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/replay-range`),
    enabled: !!campusId,
  })

  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })
  useEffect(() => {
    if (!buildingId && buildings.data?.length) setBuildingId(buildings.data[0].id)
  }, [buildings.data, buildingId])

  const floors = useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/campus/buildings/${buildingId}/floors`),
    enabled: !!buildingId,
  })
  useEffect(() => {
    if (!floorId && floors.data?.length) setFloorId(floors.data[0].id)
  }, [floors.data, floorId])

  // The plan supplies geometry; historical state is layered on top of it.
  const plan = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`),
    enabled: !!floorId,
  })

  const bounds = useMemo(() => {
    if (!range.data) return null
    const start = new Date(range.data.start).getTime()
    const end = new Date(range.data.end).getTime()
    return { start, end, span: Math.max(end - start, 60_000) }
  }, [range.data])

  const timeAt = useCallback(
    (pos) => (bounds ? new Date(bounds.start + bounds.span * pos) : null),
    [bounds],
  )

  const currentTime = timeAt(position)
  const compareTime = timeAt(comparePosition)

  // Reconstructed state is fetched per instant; rounding to the minute keeps the
  // query key stable while scrubbing, so playback does not fire a request a frame.
  const minuteKey = currentTime ? Math.floor(currentTime.getTime() / 60000) : null
  const stateAt = useQuery({
    queryKey: ['state-at', campusId, minuteKey],
    queryFn: () => api.get(`/campus/campuses/${campusId}/state-at`, {
      params: { at: currentTime.toISOString() },
    }),
    enabled: !!campusId && !!currentTime,
    keepPreviousData: true,
  })

  const compareMinuteKey = compareTime ? Math.floor(compareTime.getTime() / 60000) : null
  const compareState = useQuery({
    queryKey: ['state-at', campusId, compareMinuteKey],
    queryFn: () => api.get(`/campus/campuses/${campusId}/state-at`, {
      params: { at: compareTime.toISOString() },
    }),
    enabled: compare && !!campusId && !!compareTime,
    keepPreviousData: true,
  })

  const events = useQuery({
    queryKey: ['twin-events', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/events`, { params: { limit: 200 } }),
    enabled: !!campusId,
  })

  // ---- playback ----
  useEffect(() => {
    if (!playing || !bounds) return
    let last = performance.now()

    const tick = (now) => {
      const elapsed = (now - last) / 1000
      last = now
      const hours = SPEEDS[speed].hoursPerSecond * elapsed
      setPosition((p) => {
        const next = p + (hours * 3_600_000) / bounds.span
        if (next >= 1) {
          setPlaying(false)
          return 1
        }
        return next
      })
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [playing, speed, bounds])

  /** Overlay reconstructed states onto the plan's geometry. */
  const roomsAt = useCallback((snapshot) => {
    if (!plan.data) return []
    if (!snapshot) return plan.data.rooms

    const byAsset = new Map(snapshot.assets.map((a) => [a.id, a]))
    const severity = ['fault', 'warning', 'inspection_required', 'under_maintenance', 'healthy']

    return plan.data.rooms.map((room) => {
      const assets = (room.assets || []).map((a) => {
        const past = byAsset.get(a.id)
        if (!past) return a
        return {
          ...a,
          state: past.state,
          colour: past.colour,
          label: TWIN_STATE[past.state]?.label || past.state,
          // Issue counts are a live figure; they would be misleading on a
          // historical view, so they are cleared rather than carried over.
          open_issue_count: 0,
          active_issue_reference: null,
        }
      })
      const worst = severity.find((s) => assets.some((a) => a.state === s)) || 'healthy'
      return {
        ...room,
        assets,
        aggregate_state: worst,
        aggregate_colour: TWIN_STATE[worst]?.colour || '#10b981',
        open_issue_count: 0,
      }
    })
  }, [plan.data])

  const rooms = useMemo(() => roomsAt(stateAt.data), [roomsAt, stateAt.data])
  const compareRooms = useMemo(() => roomsAt(compareState.data), [roomsAt, compareState.data])

  // Events up to the playhead, most recent first.
  const pastEvents = useMemo(() => {
    if (!events.data || !currentTime) return []
    return events.data.filter((e) => new Date(e.occurred_at) <= currentTime).slice(0, 40)
  }, [events.data, currentTime])

  // Marks on the scrubber, so you can see where something actually happened.
  const ticks = useMemo(() => {
    if (!events.data || !bounds) return []
    return events.data
      .map((e) => (new Date(e.occurred_at).getTime() - bounds.start) / bounds.span)
      .filter((p) => p >= 0 && p <= 1)
  }, [events.data, bounds])

  if (campuses.isLoading || range.isLoading) return <Spinner label="Loading campus history…" />
  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.refetch} />
  // Without this the scrubber renders with no bounds and no timestamp, which
  // reads as a broken control rather than a failed request.
  if (range.error) return <ErrorState error={range.error} onRetry={range.refetch} />
  if (!range.data) {
    return (
      <div className="space-y-5">
        <Header />
        <Widget><Spinner label="Reading campus history…" /></Widget>
      </div>
    )
  }

  if (range.data && !range.data.has_history) {
    return (
      <div className="space-y-5">
        <Header />
        <Widget>
          <EmptyState
            icon={History} title="No history recorded yet"
            description="Replay reconstructs the campus from recorded state changes. Report an issue or update an asset, and its transitions will appear here."
          />
        </Widget>
      </div>
    )
  }

  const step = (delta) => {
    setPlaying(false)
    setPosition((p) => Math.min(1, Math.max(0, p + delta)))
  }

  return (
    <div className="space-y-5">
      <Header
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={compare ? 'primary' : 'secondary'} size="sm" icon={Columns2}
              onClick={() => setCompare((c) => !c)}
            >
              Compare
            </Button>
            <Button variant="secondary" size="sm" icon={RotateCcw}
                    onClick={() => { setPosition(1); setPlaying(false) }}>
              Now
            </Button>
          </div>
        }
      />

      {/* Transport */}
      <Widget bodyClass="p-widget">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="dark" icon={playing ? Pause : Play}
            onClick={() => {
              // Restart from the beginning if play is pressed at the end.
              if (!playing && position >= 1) setPosition(0)
              setPlaying((p) => !p)
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </Button>

          <div className="flex">
            <button onClick={() => step(-0.02)}
                    className="btn-secondary rounded-r-none h-10 w-10 p-0" aria-label="Step back">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => step(0.02)}
                    className="btn-secondary rounded-l-none border-l-0 h-10 w-10 p-0" aria-label="Step forward">
              <ChevronRight size={16} />
            </button>
          </div>

          <Select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-auto min-w-[90px]">
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </Select>

          <div className="flex items-center gap-2 ml-auto">
            <Clock size={15} className="text-ink-faint" />
            <span className="font-mono text-mono-data text-ink tabular">
              {currentTime ? dt(currentTime, 'd MMM yyyy, HH:mm') : '—'}
            </span>
            {position >= 0.999 && (
              <span className="pill bg-success-bg text-success-text">Live</span>
            )}
          </div>
        </div>

        {/* Scrubber */}
        <div className="relative mt-4">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-surface-sunken pointer-events-none" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-secondary pointer-events-none"
            style={{ width: `${position * 100}%` }}
          />
          {/* One mark per recorded event */}
          {ticks.map((t, i) => (
            <span key={i}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-primary/30 pointer-events-none"
                  style={{ left: `${t * 100}%` }} />
          ))}
          {compare && (
            <span className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-warning pointer-events-none"
                  style={{ left: `${comparePosition * 100}%` }} />
          )}
          <input
            type="range" min="0" max="1" step="0.001" value={position}
            onChange={(e) => { setPlaying(false); setPosition(Number(e.target.value)) }}
            className="relative w-full appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-secondary [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-level2"
            aria-label="Scrub through campus history"
          />
        </div>
        <div className="flex justify-between text-body-sm text-ink-faint mt-1">
          <span>{range.data ? dt(range.data.start, 'd MMM, HH:mm') : ''}</span>
          <span>{range.data?.transitions} state changes recorded</span>
          <span>now</span>
        </div>

        {compare && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <label className="text-label-caps uppercase text-ink-muted">
              Compare against — {compareTime ? dt(compareTime, 'd MMM yyyy, HH:mm') : '—'}
            </label>
            <input
              type="range" min="0" max="1" step="0.001" value={comparePosition}
              onChange={(e) => setComparePosition(Number(e.target.value))}
              className="w-full mt-2 accent-warning cursor-pointer"
              aria-label="Comparison timestamp"
            />
          </div>
        )}
      </Widget>

      {/* Plan(s) */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setFloorId('') }}
                className="w-auto min-w-[200px]">
          {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={floorId} onChange={(e) => setFloorId(e.target.value)}
                className="w-auto min-w-[140px]">
          {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <div className="ml-auto">
          <TwinLegend breakdown={stateAt.data?.state_breakdown} />
        </div>
      </div>

      <div className={compare ? 'grid xl:grid-cols-2 gap-4' : ''}>
        <Widget
          title={compare ? dt(currentTime, 'd MMM, HH:mm') : undefined}
          subtitle={compare ? 'Primary' : undefined}
          bodyClass="p-0" className="overflow-hidden"
        >
          {plan.isLoading ? <Spinner label="Loading plan…" />
            : !plan.data?.rooms?.length
              ? <EmptyState icon={History} title="No rooms mapped on this floor" />
              : <FloorPlan rooms={rooms} className="h-[440px]" />}
        </Widget>

        {compare && (
          <Widget title={compareTime ? dt(compareTime, 'd MMM, HH:mm') : '—'}
                  subtitle="Comparison" bodyClass="p-0" className="overflow-hidden">
            {compareState.isLoading ? <Spinner label="Reconstructing…" />
              : <FloorPlan rooms={compareRooms} className="h-[440px]" />}
          </Widget>
        )}
      </div>

      {compare && stateAt.data && compareState.data && (
        <ComparisonSummary a={compareState.data} b={stateAt.data}
                           aTime={compareTime} bTime={currentTime} />
      )}

      <Widget title="Event Timeline" subtitle={`${pastEvents.length} events up to this point`}
              bodyClass="p-0">
        {pastEvents.length === 0 ? (
          <p className="text-body-md text-ink-faint text-center py-10">
            Nothing had happened yet at this point in time.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle max-h-80 overflow-y-auto">
            {pastEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-widget py-2.5">
                <span className="font-mono text-[11px] text-ink-faint w-28 shrink-0 pt-0.5">
                  {dt(e.occurred_at, 'd MMM HH:mm')}
                </span>
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ background: e.payload?.colour || '#94a3b8' }} />
                <div className="min-w-0">
                  <p className="text-body-md text-ink">
                    {EVENT_LABEL[e.kind] || titleCase(e.kind)}
                    {e.payload?.tag && (
                      <span className="font-mono text-mono-data text-secondary ml-1.5">
                        {e.payload.tag}
                      </span>
                    )}
                    {e.payload?.reference && (
                      <span className="font-mono text-mono-data text-secondary ml-1.5">
                        {e.payload.reference}
                      </span>
                    )}
                  </p>
                  {e.payload?.from && e.payload?.to && (
                    <p className="text-body-sm text-ink-muted">
                      {titleCase(e.payload.from)} → <strong>{titleCase(e.payload.to)}</strong>
                      {e.payload.reason && ` · ${e.payload.reason}`}
                    </p>
                  )}
                  {e.payload?.title && !e.payload?.from && (
                    <p className="text-body-sm text-ink-muted truncate">{e.payload.title}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Widget>
    </div>
  )
}

function Header({ right }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-headline-lg text-ink">Event Replay</h1>
        <p className="text-body-md text-ink-muted mt-1">
          Reconstruct the campus exactly as it stood at any past moment.
        </p>
      </div>
      {right}
    </header>
  )
}

/** What changed between the two selected instants. */
function ComparisonSummary({ a, b, aTime, bTime }) {
  const byId = new Map(a.assets.map((x) => [x.id, x]))
  const changed = b.assets
    .map((x) => ({ ...x, was: byId.get(x.id)?.state }))
    .filter((x) => x.was && x.was !== x.state)

  return (
    <Widget
      title="What changed"
      subtitle={`${dt(aTime, 'd MMM HH:mm')} → ${dt(bTime, 'd MMM HH:mm')}`}
    >
      {changed.length === 0 ? (
        <p className="text-body-md text-ink-faint">
          Nothing changed between these two moments.
        </p>
      ) : (
        <div className="space-y-2">
          {changed.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-mono-data text-secondary w-28">{x.tag}</span>
              <span className="pill" style={{
                background: `${TWIN_STATE[x.was]?.colour}1a`, color: TWIN_STATE[x.was]?.colour }}>
                {TWIN_STATE[x.was]?.label || x.was}
              </span>
              <span className="text-ink-faint">→</span>
              <span className="pill" style={{
                background: `${x.colour}1a`, color: x.colour }}>
                {TWIN_STATE[x.state]?.label || x.state}
              </span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}
