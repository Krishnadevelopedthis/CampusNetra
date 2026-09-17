import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

// OpenFreeMap: free vector tiles, no API key, no billing — MapLibre's own
// recommended free host. "liberty" already ships OSM road/building/land-use
// layers and a 3d-buildings fill-extrusion layer driven by OSM height tags,
// which is exactly the "surrounding context" layer the outdoor view needs;
// CampusNetra's own tracked buildings are added as a separate source/layer
// on top, so the two never get confused with each other.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

const METERS_PER_DEG_LAT = 111_320
const metersPerDegLng = (lat) => METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)

/** A small square footprint centred on a point, in metres, as a GeoJSON
 * polygon — fill-extrusion needs a polygon, and CampusNetra doesn't store
 * real building footprints, only a centre point, so this is the honest
 * approximation: a placeholder volume at the right place and rough size,
 * not a traced outline. */
function squareFootprint(lat, lng, sizeMeters) {
  const dLat = sizeMeters / 2 / METERS_PER_DEG_LAT
  const dLng = sizeMeters / 2 / metersPerDegLng(lat)
  return [[
    [lng - dLng, lat - dLat], [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat], [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ]]
}

function buildingFeatures(buildings, mode, heatByBuilding, heatColour) {
  return buildings
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => {
      const colour = mode === 'heat'
        ? heatColour(heatByBuilding.get(b.id)?.intensity ?? 0)
        : (b.aggregate_colour || '#10b981')
      // ~9m per floor's worth of footprint feels roughly building-sized at
      // campus zoom without measured footprints to go on; height uses the
      // same floor count the indoor view already scales by.
      const size = Math.max(14, Math.sqrt((b.floors_count || 1)) * 11)
      return {
        type: 'Feature',
        id: b.id,
        geometry: { type: 'Polygon', coordinates: squareFootprint(b.latitude, b.longitude, size) },
        properties: {
          id: b.id, name: b.name, code: b.code,
          height: Math.max(3.5, (b.floors_count || 1) * 3.6),
          colour,
        },
      }
    })
}

/** A dashed ring around the campus centre standing in for a boundary —
 * CampusNetra has no traced campus perimeter, only the centre point, so
 * this is a visual "you are roughly here" cue rather than a real edge. */
function boundaryCircle(lat, lng, radiusMeters, points = 64) {
  const coords = Array.from({ length: points + 1 }, (_, i) => {
    const angle = (i / points) * 2 * Math.PI
    return [
      lng + (Math.sin(angle) * radiusMeters) / metersPerDegLng(lat),
      lat + (Math.cos(angle) * radiusMeters) / METERS_PER_DEG_LAT,
    ]
  })
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
}

