import { useEffect } from 'react'

const SITE_NAME = 'CampusNetra'
export const SITE_URL = 'https://campusnetra.dpdns.org'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function upsertJsonLd(data) {
  const id = 'page-jsonld'
  let el = document.getElementById(id)
  if (!data) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/**
 * Per-route <title>/meta/canonical/JSON-LD for this client-rendered SPA.
 * index.html ships exactly one static set of tags -- the same title,
 * description and canonical (hardcoded to "/") for every single route.
 * Without this, Google has no way to tell any two pages on the site
 * apart, and canonical="/" on every page actively tells it every other
 * page IS the homepage -- a real cause for those pages dropping out of
 * the index entirely rather than just ranking oddly.
 *
 * `path` must be the real route path (leading slash, no origin) so
 * canonical/og:url point at where the page actually lives. `noindex` is
 * for pages with genuinely thin/placeholder content (a "docs coming
 * soon" page, say) -- accessible, just not something worth Google
 * ranking over the real content elsewhere on the site.
 */
export function usePageSEO({ title, description, path, jsonLd, noindex = false }) {
  useEffect(() => {
    // Brand-first, matching index.html's own default -- so the title a
    // crawler sees before this hook's first run (the static tag already in
    // the served HTML) and the one it sees after read the same way, not a
    // jarring flip from "CampusNetra | X" to "X | CampusNetra".
    const fullTitle = title
      ? `${SITE_NAME} | ${title}`
      : `${SITE_NAME} | Smart Campus Facility Management System`

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', `${SITE_URL}${path}`)
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow')
    upsertCanonical(`${SITE_URL}${path}`)
    upsertJsonLd(jsonLd || null)

    // No cleanup on unmount: the next page's own usePageSEO call
    // overwrites every tag synchronously on its own mount, before paint,
    // so there's never a frame with stale tags left visible to a user --
    // only to a crawler reading this exact page's HTML, which is exactly
    // what should be there anyway.
  }, [title, description, path, jsonLd, noindex])
}
