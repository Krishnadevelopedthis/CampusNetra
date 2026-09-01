import { create } from 'zustand'
import { api, readAuth, writeAuth } from './api'
import { useColorTheme } from './colorTheme'

/** Which modules each role may reach. Mirrors the backend's route guards. */
export const ROLE_HOME = {
  student: '/dashboard',
  teacher: '/dashboard',
  technician: '/technician',
  facility_manager: '/facility',
  admin: '/admin',
  super_admin: '/admin',
}

export const ROLE_LABEL = {
  student: 'Student',
  teacher: 'Teacher',
  technician: 'Technician',
  facility_manager: 'Facility Manager',
  admin: 'Administrator',
  super_admin: 'Super Admin',
}

/** Accent line at the top of the sidebar, per the design spec. */
export const ROLE_ACCENT = {
  student: '#3b82f6',
  teacher: '#8b5cf6',
  technician: '#f59e0b',
  facility_manager: '#10b981',
  admin: '#1e1b4b',
  super_admin: '#1e1b4b',
}

const STAFF = new Set(['technician', 'facility_manager', 'admin', 'super_admin'])
const MANAGER = new Set(['facility_manager', 'admin', 'super_admin'])
const ADMIN = new Set(['admin', 'super_admin'])

export const useAuth = create((set, get) => ({
  user: readAuth()?.user || null,
  loading: false,
  initialised: false,

  isStaff: () => STAFF.has(get().user?.role),
  isManager: () => MANAGER.has(get().user?.role),
  isAdmin: () => ADMIN.has(get().user?.role),

  /** Revalidate the stored session against the server on boot. */
  async init() {
    const stored = readAuth()
    if (!stored?.access_token) {
      set({ initialised: true })
      return
    }
    try {
      const user = await api.get('/auth/me')
      writeAuth({ ...stored, user })
      set({ user, initialised: true })
    } catch (err) {
      // Only the server rejecting the session ends it. A network failure or a
      // server error means we could not find out — and a sleeping free-tier
      // instance makes the first request after a quiet spell routinely time
      // out. Clearing the session on that signs people out for coming back
      // later, which is what "your session expired" was really reporting.
      if (err?.status === 401 || err?.status === 403) {
        writeAuth(null)
        set({ user: null, initialised: true })
        return
      }
      // Carry on with whoever was stored; the next successful call corrects it,
      // and a genuinely dead session is caught by the request that needs it.
      set({ user: stored.user ?? null, initialised: true })
    }
  },

  async login(email, password, role) {
    set({ loading: true })
    try {
      const data = await api.post('/auth/login', { email, password, role: role || null })
      writeAuth({ ...data.tokens, user: data.user })
      // Preserve user's color theme choice - it's stored in localStorage and will be auto-loaded
      set({ user: data.user })
      return data.user
    } finally {
      set({ loading: false })
    }
  },

  async register(payload) {
    set({ loading: true })
    try {
      return await api.post('/auth/register', payload)
    } finally {
      set({ loading: false })
    }
  },

  async verifyEmail(email, code) {
    const data = await api.post('/auth/verify-email', { email, code })
    writeAuth({ ...data.tokens, user: data.user })
    set({ user: data.user })
    return data.user
  },

  async logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      /* signing out locally matters more than the server round trip */
    }
    // Preserve user's color theme choice across logout/login cycles
    // The color is tied to user preference, not session
    writeAuth(null)
    set({ user: null })
  },

  setUser(user) {
    const stored = readAuth()
    if (stored) writeAuth({ ...stored, user })
    set({ user })
  },
}))