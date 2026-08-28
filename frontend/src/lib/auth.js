import { create } from 'zustand'
import { api, readAuth, writeAuth } from './api'

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
    } catch {
      writeAuth(null)
      set({ user: null, initialised: true })
    }
  },

  async login(email, password, role) {
    set({ loading: true })
    try {
      const data = await api.post('/auth/login', { email, password, role: role || null })
      writeAuth({ ...data.tokens, user: data.user })
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
    writeAuth(null)
    set({ user: null })
  },

  setUser(user) {
    const stored = readAuth()
    if (stored) writeAuth({ ...stored, user })
    set({ user })
  },
}))
