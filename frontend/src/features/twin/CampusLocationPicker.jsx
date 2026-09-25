import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button, Input } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { api } from '@/lib/api'
import '@/lib/maplibreSetup'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
// A reasonable starting view before any search — better than opening on
// the middle of the ocean (lng/lat 0,0) if geolocation isn't available.
const FALLBACK_CENTER = [72.8777, 19.076]

/**
 * Search for a real place, then crop to exactly the area to show — this
 * replaces hand-typing latitude/longitude, which is exactly how a campus
 * ends up centred on the wrong place with no way to tell why. The crop box
 * becomes Campus.map_bounds; every user's outdoor map is restricted to
 * that box, not a fixed radius around a single point.
 */
export function CampusLocationPicker({ initial, onSave, onCancel, saving }) {
  const mountRef = useRef(null)
  const mapRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState(null)
  const [searching, setSearching] = useState(false)
  const [center, setCenter] = useState(
    initial?.latitude != null ? { lat: initial.latitude, lng: initial.longitude } : null,
  )
  // Crop box in fractions (0..1) of the map container — fraction-based so
  // it stays correct if the container is ever resized, rather than pixel
  // coordinates that would drift.
  const [box, setBox] = useState(() => {
    if (initial?.map_bounds) {
      // Existing saved bounds don't translate to a fraction box without
      // knowing the map's current projection, so this only seeds a
      // reasonable-looking default; re-cropping always starts fresh.
      return { x0: 0.15, y0: 0.15, x1: 0.85, y1: 0.85 }
    }
    return { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 }
  })
  const dragRef = useRef(null)

  useEffect(() => {
    if (!mountRef.current) return
    let map
    let ro
    let cancelled = false

    // This mounts inside a Modal, which can still be mid-layout on the
    // very first effect run. Waiting for a real, non-zero container size
    // before constructing the map is cheap insurance against the same
    // class of "canvas sized before its container settled" issue that
    // needed a ResizeObserver below anyway -- not a fix for the actual
    // blank-map bug (that turned out to be the worker setup imported
    // above; see maplibreSetup.js), just good practice to keep alongside
    // it.
    const tryInit = () => {
      if (cancelled) return
      const rect = mountRef.current.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        requestAnimationFrame(tryInit)
        return
      }

      map = new MapLibreMap({
        container: mountRef.current,
        style: STYLE_URL,
        center: center ? [center.lng, center.lat] : FALLBACK_CENTER,
        zoom: center ? 16.5 : 10,
      })
      mapRef.current = map

      // Still watched after construction -- the modal itself can still be
      // resized (window resize, responsive breakpoint) while open, and
      // this keeps the map in sync with that, same as any map embedded in
      // a non-static layout.
      ro = new ResizeObserver(() => map.resize())
      ro.observe(mountRef.current)
    }
    tryInit()

    return () => {
      cancelled = true
      ro?.disconnect()
      map?.remove()
    }
    // Deliberately mount-once: re-centring after a search uses flyTo below
    // instead of recreating the whole map.
  }, [])

  useEffect(() => {
    if (center) mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: 16.5 })
  }, [center])

  // A ref, not state, for the "which search is the latest one" check --
  // bumping it doesn't need a re-render, just needs to be readable inside
  // the async searchFor() closures below once their request comes back.
  const searchSeq = useRef(0)

  const searchFor = async (q) => {
    if (!q.trim()) { setResults([]); setSearchError(null); return }
    const seq = ++searchSeq.current
    setSearching(true)
    setSearchError(null)
    try {
      const r = await api.get('/campus/geocode', { params: { q } })
      // Typing fast can resolve requests out of order -- e.g. "Delhi" then
      // "Delh" (backspace) firing after "Delhi" already returned would
      // otherwise overwrite specific results with broader, stale ones for
      // text nobody's looking at anymore. Only the most recently *sent*
      // request is allowed to still update the list.
      if (seq !== searchSeq.current) return
      setResults(r)
      if (r.length === 0) setSearchError('No matches — try a more specific name or add the city.')
    } catch (err) {
      if (seq !== searchSeq.current) return
      setResults([])
      setSearchError(err.detail || 'Search is temporarily unavailable.')
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  // Live suggestions as you type, the way a real map's search box behaves,
  // instead of making "Search" the only way to see anything -- debounced
  // so a fast typist doesn't fire a request per keystroke (the backend
  // proxies this to Nominatim specifically to keep it inside Nominatim's
  // own usage policy, a per-keystroke flood would defeat that). The
  // button and Enter key below still work too, for an immediate search
  // without waiting out the debounce.
  // useDebounce returns the value directly, not a [value, setter] tuple --
  // array-destructuring it array-destructures the *string* instead (JS
  // strings are iterable), silently taking just its first character, or
  // -- for '' specifically, since an empty string has no first character
  // to give -- undefined. That's what was actually crashing here on
  // mount (debouncedQuery.trim() against undefined while query was still
  // ''), not the debounce logic itself.
  const debouncedQuery = useDebounce(query, 450)
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    searchFor(debouncedQuery)
  }, [debouncedQuery])

  const pick = (r) => {
    setCenter({ lat: r.lat, lng: r.lon })
    setQuery(r.display_name)
    setResults([])
  }

  const onHandleDown = (corner) => (e) => {
    e.preventDefault()
    const rect = e.currentTarget.closest('[data-picker-container]').getBoundingClientRect()
    dragRef.current = { corner, rect }
    window.addEventListener('pointermove', onHandleMove)
    window.addEventListener('pointerup', onHandleUp)
  }
  const onHandleMove = (e) => {
    if (!dragRef.current) return
    const { corner, rect } = dragRef.current
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setBox((b) => ({
      x0: corner === 'tl' || corner === 'bl' ? fx : b.x0,
      x1: corner === 'tr' || corner === 'br' ? fx : b.x1,
      y0: corner === 'tl' || corner === 'tr' ? fy : b.y0,
      y1: corner === 'bl' || corner === 'br' ? fy : b.y1,
    }))
  }
  const onHandleUp = () => {
    dragRef.current = null
    window.removeEventListener('pointermove', onHandleMove)
    window.removeEventListener('pointerup', onHandleUp)
  }
  useEffect(() => () => {
    window.removeEventListener('pointermove', onHandleMove)
    window.removeEventListener('pointerup', onHandleUp)
  }, [])

  const handleSave = () => {
    const map = mapRef.current
    if (!map || !center) return
    const rect = mountRef.current.getBoundingClientRect()
    const a = map.unproject([box.x0 * rect.width, box.y0 * rect.height])
    const b = map.unproject([box.x1 * rect.width, box.y1 * rect.height])
    onSave({
      latitude: center.lat,
      longitude: center.lng,
      map_bounds: {
        south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat),
        west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng),
      },
    })
  }

  return (
    <div className="space-y-3">
      {/* Suggestions float over whatever's below (the map), the way a real
          map's search box behaves, instead of pushing the map down every
          time the list appears/disappears -- relative wrapper + absolute
          dropdown, positioned so it doesn't get clipped by the map's own
          overflow-hidden container beneath it. */}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            placeholder="Search for your campus by name…" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchFor(query) } }}
          />
          <Button variant="secondary" icon={Search} loading={searching} onClick={() => searchFor(query)}>
            Search
          </Button>
        </div>
        {searchError && <p className="text-body-sm text-danger-text mt-1.5">{searchError}</p>}
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-10 bg-surface border border-border-subtle rounded-lg shadow-popover divide-y divide-border-subtle max-h-52 overflow-auto">
            {results.map((r, i) => (
              <button
                key={i} type="button" onClick={() => pick(r)}
                className="block w-full text-left px-3 py-2 text-body-sm hover:bg-surface-sunken"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        data-picker-container
        className="relative rounded-xl overflow-hidden border border-border-subtle"
        style={{ height: 360 }}
      >
        {/* Inline style, not the `absolute inset-0` utility classes: MapLibre
            adds its own `maplibregl-map` class to this exact element and
            ships a stylesheet (imported above) that sets `.maplibregl-map
            { position: relative }` -- same specificity as Tailwind's
            `.absolute`, so whichever stylesheet lands later in the bundle
            wins, and it was winning. With position stuck at `relative`,
            `inset-0` did nothing, so this div (and the canvas inside it)
            collapsed to 0 height, and MapLibre fell back to sizing its
            canvas from whatever stale/partial measurement it had -- a
            reproduced, real 300px-tall canvas inside a 360px container.
            An inline style beats any external stylesheet regardless of
            load order, so this wins unconditionally. */}
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
        {!center && (
          // Used to be a near-opaque backdrop covering the whole map area,
          // which hid the actual (already-loading) map underneath entirely
          // -- there was nothing wrong with the map itself, this box just
          // sat in front of it. A small floating hint instead of a full
          // cover lets the map's own default view stay visible and
          // pannable/zoomable while still telling you to search.
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <p className="text-body-sm text-ink bg-surface/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-level2 border border-border-subtle text-center">
              Search for your campus above, or pan/zoom to find it
            </p>
          </div>
        )}
        {center && (
          <>
            <div
              className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`,
                width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%`,
              }}
            />
            {[['tl', box.x0, box.y0], ['tr', box.x1, box.y0], ['bl', box.x0, box.y1], ['br', box.x1, box.y1]]
              .map(([corner, x, y]) => (
                <div
                  key={corner} onPointerDown={onHandleDown(corner)}
                  className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-blue-600 border-2 border-white
                             shadow-level2 cursor-grab active:cursor-grabbing touch-none"
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                />
              ))}
          </>
        )}
      </div>
      {center && (
        <p className="text-body-sm text-ink-faint">
          Drag the blue corners to crop to exactly your campus's own area — this is what every
          user sees on the Campus Map page, nothing wider.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button loading={saving} disabled={!center} onClick={handleSave}>Save</Button>
      </div>
    </div>
  )
}
