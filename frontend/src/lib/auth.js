import { create } from 'zustand'
import { api, readAuth, writeAuth } from './api'
import { useColorTheme } from './colorTheme'

/**
 * Session timeout
 *
 * Inactivity-based auto-logout lives in lib/sessionTimeout.js and is wired
 * up in App.jsx (started while `user` is present, stopped on logout). This
 * module stays focused on authentication itself — login/logout/token
 * storage/current-user state — and calls logout() below when the inactivity
 * monitor decides the session should end.
 */

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
  admin: 'rgb(var(--c-primary))',
  super_admin: 'rgb(var(--c-primary))',
}

const STAFF = new Set([
  'technician',
  'facility_manager',
  'admin',
  'super_admin',
])

const MANAGER = new Set([
  'facility_manager',
  'admin',
  'super_admin',
])

const ADMIN = new Set([
  'admin',
  'super_admin',
])

export const useAuth = create((set, get) => ({
  user: readAuth()?.user || null,
  loading: false,
  initialised: false,

  isStaff: () => STAFF.has(get().user?.role),

  isManager: () => MANAGER.has(get().user?.role),

  isAdmin: () => ADMIN.has(get().user?.role),

  /**
   * Revalidate the stored session against the server on boot.
   *
   * Important:
   * - A valid stored token is checked using /auth/me.
   * - 401/403 means the server rejected the session, so the
   *   local authentication state is cleared.
   * - Network/server failures do NOT immediately destroy the
   *   locally stored authentication state.
   */
  async init() {
    const stored = readAuth()

    if (!stored?.access_token) {
      set({
        initialised: true,
        user: null,
      })
      return
    }

    try {
      const user = await api.get('/auth/me')

      /**
       * Refresh the locally stored user object using the
       * authoritative server response.
       *
       * Existing tokens are preserved.
       */
      writeAuth({
        ...stored,
        user,
      })

      /**
       * Load authenticated user's appearance preferences.
       *
       * This ensures the user's saved theme is restored after
       * application startup/login.
       */
      if (user?.preferences?.appearance) {
        useColorTheme
          .getState()
          .loadFromUserPreferences(user.preferences)
      }

      set({
        user,
        initialised: true,
      })
    } catch (err) {
      /**
       * Only an explicit authentication/authorization rejection
       * should remove the local authentication state.
       */
      if (err?.status === 401 || err?.status === 403) {
        writeAuth(null)

        set({
          user: null,
          initialised: true,
        })

        return
      }

      /**
       * Network failure / temporary backend failure:
       *
       * Do NOT destroy the locally stored authentication state.
       *
       * This is particularly important with free-tier hosting,
       * where a sleeping backend can make the first request
       * temporarily fail or take longer.
       */
      set({
        user: stored.user ?? null,
        initialised: true,
      })
    }
  },

  /**
   * Login user.
   */
  async login(email, password, role, captcha) {
    set({ loading: true })

    try {
      const data = await api.post('/auth/login', {
        email,
        password,
        role: role || null,
        // The server requires both, and rejects the request outright without
        // them — see features/auth/useCaptcha.js for where they come from.
        captcha_token: captcha?.token || '',
        captcha_answer: captcha?.answer || '',
      })

      /**
       * Store only the authentication response already provided
       * by the backend.
       *
       * No additional user/admin information is created here.
       */
      writeAuth({
        ...data.tokens,
        user: data.user,
      })

      /**
       * Load authenticated user's appearance preferences from
       * the server.
       *
       * This ensures the current user's saved theme is restored
       * instead of retaining another user's UI preference.
       */
      if (data.user?.preferences?.appearance) {
        useColorTheme
          .getState()
          .loadFromUserPreferences(data.user.preferences)
      }

      set({
        user: data.user,
      })

      return data.user
    } finally {
      set({ loading: false })
    }
  },

  /**
   * Register a new user.
   */
  async register(payload) {
    set({ loading: true })

    try {
      return await api.post('/auth/register', payload)
    } finally {
      set({ loading: false })
    }
  },

  /**
   * Verify email and establish the authenticated session.
   */
  async verifyEmail(email, code) {
    const data = await api.post('/auth/verify-email', {
      email,
      code,
    })

    writeAuth({
      ...data.tokens,
      user: data.user,
    })

    /**
     * Restore the verified user's appearance preferences.
     */
    if (data.user?.preferences?.appearance) {
      useColorTheme
        .getState()
        .loadFromUserPreferences(data.user.preferences)
    }

    set({
      user: data.user,
    })

    return data.user
  },

  /**
   * Logout.
   *
   * Server logout is attempted first.
   * Local authentication is always cleared afterwards.
   *
   * Appearance preferences are intentionally NOT cleared.
   */
  async logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      /**
       * Local logout is more important than the server round trip.
       *
       * If the backend is unavailable, the browser still removes
       * the local authentication state.
       */
    }

    /**
     * IMPORTANT:
     * Do NOT clear appearance preferences on logout.
     *
     * Logout only clears authentication/session state.
     * The user's saved appearance preferences remain available
     * for restoration after the next login.
     */
    writeAuth(null)

    set({
      user: null,
      loading: false,
    })
  },

  /**
   * Update the currently authenticated user in local state.
   *
   * Existing authentication tokens are preserved.
   */
  setUser(user) {
    const stored = readAuth()

    if (stored) {
      writeAuth({
        ...stored,
        user,
      })
    }

    set({ user })
  },
}))