export function OutdoorCampusMap({
  campus, buildings, mode, heatByBuilding, heatColour, onSelectBuilding, className,
}) {
  const mountRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  // A failed style/tile load used to leave a blank div with no clue why —
  // this surfaces it so "the map doesn't show" becomes an actual message
  // instead of silence.
  const [loadError, setLoadError] = useState(null)

  // Map creation: once per mount, keyed only on the campus centre — not on
  // buildings/mode/heat, for the same reason the indoor Scene3D's camera got
  // its own fix earlier: tearing the whole map down on every data refresh
  // would reset pitch/bearing/zoom out from under anyone mid-drag.
  useEffect(() => {
    if (!mountRef.current || campus?.latitude == null || campus?.longitude == null) return
    setLoadError(null)
    const lat = Number(campus.latitude)
    const lng = Number(campus.longitude)

    const map = new MapLibreMap({
      container: mountRef.current,
      style: STYLE_URL,
      center: [lng, lat],
      zoom: 16.5,
      pitch: 55,
      bearing: -17,
      antialias: true,
      maxPitch: 75,
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    // A blocked/unreachable tile host, an ad-blocker, or the style URL
    // itself failing all surface here rather than as a silently blank
    // canvas — this is the single most common MapLibre integration failure
    // and previously gave no indication anything had gone wrong at all.
    map.on('error', (e) => {
      console.error('OutdoorCampusMap: MapLibre error', e?.error || e)
      setLoadError(
        e?.error?.message ||
        'Could not load the outdoor map. Check your network connection or try again.',
      )
    })

    // The controls above render immediately regardless of whether the style
    // actually finishes loading, so "the map is blank but the zoom buttons
    // are there" is exactly what a hung/blocked tile request looks like —
    // neither 'load' nor 'error' necessarily fires for that (a CORS failure
    // or a request stuck pending both look like silence). This timeout is
    // what turns "nothing happened" into an actual, checkable message.
    const loadTimeout = setTimeout(() => {
      if (!readyRef.current) {
        setLoadError(
          'The map tiles never finished loading (tiles.openfreemap.org may be blocked on ' +
          'this network — check a school/office firewall or ad-blocker, or open the ' +
          'browser console\'s Network tab and look for that host).',
        )
      }
    }, 8000)

    // MapLibre sizes its canvas from the container's dimensions at
    // construction time; if a parent's layout (a Suspense boundary, a flex
    // container that hasn't settled yet) hasn't given it real width/height
    // by then, the canvas can end up 0×0 — invisible, with no error at all.
    // resize() after layout has definitely settled is a cheap defensive fix.
    const resizeTimer = setTimeout(() => map.resize(), 50)

    map.on('load', () => {
      clearTimeout(loadTimeout)
      map.addSource('cn-boundary', {
        type: 'geojson', data: boundaryCircle(lat, lng, 260),
      })
      map.addLayer({
        id: 'cn-boundary-line', type: 'line', source: 'cn-boundary',
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.55 },
      })

      map.addSource('cn-buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: buildingFeatures(buildings, mode, heatByBuilding, heatColour) },
        promoteId: 'id',
      })
      map.addLayer({
        id: 'cn-buildings-fill', type: 'fill-extrusion', source: 'cn-buildings',
        paint: {
          'fill-extrusion-color': ['get', 'colour'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.92,
          'fill-extrusion-base': 0,
        },
      })
      map.addLayer({
        id: 'cn-buildings-outline', type: 'line', source: 'cn-buildings',
        paint: { 'line-color': '#1e293b', 'line-width': 1, 'line-opacity': 0.4 },
      })

      map.on('click', 'cn-buildings-fill', (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id) onSelectBuilding(id)
      })
      map.on('mouseenter', 'cn-buildings-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'cn-buildings-fill', () => { map.getCanvas().style.cursor = '' })

      // Labels above each footprint — a bare 3D block with no name on it
      // isn't identifiable at a glance the way the indoor view's labelled
      // tiles are.
      map.addLayer({
        id: 'cn-buildings-label', type: 'symbol', source: 'cn-buildings',
        layout: {
          'text-field': ['get', 'code'], 'text-size': 13, 'text-anchor': 'center',
          'text-font': ['Noto Sans Bold'],
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      })

      readyRef.current = true
    })

    return () => {
      readyRef.current = false
      clearTimeout(loadTimeout)
      clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
    }
    // Recreating the whole map for a lat/lng change is correct here — that
    // only happens if the campus itself is repointed, which should recentre
    // everything anyway.
  }, [campus?.latitude, campus?.longitude])

  // Data refresh: update the existing source in place so pitch/bearing/zoom
  // the user has set survive a heatmap toggle or a query refetch.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('cn-buildings')
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: buildingFeatures(buildings, mode, heatByBuilding, heatColour),
    })
  }, [buildings, mode, heatByBuilding, heatColour])

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center', padding: '1rem',
          background: 'rgba(241, 245, 249, 0.92)', pointerEvents: 'none',
        }}>
          <p style={{ maxWidth: 360, fontSize: 14, color: '#475569' }}>{loadError}</p>
        </div>
      )}
    </div>
  )
}
