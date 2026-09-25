import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { queryClient } from './lib/queryClient'
import { initTheme } from './lib/theme'
import './styles/index.css'

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
function recoverFromStaleAsset() {
  if (sessionStorage.getItem(STALE_CHUNK_KEY)) return
  sessionStorage.setItem(STALE_CHUNK_KEY, '1')
  window.location.reload()
}
window.addEventListener('vite:preloadError', recoverFromStaleAsset)

// The same stale-build problem, but for the CSS bundle instead of a JS
// chunk: index.html is the one HTML page a host can cache separately from
// (and longer than) the hashed asset files a deploy replaces, so a tab
// that loaded index.html just before a deploy can end up with a page
// referencing a CSS filename that no longer exists -- a 404 the browser
// never turns into a catchable exception on its own (unlike a JS module
// import, a failed <link rel="stylesheet"> doesn't reject a promise or
// throw), so the app was left permanently unstyled with no recovery path
// short of the user manually hard-refreshing. Stylesheet/script/img load
// failures fire a plain `error` Event, not an ErrorEvent, and they don't
// bubble -- only the capture phase at window sees them -- so this can't
// reuse a bubbling window.onerror listener the way a script exception
// could.
window.addEventListener('error', (event) => {
  const target = event.target
  if (target instanceof HTMLLinkElement && target.rel === 'stylesheet') {
    recoverFromStaleAsset()
  }
}, true)
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
