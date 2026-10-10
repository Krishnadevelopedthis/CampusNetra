import { CapacitorUpdater } from '@capgo/capacitor-updater'

import { isNativeApp, PUBLIC_SITE_URL } from '@/lib/native'

/**
 * Over-the-air updates for the Android app, self-hosted.
 *
 * The app ships its screens inside the APK, so it opens straight from the
 * phone with no download in the way. Each website deploy also publishes the
 * same build as a zip plus a small manifest (scripts/app-bundle.mjs). On every
 * start the app reads the manifest; when it names a newer build, the zip is
 * downloaded in the background and switched in the next time the app is
 * closed and opened. No store, no reinstall.
 */
const MANIFEST_URL = `${PUBLIC_SITE_URL}/app-update.json`
const RECHECK_MS = 30 * 60 * 1000

async function checkForUpdate() {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!res.ok) return
  const { version, url } = await res.json()
  if (!version || !url) return

  const { bundle: current } = await CapacitorUpdater.current()
  if (current?.version === version) return

  const { bundles } = await CapacitorUpdater.list()
  // Keep storage small: drop downloads that are neither running nor the one we want.
  for (const b of bundles) {
    if (b.id !== current?.id && b.version !== version) {
      try { await CapacitorUpdater.delete({ id: b.id }) } catch { /* in use or already gone */ }
    }
  }

  const ready = bundles.find((b) => b.version === version && b.status === 'success')
  const target = ready || await CapacitorUpdater.download({ url, version })
  // Applied when the app next goes to the background or is restarted, never mid-use.
  await CapacitorUpdater.next({ id: target.id })
}

export async function startAppUpdates() {
  if (!isNativeApp()) return
  // Tells the plugin this build started fine; without it a new build is rolled back.
  try { await CapacitorUpdater.notifyAppReady() } catch { /* plugin unavailable */ }

  const run = () => checkForUpdate().catch(() => { /* offline or server busy: try again later */ })
  run()
  window.setInterval(run, RECHECK_MS)
}
