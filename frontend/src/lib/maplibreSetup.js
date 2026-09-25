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
