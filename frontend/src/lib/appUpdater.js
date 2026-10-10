import { CapacitorUpdater } from '@capgo/capacitor-updater'

import { isNativeApp, PUBLIC_SITE_URL } from '@/lib/native'

/**
 * Over-the-air updates for the Android app, self-hosted.
 *
 * The app ships its screens inside the APK, so it opens straight from the
 * phone with no download in the way. Each website deploy also publishes the
 * same build as a zip plus a small manifest (scripts/app-bundle.mjs). On start
 * and whenever the app comes back to the screen, it reads the manifest; when it
 * names a newer build, the zip is downloaded in the background and switched in
 * the next time the app is closed or sent to the background. No store, no
 * reinstall.
 */
const MANIFEST_URL = `${PUBLIC_SITE_URL}/app-update.json`
const RECHECK_MS = 30 * 60 * 1000
const RESUME_GAP_MS = 2 * 60 * 1000

let running = null
let lastCheck = 0

async function checkForUpdate() {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!res.ok) return
  const { version, url, checksum } = await res.json()
  // The plugin refuses a download without the zip's SHA-256.
  if (!version || !url || !checksum) return

  const { bundle: current } = await CapacitorUpdater.current()
  if (current?.version === version) return

  const { bundles } = await CapacitorUpdater.list()
  const ready = bundles.find((b) => b.version === version && b.status === 'success')
  // Keep storage small and clear out half-finished or failed attempts, so a
  // download cut off by a lost connection is simply tried again.
  for (const b of bundles) {
    if (b.id !== current?.id && b.id !== ready?.id) {
      try { await CapacitorUpdater.delete({ id: b.id }) } catch { /* in use or already gone */ }
    }
  }

  const target = ready || await CapacitorUpdater.download({ url, version, checksum })
  // Applied when the app next goes to the background or is restarted, never mid-use.
  await CapacitorUpdater.next({ id: target.id })
}

function run() {
  if (running) return running
  lastCheck = Date.now()
  running = checkForUpdate()
    .catch(() => { /* offline or server busy: try again later */ })
    .finally(() => { running = null })
  return running
}

/** The build the app is running: 'builtin' for the one inside the APK. */
export async function currentAppVersion() {
  if (!isNativeApp()) return null
  try {
    const { bundle } = await CapacitorUpdater.current()
    return bundle?.version || 'builtin'
  } catch {
    return null
  }
}

export async function startAppUpdates() {
  if (!isNativeApp()) return
  // Tells the plugin this build started fine; without it a new build is rolled back.
  try { await CapacitorUpdater.notifyAppReady() } catch { /* plugin unavailable */ }

  run()
  window.setInterval(run, RECHECK_MS)
  // Most people reopen the app from recents rather than cold-starting it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > RESUME_GAP_MS) run()
  })
}
