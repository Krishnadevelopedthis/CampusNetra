// Writes a real HTML file for every public marketing page after `vite build`,
// so search engines get each page's text, title, description, canonical URL
// and structured data without running JavaScript. React still renders the
// page as usual in the browser.
//
//   dist/index.html            -> prerendered homepage
//   dist/<route>/index.html    -> each other public page
//   dist/app.html              -> the empty app shell, used for every app route
//                                 (vercel.json rewrites to it)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')
const SITE_URL = 'https://campusnetra.dpdns.org'

const ROUTES = [
  '/', '/features', '/pricing', '/about', '/security', '/support', '/privacy', '/terms',
  '/docs', '/community',
  '/solutions/universities', '/solutions/colleges', '/solutions/research', '/solutions/managers',
]

// Site-wide structured data, added to every page alongside its own.
const SITE_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CampusNetra',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-dark.svg`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CampusNetra',
    url: SITE_URL,
  },
]

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function setMeta(html, attr, key, value) {
  if (!value) return html
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`)
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

function applyHead(template, seo, route) {
  let html = template
  const url = `${SITE_URL}${route === '/' ? '/' : route}`
  if (seo?.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`)
  html = setMeta(html, 'name', 'description', seo?.description)
  html = setMeta(html, 'property', 'og:title', seo?.title)
  html = setMeta(html, 'property', 'og:description', seo?.description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'name', 'twitter:title', seo?.title)
  html = setMeta(html, 'name', 'twitter:description', seo?.description)
  html = setMeta(html, 'name', 'robots', seo?.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large')
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)

  const ld = [...SITE_JSONLD, ...(seo?.jsonLd ? [].concat(seo.jsonLd) : [])]
  const ldTags = ld
    .map((d) => `    <script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`)
    .join('\n')
  return html.replace('</head>', `${ldTags}\n  </head>`)
}

const template = readFileSync(join(dist, 'index.html'), 'utf8')
if (!template.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html has no empty #root; was it already prerendered?')
}

// Keep the untouched shell for app routes before index.html is replaced.
writeFileSync(join(dist, 'app.html'), template)

// Some app modules read browser globals as soon as they load (theme store,
// auth storage). Minimal stand-ins let them load in Node; nothing here is
// used for the page content itself.
function installBrowserStubs() {
  const noop = () => {}
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
  const element = () => ({
    dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  })
  const documentElement = element()
  const doc = {
    documentElement, head: element(), body: element(),
    createElement: element, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    cookie: '', title: '', visibilityState: 'visible', hidden: false,
  }
  const win = {
    document: doc, localStorage: storage, sessionStorage: storage,
    location: { href: SITE_URL + '/', origin: SITE_URL, pathname: '/', search: '', hash: '', host: 'campusnetra.dpdns.org' },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
    scrollTo: noop, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  }
  win.window = win
  for (const [k, v] of Object.entries(win)) {
    if (!(k in globalThis)) globalThis[k] = v
  }
  globalThis.window = win
  globalThis.document = doc
}
installBrowserStubs()

// useLayoutEffect can't run during a server render (it still runs in the
// browser); React warns once per component, which only buries real errors.
const consoleError = console.error
console.error = (msg, ...rest) => {
  if (typeof msg === 'string' && msg.includes('useLayoutEffect does nothing on the server')) return
  consoleError(msg, ...rest)
}

const entry = pathToFileURL(join(ssrDir, 'entry-prerender.js')).href
const { render } = await import(entry)

let ok = 0
for (const route of ROUTES) {
  try {
    const { html, seo } = await render(route)
    const page = applyHead(template, seo, route)
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
    const out = route === '/' ? join(dist, 'index.html') : join(dist, route.slice(1), 'index.html')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, page)
    const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
    console.log(`prerendered ${route.padEnd(26)} ${String(words).padStart(5)} words  ${seo?.title ?? '(no title set)'}`)
    ok++
  } catch (err) {
    // A page that can't render on the server keeps working as a normal SPA
    // page; it just doesn't get static HTML.
    console.warn(`prerender skipped ${route}: ${err?.message ?? err}`)
  }
}

if (existsSync(ssrDir)) rmSync(ssrDir, { recursive: true, force: true })
console.log(`prerendered ${ok}/${ROUTES.length} public pages`)
