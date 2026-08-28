import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

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
const DigitalTwin    = lazy(() => import('@/pages/DigitalTwin'))
const WorkOrderList  = lazy(() => import('@/pages/WorkOrderList'))
const WorkOrderBoard = lazy(() => import('@/pages/WorkOrderBoard'))
const WorkOrderDetail= lazy(() => import('@/pages/WorkOrderDetail'))
const LostFound      = lazy(() => import('@/pages/LostFound'))
const LostFoundItem  = lazy(() => import('@/pages/LostFoundItem'))
const ReportItem     = lazy(() => import('@/pages/ReportItem'))
const Analytics      = lazy(() => import('@/pages/Analytics'))
const Profile        = lazy(() => import('@/pages/Profile'))
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

export default function App() {
  const init = useAuth((s) => s.init)

  useEffect(() => { init() }, [init])

  return (
    <>
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
            <Route path="/issues/:id" element={<IssueDetail />} />

            <Route path="/twin" element={<DigitalTwin />} />
            <Route path="/twin/:floorId" element={<DigitalTwin />} />

            <Route path="/work-orders" element={<RequireAuth roles={STAFF}><WorkOrderList /></RequireAuth>} />
            <Route path="/work-orders/board" element={<RequireAuth roles={STAFF}><WorkOrderBoard /></RequireAuth>} />
            <Route path="/work-orders/:id" element={<RequireAuth roles={STAFF}><WorkOrderDetail /></RequireAuth>} />

            <Route path="/lost-found" element={<LostFound />} />
            <Route path="/lost-found/report" element={<ReportItem />} />
            <Route path="/lost-found/items/:id" element={<LostFoundItem />} />

            <Route path="/analytics" element={<RequireAuth roles={MANAGER}><Analytics /></RequireAuth>} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Profile />} />

            {/* Role landing aliases */}
            <Route path="/technician" element={<Navigate to="/work-orders" replace />} />
            <Route path="/facility" element={<Navigate to="/dashboard" replace />} />
            <Route path="/admin" element={<RequireAuth roles={MANAGER}><Analytics /></RequireAuth>} />
          </Route>

          {/* Errors */}
          <Route path="/403" element={<Forbidden />} />
          <Route path="/500" element={<ServerError />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
