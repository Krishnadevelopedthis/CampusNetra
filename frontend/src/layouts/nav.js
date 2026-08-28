import {
  Activity, BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, Cpu,
  FileSearch, Gauge, LayoutDashboard, ListChecks, MapPinned, Package,
  PlusCircle, Search, Settings, Shield, Sparkles, Users, Wrench,
} from 'lucide-react'

/**
 * Navigation per role. The backend enforces the same boundaries; this only
 * decides what is worth showing.
 */
const COMMON = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const REPORTER = [
  { to: '/issues/new', label: 'Report an Issue', icon: PlusCircle },
  { to: '/issues', label: 'Track Complaints', icon: ClipboardList },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/twin', label: 'Campus Map', icon: MapPinned },
]

const TECHNICIAN = [
  { to: '/work-orders', label: 'My Work Orders', icon: Wrench },
  { to: '/work-orders/board', label: 'Work Board', icon: ListChecks },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
]

const MANAGER = [
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/issues', label: 'Live Issues', icon: Activity },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/simulation', label: 'Simulation', icon: Cpu },
]

const ADMIN = [
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/issues', label: 'Issues', icon: Activity },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin', label: 'Administration', icon: Settings },
]

export function navFor(role) {
  switch (role) {
    case 'technician':
      return [...COMMON, ...TECHNICIAN]
    case 'facility_manager':
      return [...COMMON, ...MANAGER]
    case 'admin':
    case 'super_admin':
      return [...COMMON, ...ADMIN]
    default:
      return [...COMMON, ...REPORTER]
  }
}

/** Sub-navigation inside the Administration section. */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/users', label: 'Users & Roles', icon: Users },
  { to: '/admin/campus', label: 'Campus & Buildings', icon: Building2 },
  { to: '/admin/assets', label: 'Assets', icon: Package },
  { to: '/admin/issue-config', label: 'Issue Configuration', icon: FileSearch },
  { to: '/admin/sla', label: 'SLA Policies', icon: Shield },
  { to: '/admin/ai', label: 'AI Management', icon: Sparkles },
  { to: '/admin/audit', label: 'Audit & Security', icon: Shield },
]
