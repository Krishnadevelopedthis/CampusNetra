import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Spinner, Toaster } from '@/components/ui'
import AppLayout from '@/layouts/AppLayout'
import { ROLE_HOME, useAuth } from '@/lib/auth'

// Auth screens load eagerly — they are the entry point.
import ForgotPassword from '@/pages/ForgotPassword'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ResetPassword from '@/pages/ResetPassword'
import VerifyEmail from '@/pages/VerifyEmail'

// Everything behind the app shell is split out of the initial bundle.
const Dashboard      = lazy(() => import('@/pages/Dashboard'))
const ReportIssue    = lazy(() => import('@/pages/ReportIssue'))
const IssueList      = lazy(() => import('@/pages/IssueList'))
const IssueDetail    = lazy(() => import('@/pages/IssueDetail'))
const IssueMap       = lazy(() => import('@/pages/IssueMap'))
const DigitalTwin    = lazy(() => import('@/pages/DigitalTwin'))
const CampusMap      = lazy(() => import('@/pages/CampusMap'))
const FloorPlanEditor= lazy(() => import('@/pages/FloorPlanEditor'))
const AssetList      = lazy(() => import('@/pages/AssetList'))
const AssetDetail    = lazy(() => import('@/pages/AssetDetail'))
const EventReplay    = lazy(() => import('@/pages/EventReplay'))
const WorkOrderList  = lazy(() => import('@/pages/WorkOrderList'))
const WorkOrderBoard = lazy(() => import('@/pages/WorkOrderBoard'))
const WorkOrderDetail= lazy(() => import('@/pages/WorkOrderDetail'))
const Inspections    = lazy(() => import('@/pages/Inspections'))
const InspectionDetail = lazy(() => import('@/pages/InspectionDetail'))
const LostFound      = lazy(() => import('@/pages/LostFound'))
const LostFoundItem  = lazy(() => import('@/pages/LostFoundItem'))
const ReportItem     = lazy(() => import('@/pages/ReportItem'))
const Help           = lazy(() => import('@/pages/Help'))
const Settings       = lazy(() => import('@/pages/Settings'))
const Analytics      = lazy(() => import('@/pages/Analytics'))
const Profile        = lazy(() => import('@/pages/Profile'))
const AdminLayout    = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminOverview  = lazy(() => import('@/pages/admin/AdminOverview'))
const AdminUsers     = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminPredictive= lazy(() => import('@/pages/admin/AdminPredictive'))
const AdminAI        = lazy(() => import('@/pages/admin/AdminAI'))
const AdminAssets    = lazy(() => import('@/pages/admin/AdminAssets'))
const AdminCosts     = lazy(() => import('@/pages/admin/AdminCosts'))
const AdminCampus    = lazy(() => import('@/pages/admin/AdminCampus'))
const AdminLostFound = lazy(() => import('@/pages/admin/AdminLostFound'))
const AdminInspectionConfig = lazy(() => import('@/pages/admin/AdminTemplates').then((m) => ({ default: m.AdminInspectionConfig })))
const AdminNotifications = lazy(() => import('@/pages/admin/AdminTemplates').then((m) => ({ default: m.AdminNotifications })))
const AdminWorkOrderConfig = lazy(() => import('@/pages/admin/AdminSystem').then((m) => ({ default: m.AdminWorkOrderConfig })))
const AdminTwinConfig = lazy(() => import('@/pages/admin/AdminSystem').then((m) => ({ default: m.AdminTwinConfig })))
const AdminIssueConfig = lazy(() => import('@/pages/admin/AdminConfig').then((m) => ({ default: m.AdminIssueConfig })))
const AdminSLA       = lazy(() => import('@/pages/admin/AdminConfig').then((m) => ({ default: m.AdminSLA })))
const AdminAudit     = lazy(() => import('@/pages/admin/AdminConfig').then((m) => ({ default: m.AdminAudit })))
const NotFound       = lazy(() => import('@/pages/errors/NotFound'))
const Forbidden      = lazy(() => import('@/pages/errors/Forbidden'))
const ServerError    = lazy(() => import('@/pages/errors/ServerError'))

