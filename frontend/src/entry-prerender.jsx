// Build-time renderer for the public marketing pages (see
// scripts/prerender.mjs). Renders a route to HTML the same way the app does,
// waiting for lazily loaded sections, and returns the SEO tags the page set.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ssrSeo } from '@/hooks/usePageSEO'
import LandingPage from '@/pages/LandingPage'
import About from '@/pages/marketing/About'
import Community from '@/pages/marketing/Community'
import Docs from '@/pages/marketing/Docs'
import MarketingFeatures from '@/pages/marketing/Features'
import Pricing from '@/pages/marketing/Pricing'
import Privacy from '@/pages/marketing/Privacy'
import Security from '@/pages/marketing/Security'
import Solutions from '@/pages/marketing/Solutions'
import Support from '@/pages/marketing/Support'
import Terms from '@/pages/marketing/Terms'

function Pages() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<About />} />
      <Route path="/features" element={<MarketingFeatures />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/security" element={<Security />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/community" element={<Community />} />
      <Route path="/support" element={<Support />} />
      <Route path="/solutions/:audience" element={<Solutions />} />
    </Routes>
  )
}

export function render(url) {
  ssrSeo.current = null
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({
      write(chunk, _enc, done) { html += chunk.toString(); done() },
      final(done) { resolve({ html, seo: ssrSeo.current }); done() },
    })
    const { pipe } = renderToPipeableStream(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <Pages />
        </MemoryRouter>
      </QueryClientProvider>,
      {
        onAllReady() { pipe(sink) },
        onShellError: reject,
        onError(err) { reject(err) },
      },
    )
  })
}
