import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'

/**
 * The one QueryClient instance for the app. Lives in its own module (not
 * main.jsx) so lib/auth.js can import it to clear cached queries on
 * logout without an import cycle through main.jsx -> App.jsx -> ... ->
 * auth.js -> main.jsx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

/*
 * The last data each screen showed is kept on the device, so the dashboard,
 * lists and notifications appear the moment the app opens and are refreshed
 * in the background, instead of waiting on the server every time. Cleared on
 * sign-out (lib/auth.js) so one account never sees another's data.
 */
export const PERSIST_KEY = 'cn.query-cache'
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000

// Not worth keeping: one-time or fast-changing data, and large chart series.
const NOT_PERSISTED = new Set(['captcha', 'device-history', 'qr-asset-detail', 'health-asset'])

export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: PERSIST_KEY,
  throttleTime: 2000,
})

export const persistOptions = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && !NOT_PERSISTED.has(String(q.queryKey?.[0])),
  },
}

/** Forget everything saved on this device (sign-out, rejected session). */
export function clearPersistedQueries() {
  queryClient.clear()
  try { window.localStorage.removeItem(PERSIST_KEY) } catch { /* storage blocked */ }
}

// React Query's cache is per-tab by design -- an invalidateQueries() call in
// one open tab has no way to reach another tab's own QueryClient instance.
// That gap is exactly how the same complaint/work order/asset can end up
// showing two different "current" states in two open tabs: one tab resolves
// it and correctly invalidates its own cache, the other tab never finds out
// and keeps rendering what it had, indefinitely (confirmed via a real
// cross-tab test during a state-consistency audit of this app -- every
// individual invalidateQueries() call site was already correct for its own
// tab; nothing was wrong with any of them specifically).
//
// Wrapping invalidateQueries itself (rather than editing each of the ~15
// call sites that already call it correctly) means every existing and
// future invalidation is mirrored automatically, with no risk of a new
// status-changing mutation being added later and forgetting to also handle
// the cross-tab case. `applyingRemote` stops a message this tab receives
// from being re-broadcast back out, which would otherwise ping-pong forever
// between two open tabs.
if (typeof BroadcastChannel !== 'undefined') {
  const channel = new BroadcastChannel('cn-query-invalidate')
  let applyingRemote = false

  const originalInvalidate = queryClient.invalidateQueries.bind(queryClient)
  queryClient.invalidateQueries = (filters, options) => {
    if (!applyingRemote && filters?.queryKey) {
      channel.postMessage({ queryKey: filters.queryKey, exact: filters.exact })
    }
    return originalInvalidate(filters, options)
  }

  channel.addEventListener('message', (event) => {
    if (!event.data?.queryKey) return
    applyingRemote = true
    try {
      originalInvalidate({ queryKey: event.data.queryKey, exact: event.data.exact })
    } finally {
      applyingRemote = false
    }
  })
}
