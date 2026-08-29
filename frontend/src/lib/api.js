/**
 * API client with automatic access-token refresh.
 *
 * A single in-flight refresh is shared by every 401'd request, so a burst of
 * parallel calls after expiry produces one refresh, not N.
 */
// In development, use a relative path so Vite proxies to the backend on
// localhost:8000. A hardcoded production URL here means every developer's local
// frontend talks to the deployed API — and writes to the live database.
//
// Production builds keep pointing at the deployed backend, so the existing
// Vercel deployment is unaffected and needs no new environment variable.
// Set VITE_API_BASE_URL to override either.
const BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '/api/v1' : 'https://campusnetra.onrender.com/api/v1')

const STORAGE_KEY = 'cn.auth'

export function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function writeAuth(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private browsing — the session simply won't persist */
  }
}

/**
 * What to show when the server did not give us a sentence worth showing.
 *
 * The server already replaces its own 5xx bodies with a generic message, but a
 * response can still arrive with no body at all — a proxy timeout, a dropped
 * connection, a gateway error that never reached the application. Those must
 * not surface as "Bad Gateway" or an empty string.
 */
const STATUS_MESSAGE = {
  0: 'Cannot reach the server. Check your connection and try again.',
  400: 'That request could not be completed. Please check the details and retry.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with something already saved. Refresh and try again.',
  413: 'That file is too large to upload.',
  422: 'Please correct the highlighted fields.',
  429: 'Too many requests. Please wait a moment and try again.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
}

const SERVER_FAULT =
  'Something went wrong on our end. Please try again in a moment.'

export function friendlyMessage(status, detail) {
  // A 5xx body is never shown verbatim: even when the server means well, the
  // message can be a driver error that leaked through a layer we do not own.
  if (status >= 500) return STATUS_MESSAGE[status] || SERVER_FAULT
  if (detail && typeof detail === 'string') return detail
  return STATUS_MESSAGE[status] || SERVER_FAULT
}

export class ApiError extends Error {
  constructor(status, detail, fields, reference) {
    super(friendlyMessage(status, detail))
    this.name = 'ApiError'
    this.status = status
    /** Always safe to render. */
    this.detail = friendlyMessage(status, detail)
    this.fields = fields || null
    /** Correlates with the server log line, for support requests. */
    this.reference = reference || null
  }
}

let refreshInFlight = null

async function refreshTokens() {
  const auth = readAuth()
  if (!auth?.refresh_token) throw new ApiError(401, 'Session expired')

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(401, 'Session expired')
        const tokens = await res.json()
        writeAuth({ ...auth, ...tokens })
        return tokens.access_token
      })
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

async function parseError(res) {
  let body
  try {
    body = await res.json()
  } catch {
    // No JSON body at all: a proxy or gateway answered, not the application.
    return new ApiError(res.status)
  }
  const detail = typeof body?.detail === 'string' ? body.detail : null
  return new ApiError(res.status, detail, body?.fields, body?.reference)
}

function withParams(url, params) {
  if (!params) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item))
    else qs.append(k, v)
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

/**
 * Multipart upload.
 *
 * Cannot go through request(), which JSON-encodes its body and sets a
 * Content-Type that would break the multipart boundary — but it must not
 * hand-roll its own URL either. The three callers that did were building
 * `/api/v1/...` as a relative path, which the Vite proxy resolves in
 * development and Vercel does not resolve at all in production: the request
 * landed on the SPA's own 404, and parsing that as JSON produced
 * "Unexpected end of JSON input" instead of anything about the upload.
 */
