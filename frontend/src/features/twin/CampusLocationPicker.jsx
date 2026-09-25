import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button, Input } from '@/components/ui'
import { api } from '@/lib/api'

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
    const map = new MapLibreMap({
      container: mountRef.current,
      style: STYLE_URL,
      center: center ? [center.lng, center.lat] : FALLBACK_CENTER,
      zoom: center ? 16.5 : 10,
    })
    mapRef.current = map

    // This mounts inside a Modal, and MapLibre measures its container once
    // at construction. A single requestAnimationFrame resize wasn't
    // enough -- the canvas still came out shorter than the container (a
    // real, reproduced 300px canvas inside a 360px box) -- so rather than
    // guess when the modal's own layout has actually settled, watch the
    // container directly and resize every time its real size changes.
    // This is the standard MapLibre/Mapbox GL pattern for a map inside
    // anything that isn't full-page-and-static (modals, tabs, accordions).
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(mountRef.current)

    return () => {
      ro.disconnect()
      map.remove()
    }
    // Deliberately mount-once: re-centring after a search uses flyTo below
    // instead of recreating the whole map.
  }, [])

  useEffect(() => {
    if (center) mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: 16.5 })
  }, [center])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const r = await api.get('/campus/geocode', { params: { q: query } })
      setResults(r)
      if (r.length === 0) setSearchError('No matches — try a more specific name or add the city.')
    } catch (err) {
      setResults([])
      setSearchError(err.detail || 'Search is temporarily unavailable.')
    } finally {
      setSearching(false)
    }
  }

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
      <div className="flex gap-2">
        <Input
          placeholder="Search for your campus by name…" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
        />
        <Button variant="secondary" icon={Search} loading={searching} onClick={search}>
          Search
        </Button>
      </div>
      {searchError && <p className="text-body-sm text-danger-text">{searchError}</p>}
      {results.length > 0 && (
        <div className="border border-border-subtle rounded-lg divide-y divide-border-subtle max-h-40 overflow-auto">
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
