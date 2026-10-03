import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Clock, Crosshair, History, Pause, Play, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button, EmptyState, ErrorState, Field, Input, Select, Spinner, Widget,
} from '@/components/ui'
import { FloorPlan, TwinLegend } from '@/features/twin/FloorPlan'
import { api } from '@/lib/api'
import { TWIN_STATE, dt, titleCase } from '@/lib/format'

/** Playback speeds: how many seconds it takes to play the whole chosen window. */
const SPEEDS = [
  { label: '1×', seconds: 40 },
  { label: '2×', seconds: 20 },
  { label: '4×', seconds: 10 },
]

const EVENT_LABEL = {
  asset_state_changed: 'Asset state changed',
  issue_created: 'Complaint reported',
  issue_status_changed: 'Complaint updated',
  work_order_created: 'Work order created',
  work_order_status_changed: 'Work order updated',
  inspection_submitted: 'Inspection submitted',
  sla_breached: 'SLA breached',
}

const KIND_GROUP = { issue: 'Complaints', work_order: 'Work orders', asset: 'Assets', inspection: 'Inspections' }

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const combine = (date, time) => new Date(`${date}T${time || '00:00'}`)
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** The label an event's subject is listed under in "Replay one item". */
function subjectOf(e) {
  const p = e.payload || {}
  if (e.entity_type === 'asset') return { id: e.entity_id, type: 'asset', label: p.name ? `${p.name}` : p.tag || 'Asset' }
  const ref = p.reference || ''
  return { id: e.entity_id, type: e.entity_type, label: [ref, p.title].filter(Boolean).join(' · ') || titleCase(e.entity_type) }
}

