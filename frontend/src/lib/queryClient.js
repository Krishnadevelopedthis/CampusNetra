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
