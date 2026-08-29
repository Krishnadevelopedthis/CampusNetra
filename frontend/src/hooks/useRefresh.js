import { useCallback, useState } from 'react'

/**
 * Drives an explicit refresh.
 *
 * React Query refetches in the background and keeps the previous data on
 * screen, which is right for automatic refreshes and wrong for one the user
 * asked for: pressing a button and seeing nothing at all move reads as a
 * broken button. This tracks user-initiated refreshes separately from
 * `isFetching`, so a page can show its skeletons for those and stay still for
 * everything else.
 *
 * The floor is deliberate. A refetch that resolves from cache in 20ms produces
 * a flicker that looks like a glitch rather than a reload, so the state is held
 * long enough to read as an intentional refresh.
 */
const FLOOR_MS = 420

export function useRefresh(...refetchers) {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const started = Date.now()
    try {
      await Promise.all(
        refetchers
          .filter(Boolean)
          .map((fn) => Promise.resolve(typeof fn === 'function' ? fn() : fn?.refetch?.())),
      )
    } catch {
      // The queries surface their own errors; this only drives the animation.
    } finally {
      const remaining = FLOOR_MS - (Date.now() - started)
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
      setRefreshing(false)
    }
  }, refetchers) // eslint-disable-line react-hooks/exhaustive-deps

  return { refresh, refreshing }
}
