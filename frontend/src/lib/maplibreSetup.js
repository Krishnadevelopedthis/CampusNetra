import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * MapLibre GL v6 ships as ES modules only and no longer bundles a working
 * default worker for you. Without this, the Map constructor still succeeds
 * and the style/sprite (both main-thread fetches) load fine, but the
 * worker that actually parses vector tile data fails silently on its
 * first import in a bundled production build -- no console error, no
 * 'error' event, just isSourceLoaded stuck at false forever and zero
 * .pbf tile requests ever sent. That's a confirmed, reproduced bug here,
 * not a hypothetical: background/sprite rendered, vector data never did,
 * on both a local production build and the real deployed site.
 *
 * `?worker&url` (not plain `?url`) routes the worker file through Vite's
 * own worker bundling pipeline, which inlines the worker's sibling
 * chunk (maplibre-gl-shared.mjs) into one self-contained file -- a plain
 * `?url` import emits the dist worker file verbatim, which imports that
 * sibling by a relative path that doesn't exist once Vite has moved/
 * renamed everything else, and the worker fails on that import.
 *
 * Side-effecting module: import this once for its effect (`import
 * '@/lib/maplibreSetup'`) before constructing any maplibre-gl Map.
 */
setWorkerUrl(workerUrl)

/**
 * The free "liberty" basemap (OpenFreeMap) is a third-party style, and two
 * of its quirks flood the console on every page with a map:
 *  - its POI layers ask for icons (office, gate, atm…) its sprite sheet does
 *    not always carry. MapLibre v6 logs a warning for each one unless a
 *    resolver supplies something, so a blank 1×1 image is supplied: the POI
 *    label still shows, just without an icon.
 *  - its US highway-shield layers use a filter that evaluates to null on
 *    these tiles ("Expected value to be of type number"). There are no US
 *    highway shields to draw on an Indian campus, so those layers are dropped.
 *
 * Pass the style through `withQuietBasemap(map, style)` instead of the Map's
 * `style` option.
 */
const BLANK = { width: 1, height: 1, data: new Uint8Array(4) }

export function withQuietBasemap(map, style) {
  map.setMissingStyleImageResolver((id) => {
    if (!map.hasImage(id)) map.addImage(id, BLANK, { pixelRatio: 1 })
  })
  map.setStyle(style, {
    transformStyle: (_previous, next) => ({
      ...next,
      layers: (next.layers || []).filter((layer) => !/shield/i.test(layer.id)),
    }),
  })
  return map
}