function RequireAuth({ children, roles }) {
  const { user, initialised } = useAuth()
  const location = useLocation()

  if (!initialised) return <Spinner label="Restoring your session…" className="min-h-screen" />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />
  return children
}

function PublicOnly({ children }) {
  const { user, initialised } = useAuth()
  if (!initialised) return <Spinner label="Loading…" className="min-h-screen" />
  if (user) return <Navigate to={ROLE_HOME[user.role] || '/dashboard'} replace />
  return children
}

const STAFF = ['technician', 'facility_manager', 'admin', 'super_admin']
const MANAGER = ['facility_manager', 'admin', 'super_admin']
const ADMIN = ['admin', 'super_admin']

export default function App() {
  const init = useAuth((s) => s.init)
  const location = useLocation()

  useEffect(() => { init() }, [init])

  return (
    <>
      {/* Keyed on the path so a crash on one page clears when you navigate
          away, instead of wedging the whole app until a reload. */}
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<Spinner className="min-h-screen" />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Authenticated shell */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/issues" element={<IssueList />} />
            <Route path="/issues/new" element={<ReportIssue />} />
            <Route path="/issues/map" element={<IssueMap />} />
            <Route path="/issues/:id" element={<IssueDetail />} />

            <Route path="/map" element={<CampusMap />} />
            <Route path="/twin" element={<DigitalTwin />} />
            <Route path="/twin/:floorId" element={<DigitalTwin />} />
            <Route path="/replay" element={<RequireAuth roles={STAFF}><EventReplay /></RequireAuth>} />
            <Route path="/assets" element={<RequireAuth roles={STAFF}><AssetList /></RequireAuth>} />
            <Route path="/assets/:id" element={<RequireAuth roles={STAFF}><AssetDetail /></RequireAuth>} />

            <Route path="/work-orders" element={<RequireAuth roles={STAFF}><WorkOrderList /></RequireAuth>} />
            <Route path="/work-orders/board" element={<RequireAuth roles={STAFF}><WorkOrderBoard /></RequireAuth>} />
            <Route path="/work-orders/:id" element={<RequireAuth roles={STAFF}><WorkOrderDetail /></RequireAuth>} />

            <Route path="/inspections" element={<RequireAuth roles={STAFF}><Inspections /></RequireAuth>} />
            <Route path="/inspections/:id" element={<RequireAuth roles={STAFF}><InspectionDetail /></RequireAuth>} />

            <Route path="/lost-found" element={<LostFound />} />
            <Route path="/lost-found/report" element={<ReportItem />} />
            <Route path="/lost-found/items/:id" element={<LostFoundItem />} />

            <Route path="/analytics" element={<RequireAuth roles={MANAGER}><Analytics /></RequireAuth>} />

            <Route path="/help" element={<Help />} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />

            {/* Role landing aliases */}
            <Route path="/technician" element={<Navigate to="/work-orders" replace />} />
            <Route path="/facility" element={<Navigate to="/dashboard" replace />} />
            <Route path="/admin" element={<RequireAuth roles={MANAGER}><AdminLayout /></RequireAuth>}>
              <Route index element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="predictive" element={<AdminPredictive />} />
              <Route path="floor-plans" element={<FloorPlanEditor />} />
              <Route path="ai" element={<AdminAI />} />
              <Route path="campus" element={<AdminCampus />} />
              <Route path="assets" element={<AdminAssets />} />
              <Route path="costs" element={<AdminCosts />} />
              <Route path="lost-found" element={<AdminLostFound />} />
              <Route path="inspection-config" element={<AdminInspectionConfig />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="workorder-config" element={<AdminWorkOrderConfig />} />
              <Route path="twin-config" element={<AdminTwinConfig />} />
              <Route path="issue-config" element={<AdminIssueConfig />} />
              <Route path="sla" element={<AdminSLA />} />
              <Route path="audit" element={<RequireAuth roles={ADMIN}><AdminAudit /></RequireAuth>} />
            </Route>
          </Route>

          {/* Errors */}
          <Route path="/403" element={<Forbidden />} />
          <Route path="/500" element={<ServerError />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  )
}
