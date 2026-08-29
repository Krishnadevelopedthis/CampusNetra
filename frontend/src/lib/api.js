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

export class ApiError extends Error {
  constructor(status, detail, fields) {
    super(detail || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.fields = fields || null
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
    return new ApiError(res.status, res.statusText)
  }
  return new ApiError(res.status, body.detail, body.fields)
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
  let res = await send(stored?.access_token)

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

/** Live Digital Twin socket. Reconnects with backoff. */
export function connectTwin(campusId, { onEvent, onOpen, onClose } = {}) {
  let ws = null
  let closed = false
  let attempt = 0
  let heartbeat = null

  const open = () => {
    if (closed) return
    // Derive the socket URL from BASE rather than location.host: in production
    // the page is served from Vercel, which has no backend to connect to.
    let wsUrl
    if (BASE.startsWith('http')) {
      wsUrl = `${BASE.replace(/^http/, 'ws')}/campus/ws/${campusId}`
    } else {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      wsUrl = `${proto}://${location.host}${BASE}/campus/ws/${campusId}`
    }
    ws = new WebSocket(wsUrl)

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
