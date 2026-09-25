import { create } from 'zustand'
import { api, readAuth, writeAuth } from './api'
import { useColorTheme } from './colorTheme'
import { setDisplayPrefs } from './displayPrefs'

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
      setDisplayPrefs(user?.preferences)

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
      setDisplayPrefs(data.user?.preferences)

      set({
        user: data.user,
      })

      // first_login rides along on the returned user object (rather than
      // changing this function's return shape) so Login.jsx can tell a
      // genuinely first-ever sign-in apart from a returning one — see
      // AuthResponse.first_login on the backend. Every other consumer of
      // this return value already only reads the UserOut fields, so one
      // extra property is harmless to them.
      return { ...data.user, first_login: !!data.first_login }
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
    setDisplayPrefs(data.user?.preferences)

    set({
      user: data.user,
    })

    return data.user
  },

  /**
   * Logout.
   *
   * Server logout is attempted first.
   * Local authentication is always cleared afterwards, along with the
   * signed-out user's accent colour -- the login page a next visitor lands
   * on (who may not be the same person, on a shared or public device)
   * should never carry a previous user's personal colour choice. Covers
   * both an explicit "Log Out" tap and an inactivity-triggered timeout,
   * since sessionTimeout.js's auto-logout calls this same method.
   */
  async logout() {
    /**
     * Fire-and-forget, deliberately not awaited.
     *
     * Local logout must never wait on this: the previous version awaited
     * it first, so a slow or stuck connection left the person looking
     * fully logged in for up to REQUEST_TIMEOUT_MS (30s) after tapping
     * "Log Out" — exactly the situation a session-inactivity warning's own
     * Log Out button hits hardest, since the phone/tab has typically just
     * spent several idle minutes with its screen off/backgrounded right
     * before that tap, which is when a mobile browser's network stack is
     * most likely to be suspended or slow to resume. The comment below
     * always described the intended behavior; the code just didn't
     * actually implement it.
     */
    api.post('/auth/logout').catch(() => {
      // Server-side revocation is best-effort — see above.
    })

    // The colour itself is still saved server-side on the account (it comes
    // straight back via loadFromUserPreferences() on the next login) -- only
    // the *applied, on-screen* accent resets, so a public/shared device
    // doesn't keep showing whoever was last signed in to anyone who looks at
    // it afterwards, including the login page itself.
    useColorTheme.getState().resetColorTheme()

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

    // Settings.jsx calls setUser() right after PATCHing preferences, so this
    // is also where a just-changed time_format/week_start takes effect
    // immediately, without needing a reload.
    setDisplayPrefs(user?.preferences)

    set({ user })
  },
}))