export async function upload(path, formData, { params, signal } = {}) {
  const url = withParams(`${BASE}${path}`, params)

  const send = (token) => fetch(url, {
    method: 'POST',
    // Content-Type is deliberately unset: the browser adds it with the
    // multipart boundary, which we cannot generate ourselves.
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    signal,
  })

  const stored = readAuth()
  let res
  try {
    res = await send(stored?.access_token)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0)
  }

  if (res.status === 401 && stored?.refresh_token) {
    try {
      res = await send(await refreshTokens())
    } catch {
      writeAuth(null)
      throw new ApiError(401, 'Your session has expired. Please sign in again.')
    }
  }

  if (!res.ok) throw await parseError(res)
  try {
    return await res.json()
  } catch {
    throw new ApiError(res.status || 0)
  }
}

export async function request(path, { method = 'GET', body, params, signal, auth = true } = {}) {
  let url = `${BASE}${path}`
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, item))
      else qs.append(k, v)
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const send = async (token) => {
    const headers = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth && token) headers.Authorization = `Bearer ${token}`
    return fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  }

  const stored = readAuth()
  let res
  try {
    res = await send(stored?.access_token)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0)
  }

  // One retry after a silent refresh; a second 401 means the session is truly done.
  if (res.status === 401 && auth && stored?.refresh_token) {
    try {
      const fresh = await refreshTokens()
      res = await send(fresh)
    } catch {
      writeAuth(null)
      if (!location.pathname.startsWith('/login')) {
        location.assign('/login?expired=1')
      }
      throw new ApiError(401, 'Your session has expired. Please sign in again.')
    }
  }

  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (p, opts) => request(p, { ...opts, method: 'GET' }),
  post: (p, body, opts) => request(p, { ...opts, method: 'POST', body }),
  patch: (p, body, opts) => request(p, { ...opts, method: 'PATCH', body }),
  put: (p, body, opts) => request(p, { ...opts, method: 'PUT', body }),
  del: (p, opts) => request(p, { ...opts, method: 'DELETE' }),
}

/**
 * Socket URL for an API path.
 *
 * Derived from BASE rather than location.host: in production the page is served
 * from Vercel, which has no backend to connect to.
 */
function socketUrl(path) {
  if (BASE.startsWith('http')) return `${BASE.replace(/^http/, 'ws')}${path}`
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${BASE}${path}`
}

/**
 * Reconnecting WebSocket with exponential backoff and a heartbeat.
 *
 * `path` is resolved lazily on every attempt, so a socket whose URL embeds a
 * credential picks up a refreshed one when it reconnects instead of retrying
 * forever with a token that has since expired.
 */
function connectSocket(path, { onEvent, onOpen, onClose } = {}) {
  let ws = null
  let closed = false
  let attempt = 0
  let heartbeat = null

  const open = () => {
    if (closed) return
    const resolved = typeof path === 'function' ? path() : path
    if (!resolved) {
      // Nothing to connect with yet (no token). Try again shortly.
      setTimeout(open, 2000)
      return
    }
    ws = new WebSocket(socketUrl(resolved))

    ws.onopen = () => {
      attempt = 0
      onOpen?.()
      heartbeat = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
      }, 25000)
    }
    ws.onmessage = (e) => {
      try {
        onEvent?.(JSON.parse(e.data))
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      clearInterval(heartbeat)
      onClose?.()
      if (closed) return
      attempt += 1
      setTimeout(open, Math.min(1000 * 2 ** attempt, 15000))
    }
    ws.onerror = () => ws?.close()
  }

  open()
  return () => {
    closed = true
    clearInterval(heartbeat)
    ws?.close()
  }
}

/** Live Digital Twin feed for one campus. */
export function connectTwin(campusId, handlers) {
  return connectSocket(`/campus/ws/${campusId}`, handlers)
}

/**
 * Live notification feed for the signed-in user.
 *
 * The token is read on each connection attempt rather than captured once:
 * access tokens are short lived, and a socket that reconnects an hour later
 * must present a current one or it will be refused forever.
 */
export function connectNotifications(handlers) {
  return connectSocket(() => {
    const token = readAuth()?.access_token
    return token ? `/notifications/ws?token=${encodeURIComponent(token)}` : null
  }, handlers)
}
