import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SessionTimeoutModal } from '@/components/SessionTimeoutModal'
import { RingLoader, Toaster } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { broadcastSessionEnded, dismissWarning, recordActivity, startSessionTimeoutMonitor } from '@/lib/sessionTimeout'

// Auth screens load eagerly — they are the entry point.
import ForgotPassword from '@/pages/ForgotPassword'
import LandingPage from '@/pages/LandingPage'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ResetPassword from '@/pages/ResetPassword'
import VerifyEmail from '@/pages/VerifyEmail'

// AppLayout is the whole authenticated app shell (sidebar, header, the AI
// assistant widget, notifications) and Search is an authenticated-only
// page -- neither is part of the auth entry point above, but both were
// imported eagerly here anyway. A real, measured cost of that: Lighthouse
// against the live site showed the main bundle at 1.13MB / 326KB gzipped
// with 4.76s of main-thread blocking time on the landing page alone --
// an anonymous visitor who never logs in was downloading and parsing the
// entire authenticated app shell just to see the marketing page.
const AppLayout = lazy(() => import('@/layouts/AppLayout'))
const Search = lazy(() => import('@/pages/Search'))

// Everything behind the app shell is split out of the initial bundle.
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const History = lazy(() => import('@/pages/History'))
const ReportIssue = lazy(() => import('@/pages/ReportIssue'))
const IssueList = lazy(() => import('@/pages/IssueList'))
const IssueDetail = lazy(() => import('@/pages/IssueDetail'))
const IssueMap = lazy(() => import('@/pages/IssueMap'))
const DigitalTwin = lazy(() => import('@/pages/DigitalTwin'))
const CampusMap = lazy(() => import('@/pages/CampusMap'))
const FloorPlanEditor = lazy(() => import('@/pages/FloorPlanEditor'))
const AssetList = lazy(() => import('@/pages/AssetList'))
const AssetDetail = lazy(() => import('@/pages/AssetDetail'))
const EventReplay = lazy(() => import('@/pages/EventReplay'))
const WorkOrderList = lazy(() => import('@/pages/WorkOrderList'))
const WorkOrderBoard = lazy(() => import('@/pages/WorkOrderBoard'))
const WorkOrderDetail = lazy(() => import('@/pages/WorkOrderDetail'))
const Inspections = lazy(() => import('@/pages/Inspections'))
const InspectionDetail = lazy(() => import('@/pages/InspectionDetail'))
const LostFound = lazy(() => import('@/pages/LostFound'))
const LostFoundItem = lazy(() => import('@/pages/LostFoundItem'))
const ReportItem = lazy(() => import('@/pages/ReportItem'))
const Help = lazy(() => import('@/pages/Help'))
const Settings = lazy(() => import('@/pages/Settings'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Profile = lazy(() => import('@/pages/Profile'))

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminPredictive = lazy(() => import('@/pages/admin/AdminPredictive'))
const AdminAI = lazy(() => import('@/pages/admin/AdminAI'))
const AdminAssets = lazy(() => import('@/pages/admin/AdminAssets'))
const AdminCosts = lazy(() => import('@/pages/admin/AdminCosts'))
const AdminCampus = lazy(() => import('@/pages/admin/AdminCampus'))
const AdminLostFound = lazy(() => import('@/pages/admin/AdminLostFound'))
const AdminHealth = lazy(() => import('@/pages/admin/AdminHealth'))

const AdminInspectionConfig = lazy(() =>
  import('@/pages/admin/AdminTemplates').then((m) => ({
    default: m.AdminInspectionConfig,
  }))
)

const AdminNotifications = lazy(() =>
  import('@/pages/admin/AdminTemplates').then((m) => ({
    default: m.AdminNotifications,
  }))
)

const AdminWorkOrderConfig = lazy(() =>
  import('@/pages/admin/AdminSystem').then((m) => ({
    default: m.AdminWorkOrderConfig,
  }))
)

const AdminTwinConfig = lazy(() =>
  import('@/pages/admin/AdminSystem').then((m) => ({
    default: m.AdminTwinConfig,
  }))
)

const AdminIssueConfig = lazy(() =>
  import('@/pages/admin/AdminConfig').then((m) => ({
    default: m.AdminIssueConfig,
  }))
)

const AdminSLA = lazy(() =>
  import('@/pages/admin/AdminConfig').then((m) => ({
    default: m.AdminSLA,
  }))
)

const AdminAudit = lazy(() =>
  import('@/pages/admin/AdminConfig').then((m) => ({
    default: m.AdminAudit,
  }))
)

const NotFound = lazy(() => import('@/pages/errors/NotFound'))
const Forbidden = lazy(() => import('@/pages/errors/Forbidden'))
const ServerError = lazy(() => import('@/pages/errors/ServerError'))

// Marketing/content pages — linked from the footer, kept out of the
// initial bundle since none of them are the entry point.
const About = lazy(() => import('@/pages/marketing/About'))
const MarketingFeatures = lazy(() => import('@/pages/marketing/Features'))
const Pricing = lazy(() => import('@/pages/marketing/Pricing'))
const Privacy = lazy(() => import('@/pages/marketing/Privacy'))
const Terms = lazy(() => import('@/pages/marketing/Terms'))
const Security = lazy(() => import('@/pages/marketing/Security'))
const Docs = lazy(() => import('@/pages/marketing/Docs'))
const ApiReference = lazy(() => import('@/pages/marketing/ApiReference'))
const Community = lazy(() => import('@/pages/marketing/Community'))
const Support = lazy(() => import('@/pages/marketing/Support'))
const Solutions = lazy(() => import('@/pages/marketing/Solutions'))

/**
 * Protect authenticated routes.
 *
 * IMPORTANT:
 * This is a frontend navigation guard only.
 * Actual authorization/security must still be enforced by
 * the FastAPI backend.
 */
function RequireAuth({ children, roles }) {
  const { user, initialised } = useAuth()
  const location = useLocation()

  if (!initialised) {
    return (
      <RingLoader
        label="Restoring your session…"
        className="min-h-screen"
      />
    )
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    )
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }

  return children
}

/**
 * Where authenticated users are redirected when they attempt
 * to visit a public-only page.
 *
 * Kept exactly according to the existing application behavior.
 */
const ROLE_HOME = {
  student: '/dashboard',
  teacher: '/dashboard',
  technician: '/work-orders',
  facility_manager: '/dashboard',
  admin: '/admin',
  super_admin: '/admin',
}

/**
 * Prevent already-authenticated users from visiting pages such
 * as login/register/forgot-password.
 */
function PublicOnly({ children }) {
  const { user, initialised } = useAuth()

  if (!initialised) {
    return (
      <RingLoader
        label="Loading…"
        className="min-h-screen"
      />
    )
  }

  if (user) {
    return (
      <Navigate
        to={ROLE_HOME[user.role] || '/dashboard'}
        replace
      />
    )
  }

  return children
}

/**
 * Existing role groups.
 *
 * These are intentionally preserved exactly.
 */
const STAFF = [
  'technician',
  'facility_manager',
  'admin',
  'super_admin',
]

const MANAGER = [
  'facility_manager',
  'admin',
  'super_admin',
]

const ADMIN = [
  'admin',
  'super_admin',
]

export default function App() {
  const init = useAuth((s) => s.init)
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const location = useLocation()
  const navigate = useNavigate()

  /**
   * Restore and validate the authentication session once when
   * the application starts.
   */
  useEffect(() => {
    init()
  }, [init])

  /**
   * Inactivity session timeout.
   *
   * Starts once a user is present, stops on logout — `user` going from
   * null to an object (login) or back to null (logout, or a rejected
   * /auth/me on boot) is exactly the signal this needs, so the effect's
   * own start/cleanup pairing handles "start on login" / "stop on logout" /
   * "restart after a fresh login" without extra bookkeeping.
   *
   * `onExpire` performs the actual logout: this module only measures
   * inactivity, it never touches tokens or storage itself.
   */
  useEffect(() => {
    if (!user) return undefined

    const stop = startSessionTimeoutMonitor(async ({ silent } = {}) => {
      await logout()
      if (!silent) broadcastSessionEnded()
      navigate('/login?expired=1&reason=inactivity', { replace: true })
    })

    return stop
  }, [user, logout, navigate])

  // SPA navigation never fires a native DOM event the activity listeners
  // would catch, so it has to be recorded explicitly — otherwise reading
  // through a long issue list by clicking between pages would still expire
  // after 10 minutes of "inactivity" that was actually continuous use.
  useEffect(() => {
    recordActivity()
  }, [location.pathname])

  // Apply the saved display preferences (reduce motion, table density)
  // globally, not just while Settings.jsx happens to be mounted — that page
  // has its own copy of this same effect for *live* preview while a change
  // is being made, before it's saved. This one re-applies whatever is
  // actually persisted, so the setting still holds after navigating away,
  // and takes effect immediately on login/boot without visiting Settings
  // first — table density and reduced motion were otherwise dead toggles
  // outside that one page.
  useEffect(() => {
    const display = user?.preferences?.display
    document.documentElement.classList.toggle('reduce-motion', !!display?.reduce_motion)
    document.documentElement.dataset.density = display?.density === 'compact' ? 'compact' : 'comfortable'
  }, [user?.preferences?.display])

  return (
    <>
      <Toaster />
      <SessionTimeoutModal
        onLogout={async () => {
          // Closed directly, first, rather than waiting on the indirect
          // chain (auth state clears -> an effect notices -> its cleanup
          // -> only then closes it) that this button's click used to rely
          // on entirely — that chain has no guaranteed timing relative to
          // the navigate() below, which is what let the popup keep
          // floating over the login page after a manual Log Out click.
          dismissWarning()
          await logout()
          broadcastSessionEnded()
          navigate('/login', { replace: true })
        }}
      />
      {/*
        Keyed on the path so a crash on one page clears when you
        navigate away, instead of wedging the whole app until
        a reload.
      */}
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RingLoader label="Loading…" className="min-h-screen" />}>
          <Routes>

            {/* =====================================================
                PUBLIC
            ====================================================== */}

            <Route
              path="/"
              element={<LandingPage />}
            />

            {/* =====================================================
                MARKETING / CONTENT PAGES
            ====================================================== */}

            <Route path="/about" element={<About />} />
            <Route path="/features" element={<MarketingFeatures />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/security" element={<Security />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/api-docs" element={<ApiReference />} />
            <Route path="/community" element={<Community />} />
            <Route path="/support" element={<Support />} />
            <Route path="/solutions/:audience" element={<Solutions />} />

            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />

            <Route
              path="/register"
              element={
                <PublicOnly>
                  <Register />
                </PublicOnly>
              }
            />

            <Route
              path="/verify-email"
              element={<VerifyEmail />}
            />

            <Route
              path="/forgot-password"
              element={
                <PublicOnly>
                  <ForgotPassword />
                </PublicOnly>
              }
            />

            <Route
              path="/reset-password"
              element={<ResetPassword />}
            />

            {/* =====================================================
                AUTHENTICATED SHELL
            ====================================================== */}

            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >

              {/* Dashboard */}

              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

              <Route
                path="/history"
                element={<History />}
              />

              {/* =================================================
                  ISSUES
              ================================================== */}

              {/* Reporter (student/teacher) + Manager/Admin */}
              <Route
                path="/issues"
                element={
                  <RequireAuth
                    roles={[
                      'student',
                      'teacher',
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <IssueList />
                  </RequireAuth>
                }
              />

              {/* Student/Teacher issue reporting */}
              <Route
                path="/issues/new"
                element={
                  <RequireAuth
                    roles={[
                      'student',
                      'teacher',
                    ]}
                  >
                    <ReportIssue />
                  </RequireAuth>
                }
              />

              {/* Issue map */}
              <Route
                path="/issues/map"
                element={
                  <RequireAuth
                    roles={[
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <IssueMap />
                  </RequireAuth>
                }
              />

              {/* Issue detail */}
              <Route
                path="/issues/:id"
                element={
                  <RequireAuth
                    roles={[
                      'student',
                      'teacher',
                      'technician',
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <IssueDetail />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  CAMPUS MAP
              ================================================== */}

              <Route
                path="/map"
                element={
                  <RequireAuth
                    roles={[
                      'student',
                      'teacher',
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <CampusMap />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  DIGITAL TWIN
              ================================================== */}

              <Route
                path="/twin"
                element={
                  <RequireAuth
                    roles={[
                      'technician',
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <DigitalTwin />
                  </RequireAuth>
                }
              />

              <Route
                path="/twin/:floorId"
                element={
                  <RequireAuth
                    roles={[
                      'technician',
                      'facility_manager',
                      'admin',
                      'super_admin',
                    ]}
                  >
                    <DigitalTwin />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  STAFF
              ================================================== */}

              <Route
                path="/replay"
                element={
                  <RequireAuth roles={STAFF}>
                    <EventReplay />
                  </RequireAuth>
                }
              />

              <Route
                path="/assets"
                element={
                  <RequireAuth roles={STAFF}>
                    <AssetList />
                  </RequireAuth>
                }
              />

              <Route
                path="/assets/:id"
                element={
                  <RequireAuth roles={STAFF}>
                    <AssetDetail />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  WORK ORDERS
              ================================================== */}

              <Route
                path="/work-orders"
                element={
                  <RequireAuth roles={STAFF}>
                    <WorkOrderList />
                  </RequireAuth>
                }
              />

              <Route
                path="/work-orders/board"
                element={
                  <RequireAuth roles={STAFF}>
                    <WorkOrderBoard />
                  </RequireAuth>
                }
              />

              <Route
                path="/work-orders/:id"
                element={
                  <RequireAuth roles={STAFF}>
                    <WorkOrderDetail />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  INSPECTIONS
              ================================================== */}

              <Route
                path="/inspections"
                element={
                  <RequireAuth roles={STAFF}>
                    <Inspections />
                  </RequireAuth>
                }
              />

              <Route
                path="/inspections/:id"
                element={
                  <RequireAuth roles={STAFF}>
                    <InspectionDetail />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  LOST & FOUND
              ================================================== */}

              <Route
                path="/lost-found"
                element={<LostFound />}
              />

              <Route
                path="/lost-found/report"
                element={<ReportItem />}
              />

              <Route
                path="/lost-found/items/:id"
                element={<LostFoundItem />}
              />

              {/* =================================================
                  ANALYTICS
              ================================================== */}

              <Route
                path="/analytics"
                element={
                  <RequireAuth roles={MANAGER}>
                    <Analytics />
                  </RequireAuth>
                }
              />

              {/*
                The sidebar lists Simulation separately, so it
                needs a path of its own — sharing /analytics would
                light up both nav entries.
              */}
              <Route
                path="/simulation"
                element={
                  <RequireAuth roles={MANAGER}>
                    <Analytics defaultTab="simulation" />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  GENERAL
              ================================================== */}

              <Route
                path="/help"
                element={<Help />}
              />

              <Route
                path="/search"
                element={<Search />}
              />

              <Route
                path="/profile"
                element={<Profile />}
              />

              <Route
                path="/settings"
                element={<Settings />}
              />

              {/* =================================================
                  ROLE LANDING ALIASES
              ================================================== */}

              <Route
                path="/technician"
                element={
                  <Navigate
                    to="/work-orders"
                    replace
                  />
                }
              />

              <Route
                path="/facility"
                element={
                  <Navigate
                    to="/dashboard"
                    replace
                  />
                }
              />

              {/* =================================================
                  HEALTH (admin-only, standalone — not nested inside
                  the Administration section's own header/tabs)
              ================================================== */}

              <Route
                path="/admin/health"
                element={
                  <RequireAuth roles={ADMIN}>
                    <AdminHealth />
                  </RequireAuth>
                }
              />

              {/* =================================================
                  ADMIN
              ================================================== */}

              <Route
                path="/admin"
                element={
                  <RequireAuth roles={MANAGER}>
                    <AdminLayout />
                  </RequireAuth>
                }
              >
                <Route
                  index
                  element={<AdminOverview />}
                />

                <Route
                  path="users"
                  element={<AdminUsers />}
                />

                <Route
                  path="predictive"
                  element={<AdminPredictive />}
                />

                <Route
                  path="floor-plans"
                  element={<FloorPlanEditor />}
                />

                <Route
                  path="ai"
                  element={<AdminAI />}
                />

                <Route
                  path="campus"
                  element={<AdminCampus />}
                />

                <Route
                  path="assets"
                  element={<AdminAssets />}
                />

                <Route
                  path="costs"
                  element={<AdminCosts />}
                />

                <Route
                  path="lost-found"
                  element={<AdminLostFound />}
                />

                <Route
                  path="inspection-config"
                  element={<AdminInspectionConfig />}
                />

                <Route
                  path="notifications"
                  element={<AdminNotifications />}
                />

                <Route
                  path="workorder-config"
                  element={<AdminWorkOrderConfig />}
                />

                <Route
                  path="twin-config"
                  element={<AdminTwinConfig />}
                />

                <Route
                  path="issue-config"
                  element={<AdminIssueConfig />}
                />

                <Route
                  path="sla"
                  element={<AdminSLA />}
                />

                <Route
                  path="audit"
                  element={
                    <RequireAuth roles={ADMIN}>
                      <AdminAudit />
                    </RequireAuth>
                  }
                />
              </Route>
            </Route>

            {/* =====================================================
                ERRORS
            ====================================================== */}

            <Route
              path="/403"
              element={<Forbidden />}
            />

            <Route
              path="/500"
              element={<ServerError />}
            />

            <Route
              path="*"
              element={<NotFound />}
            />

          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  )
}
