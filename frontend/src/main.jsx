import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { initTheme } from './lib/theme'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

initTheme()

// Every route is lazy-loaded (see App.jsx), fetching a content-hashed chunk
// (e.g. Profile-D_EMcCLr.js) on first visit to that page. A deploy replaces
// those files with new hashes; a tab left open across a deploy still holds
// the *old* hashes and 404s trying to fetch one, and since the failure
// happens outside React's render cycle, the nearest ErrorBoundary can't
// catch it -- the page just goes blank. Vite dispatches this event for
// exactly that case; reloading picks up the current build's real filenames.
// Guarded by sessionStorage against looping if the reload itself 404s again
// for some unrelated reason (e.g. offline) -- one automatic retry, not many.
const STALE_CHUNK_KEY = 'cn.reloadedForStaleChunk'
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(STALE_CHUNK_KEY)) return
  sessionStorage.setItem(STALE_CHUNK_KEY, '1')
  window.location.reload()
})
// The reload above proves this build's own chunks are fetchable, so the
// guard has done its job -- clear it once the app's had a few seconds to
// settle, rather than leaving it permanently set for the rest of this tab's
// sessionStorage lifetime. Otherwise a *second*, later deploy during the
// same long-lived tab would silently fail to auto-recover the next time.
window.setTimeout(() => sessionStorage.removeItem(STALE_CHUNK_KEY), 5000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
