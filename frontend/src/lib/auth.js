import { create } from 'zustand'
import { api, readAuth, writeAuth } from './api'
import { useColorTheme } from './colorTheme'

/**
 * Session timeout
 *
 * IMPORTANT:
 * Authentication is still controlled by the backend/token expiry.
 * We intentionally do NOT auto-logout the user after a short period
 * of browser inactivity because that can unexpectedly clear the
 * authenticated session while the application is being used.
 *
 * Keep this constant exported internally only if another module
 * later needs it.
 */
const SESSION_TIMEOUT_MS = null

// Kept for compatibility with any existing imports/usages.
// No automatic inactivity logout is registered.
const activityListenersAdded = new Set()

/**
 * Kept as an exported function for compatibility with App.jsx or
 * any other existing module.
 *
 * Since inactivity-based auto logout is disabled, this function
 * intentionally does not register global listeners.
 *
 * Returning a cleanup function preserves the existing API.
 */
export function addGlobalSessionReset() {
  if (activityListenersAdded.has('auth')) return () => {}

  activityListenersAdded.add('auth')

  // No global activity listeners are required anymore because
  // automatic inactivity logout has been disabled.

  return () => {
    activityListenersAdded.delete('auth')
  }
}

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

  // Kept in the store for compatibility with existing components.
  // It remains null because inactivity-based session expiration
  // has been intentionally disabled.
  sessionTimer: null,

  isStaff: () => STAFF.has(get().user?.role),

  isManager: () => MANAGER.has(get().user?.role),

  isAdmin: () => ADMIN.has(get().user?.role),

  /**
   * Reset the inactivity timer.
   *
   * Automatic inactivity logout has been disabled.
   *
   * The function is intentionally retained so existing components
   * calling resetSessionTimer() do not break.
   */
  resetSessionTimer: () => {
    const timer = get().sessionTimer

    if (timer) {
      clearTimeout(timer)
    }

    // No new inactivity timer is created.
    set({ sessionTimer: null })
  },

  /**
   * Clear the inactivity timer.
   *
   * Kept for compatibility with existing code.
   */
  clearSessionTimer: () => {
    const timer = get().sessionTimer

    if (timer) {
      clearTimeout(timer)
      set({ sessionTimer: null })
    }
  },

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
        sessionTimer: null,
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
        sessionTimer: null,
      })

      /**
       * No inactivity timer is started.
       *
       * Authentication validity remains controlled by the
       * backend/token lifecycle.
       */
      get().clearSessionTimer()
    } catch (err) {
      /**
       * Only an explicit authentication/authorization rejection
       * should remove the local authentication state.
       */
      if (err?.status === 401 || err?.status === 403) {
        get().clearSessionTimer()

        writeAuth(null)

        set({
          user: null,
          initialised: true,
          sessionTimer: null,
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
        sessionTimer: null,
      })
    }
  },

  /**
   * Login user.
   */
  async login(email, password, role) {
    set({ loading: true })

    try {
      const data = await api.post('/auth/login', {
        email,
        password,
        role: role || null,
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
        sessionTimer: null,
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
      sessionTimer: null,
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
    /**
     * Clear any existing timer before logging out.
     */
    get().clearSessionTimer()

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
      sessionTimer: null,
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

/**
 * Keep the constant referenced so bundlers/linting do not treat
 * it as accidental dead code if this file is checked strictly.
 */
void SESSION_TIMEOUT_MS