export default function EventReplay() {
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [position, setPosition] = useState(1)      // 0 = window start, 1 = window end
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [win, setWin] = useState(null)             // { from: Date, to: Date }
  const [focus, setFocus] = useState(null)         // { id, type, label }
  const frame = useRef(null)

  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = campuses.data?.[0]?.id

  const range = useQuery({
    queryKey: ['replay-range', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/replay-range`),
    enabled: !!campusId,
  })

  // Earliest moment with any history, and now: the window can never leave these.
  const limits = useMemo(() => {
    if (!range.data) return null
    return { min: new Date(range.data.start), max: new Date() }
  }, [range.data])

  // Default window: today so far (or from when history starts, if that is later).
  useEffect(() => {
    if (!limits || win) return
    const from = new Date(Math.max(startOfDay(limits.max).getTime(), limits.min.getTime()))
    setWin({ from, to: limits.max })
  }, [limits, win])

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

  const plan = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: () => api.get(`/campus/floors/${floorId}/plan`),
    enabled: !!floorId,
  })

  const span = win ? Math.max(win.to - win.from, 60_000) : 0
  const timeAt = useCallback((pos) => (win ? new Date(win.from.getTime() + span * pos) : null), [win, span])
  const currentTime = timeAt(position)

  const minuteKey = currentTime ? Math.floor(currentTime.getTime() / 60000) : null
  const stateAt = useQuery({
    queryKey: ['state-at', campusId, minuteKey],
    queryFn: () => api.get(`/campus/campuses/${campusId}/state-at`, { params: { at: currentTime.toISOString() } }),
    enabled: !!campusId && !!currentTime,
    keepPreviousData: true,
  })

  // Everything inside the window.
  const events = useQuery({
    queryKey: ['twin-events', campusId, win?.from?.getTime(), win?.to?.getTime()],
    queryFn: () => api.get(`/campus/campuses/${campusId}/events`, {
      params: { since: win.from.toISOString(), until: win.to.toISOString(), limit: 1000 },
    }),
    enabled: !!campusId && !!win,
    keepPreviousData: true,
  })

  // Every complaint, work order, asset and inspection that has activity in the window.
  const subjects = useMemo(() => {
    // Status-change events carry only a reference; the creating event has the
    // title too, so keep whichever label says the most.
    const seen = new Map()
    for (const e of events.data || []) {
      const s = subjectOf(e)
      const had = seen.get(s.id)
      if (!had || s.label.length > had.label.length) seen.set(s.id, s)
    }
    const groups = {}
    for (const s of seen.values()) (groups[KIND_GROUP[s.type] || 'Other'] ??= []).push(s)
    return groups
  }, [events.data])

  // Is an event part of the chosen item's story? A complaint pulls in its work
  // orders and what both of them did to the asset.
  const related = useMemo(() => {
    if (!focus) return null
    const all = events.data || []
    const woIds = new Set(all.filter((e) => e.entity_type === 'work_order'
      && (e.entity_id === focus.id || e.payload?.issue_id === focus.id)).map((e) => e.entity_id))
    return (e) => e.entity_id === focus.id
      || e.payload?.issue_id === focus.id
      || e.payload?.work_order_id === focus.id
      || e.payload?.asset_id === focus.id
      || woIds.has(e.entity_id)
      || (e.payload?.work_order_id && woIds.has(e.payload.work_order_id))
  }, [focus, events.data])

  const visibleEvents = useMemo(
    () => (events.data || []).filter((e) => !related || related(e)),
    [events.data, related],
  )

  /** Replay only one item: fit the window to its activity and open its floor. */
  const chooseFocus = (subject) => {
    setPlaying(false)
    setFocus(subject)
    if (!subject) return
    const mine = (events.data || []).filter((e) => e.entity_id === subject.id
      || e.payload?.issue_id === subject.id || e.payload?.work_order_id === subject.id || e.payload?.asset_id === subject.id)
    if (!mine.length) return
    const times = mine.map((e) => new Date(e.occurred_at).getTime())
    const from = new Date(Math.max(Math.min(...times) - 5 * 60_000, limits.min.getTime()))
    const to = new Date(Math.min(Math.max(...times) + 5 * 60_000, Date.now()))
    setWin({ from, to })
    setPosition(0)
    const located = mine.find((e) => e.floor_id)
    if (located) {
      setBuildingId(located.building_id)
      setFloorId(located.floor_id)
    }
  }

  const focusAsset = useMemo(() => {
    if (!focus) return null
    if (focus.type === 'asset') return focus.id
    return visibleEvents.find((e) => e.entity_type === 'asset')?.entity_id
      || visibleEvents.find((e) => e.payload?.asset_id)?.payload.asset_id || null
  }, [focus, visibleEvents])

  // ---- playback: the whole window plays in a fixed number of seconds ----
  useEffect(() => {
    if (!playing) return undefined
    let last = performance.now()
    const tick = (now) => {
      const elapsed = (now - last) / 1000
      last = now
      setPosition((p) => {
        const next = p + elapsed / SPEEDS[speed].seconds
        if (next >= 1) { setPlaying(false); return 1 }
        return next
      })
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [playing, speed])

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
          ...a, state: past.state, colour: past.colour,
          label: TWIN_STATE[past.state]?.label || past.state,
          open_issue_count: 0, active_issue_reference: null,
        }
      })
      const worst = severity.find((s) => assets.some((a) => a.state === s)) || 'healthy'
      return { ...room, assets, aggregate_state: worst, aggregate_colour: TWIN_STATE[worst]?.colour || '#10b981', open_issue_count: 0 }
    })
  }, [plan.data])

  const rooms = useMemo(() => roomsAt(stateAt.data), [roomsAt, stateAt.data])

  const pastEvents = useMemo(() => {
    if (!currentTime) return []
    return visibleEvents.filter((e) => new Date(e.occurred_at) <= currentTime)
  }, [visibleEvents, currentTime])

  const ticks = useMemo(() => {
    if (!win) return []
    return visibleEvents
      .map((e) => (new Date(e.occurred_at).getTime() - win.from.getTime()) / span)
      .filter((p) => p >= 0 && p <= 1)
  }, [visibleEvents, win, span])

  if (campuses.isLoading || range.isLoading) return <Spinner label="Loading campus history…" />
  if (campuses.error) return <ErrorState error={campuses.error} onRetry={campuses.refetch} />
  if (range.error) return <ErrorState error={range.error} onRetry={range.refetch} />
  if (!range.data || !win) {
    return <div className="space-y-5"><Header /><Widget><Spinner label="Reading campus history…" /></Widget></div>
  }
  if (!range.data.has_history) {
    return (
      <div className="space-y-5">
        <Header />
        <Widget>
          <EmptyState icon={History} title="No history recorded yet"
            description="Replay reconstructs the campus from recorded state changes. Report an issue or update an asset, and its transitions will appear here." />
        </Widget>
      </div>
    )
  }

  const step = (delta) => { setPlaying(false); setPosition((p) => Math.min(1, Math.max(0, p + delta))) }

  /** Set one edge of the window from the date/time inputs, kept inside history and in order. */
  const setEdge = (edge, date, time) => {
    let d = combine(date, time)
    if (Number.isNaN(d.getTime())) return
    d = new Date(Math.min(Math.max(d.getTime(), limits.min.getTime()), Date.now()))
    setPlaying(false)
    setFocus(null)
    setWin((w) => {
      const next = { ...w, [edge]: d }
      if (next.to <= next.from) {
        if (edge === 'from') next.to = new Date(Math.min(d.getTime() + 3_600_000, Date.now()))
        else next.from = new Date(Math.max(d.getTime() - 3_600_000, limits.min.getTime()))
      }
      return next
    })
    setPosition(edge === 'from' ? 0 : 1)
  }

  const preset = (key) => {
    const now = new Date()
    const min = limits.min.getTime()
    const from = {
      today: startOfDay(now).getTime(),
      day: now.getTime() - 86_400_000,
      week: now.getTime() - 7 * 86_400_000,
      all: min,
    }[key]
    setPlaying(false)
    setFocus(null)
    setWin({ from: new Date(Math.max(from, min)), to: now })
    setPosition(1)
  }

  const minDate = dateStr(limits.min)
  const maxDate = dateStr(new Date())

  return (
    <div className="space-y-5">
      <Header />

      {/* What to replay: a window of time, optionally one item */}
      <Widget bodyClass="p-widget space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-full min-w-0">
          {[['today', 'Today'], ['day', 'Last 24 hours'], ['week', 'Last 7 days'], ['all', 'All history']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => preset(k)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-border-subtle bg-surface px-3 h-9 text-body-sm text-ink-muted hover:text-ink">
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="From date">
            <Input type="date" min={minDate} max={maxDate} value={dateStr(win.from)}
                   onChange={(e) => setEdge('from', e.target.value, timeStr(win.from))} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={timeStr(win.from)}
                   onChange={(e) => setEdge('from', dateStr(win.from), e.target.value)} />
          </Field>
          <Field label="To date">
            <Input type="date" min={minDate} max={maxDate} value={dateStr(win.to)}
                   onChange={(e) => setEdge('to', e.target.value, timeStr(win.to))} />
          </Field>
          <Field label="End time">
            <Input type="time" value={timeStr(win.to)}
                   onChange={(e) => setEdge('to', dateStr(win.to), e.target.value)} />
          </Field>
        </div>
        <p className="text-body-sm text-ink-faint -mt-1">
          History starts {dt(limits.min, 'd MMM yyyy, HH:mm')}; dates before that, or after now, can't be chosen.
        </p>

        <Field label="Replay one item" hint="Or click any event in the timeline below">
          <div className="flex gap-2 min-w-0">
            <Select className="flex-1 min-w-0 sm:max-w-xl" value={focus?.id || ''}
                    onChange={(e) => {
                      const id = e.target.value
                      const s = Object.values(subjects).flat().find((x) => x.id === id)
                      chooseFocus(s || null)
                    }}>
              <option value="">All activity in this window</option>
              {Object.entries(subjects).map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              ))}
            </Select>
            {focus && (
              <Button variant="secondary" icon={X} onClick={() => chooseFocus(null)}>Clear</Button>
            )}
          </div>
        </Field>
      </Widget>

      {/* Transport */}
      <Widget bodyClass="p-widget">
        {focus && (
          <p className="mb-3 flex items-center gap-2 text-body-md text-ink">
            <Crosshair size={15} className="text-secondary shrink-0" />
            <span className="truncate">Replaying <strong>{focus.label}</strong></span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="dark" icon={playing ? Pause : Play}
                  onClick={() => { if (!playing && position >= 1) setPosition(0); setPlaying((p) => !p) }}>
            {playing ? 'Pause' : 'Play'}
          </Button>
          <div className="flex">
            <button onClick={() => step(-0.02)} className="btn-secondary rounded-r-none h-10 w-10 p-0" aria-label="Step back">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => step(0.02)} className="btn-secondary rounded-l-none border-l-0 h-10 w-10 p-0" aria-label="Step forward">
              <ChevronRight size={16} />
            </button>
          </div>
          <Select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-auto min-w-[80px]">
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </Select>
          <div className="flex items-center gap-2 ml-auto">
            <Clock size={15} className="text-ink-faint" />
            <span className="font-mono text-mono-data text-ink tabular">
              {currentTime ? dt(currentTime, 'd MMM yyyy, HH:mm') : '—'}
            </span>
          </div>
        </div>

        <div className="relative mt-4">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-surface-sunken pointer-events-none" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-secondary pointer-events-none"
               style={{ width: `${position * 100}%` }} />
          {ticks.map((t, i) => (
            <span key={i} className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-primary/30 pointer-events-none"
                  style={{ left: `${t * 100}%` }} />
          ))}
          <input type="range" min="0" max="1" step="0.001" value={position}
                 onChange={(e) => { setPlaying(false); setPosition(Number(e.target.value)) }}
                 className="relative w-full appearance-none bg-transparent cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                            [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-secondary [&::-webkit-slider-thumb]:border-2
                            [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-level2"
                 aria-label="Scrub through the chosen window" />
        </div>
        <div className="flex justify-between gap-2 text-body-sm text-ink-faint mt-1">
          <span>{dt(win.from, 'd MMM, HH:mm')}</span>
          <span className="text-center">{visibleEvents.length} event{visibleEvents.length === 1 ? '' : 's'} in this window</span>
          <span>{dt(win.to, 'd MMM, HH:mm')}</span>
        </div>
      </Widget>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setFloorId('') }}
                className="w-full sm:w-auto sm:min-w-[200px]">
          {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={floorId} onChange={(e) => setFloorId(e.target.value)} className="w-full sm:w-auto sm:min-w-[140px]">
          {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <div className="w-full lg:w-auto lg:ml-auto">
          <TwinLegend breakdown={stateAt.data?.state_breakdown} />
        </div>
      </div>

      <Widget bodyClass="p-0" className="overflow-hidden">
        {plan.isLoading ? <Spinner label="Loading plan…" />
          : !plan.data?.rooms?.length
            ? <EmptyState icon={History} title="No rooms mapped on this floor" />
            : <FloorPlan rooms={rooms} selectedAssetId={focusAsset} className="h-[440px]" />}
      </Widget>

      <Widget title="Event Timeline"
              subtitle={`${pastEvents.length} event${pastEvents.length === 1 ? '' : 's'} up to this point · click one to replay just that item`}
              bodyClass="p-0">
        {pastEvents.length === 0 ? (
          <p className="text-body-md text-ink-faint text-center py-10">Nothing had happened yet at this point in time.</p>
        ) : (
          <ol className="divide-y divide-border-subtle max-h-96 overflow-y-auto">
            {pastEvents.map((e) => {
              // Clicking an asset change caused by a complaint replays that complaint.
              const target = e.entity_type === 'asset' && e.payload?.issue_id
                ? (Object.values(subjects).flat().find((s) => s.id === e.payload.issue_id) || subjectOf(e))
                : subjectOf(e)
              const active = focus?.id === target.id
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => chooseFocus(active ? null : target)}
                          className={`w-full text-left flex items-start gap-3 px-widget py-2.5 hover:bg-surface-sunken transition-colors ${active ? 'bg-surface-sunken' : ''}`}>
                    <span className="font-mono text-[11px] text-ink-faint w-24 sm:w-28 shrink-0 pt-0.5">
                      {dt(e.occurred_at, 'd MMM HH:mm')}
                    </span>
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: e.payload?.colour || '#94a3b8' }} />
                    <div className="min-w-0">
                      <p className="text-body-md text-ink break-words">
                        {EVENT_LABEL[e.kind] || titleCase(e.kind)}
                        {(e.payload?.name || e.payload?.tag) && (
                          <span className="text-secondary ml-1.5">{e.payload.name || e.payload.tag}</span>
                        )}
                        {e.payload?.reference && (
                          <span className="font-mono text-mono-data text-secondary ml-1.5">{e.payload.reference}</span>
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
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </Widget>
    </div>
  )
}

function Header() {
  return (
    <header>
      <h1 className="text-headline-lg text-ink">Event Replay</h1>
      <p className="text-body-md text-ink-muted mt-1">
        Pick a time window, or one complaint or work order, and watch the campus change exactly as it did.
      </p>
    </header>
  )
}
