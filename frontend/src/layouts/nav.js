import {
  Activity, BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, Cpu,
  FileSearch, Gauge, History, LayoutDashboard, ListChecks, MapPinned, Package,
  PlusCircle, Search, Settings, Shield, ShieldAlert, Sparkles, TrendingUp,
  Users, Wrench,
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
  { to: '/map', label: 'Campus Map', icon: MapPinned },
]

const TECHNICIAN = [
  { to: '/work-orders', label: 'My Work Orders', icon: Wrench },
  { to: '/work-orders/board', label: 'Work Board', icon: ListChecks },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
]

const MANAGER = [
  { to: '/map', label: 'Campus Map', icon: MapPinned },
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/replay', label: 'Event Replay', icon: History },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/issues', label: 'Live Issues', icon: Activity },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/simulation', label: 'Simulation', icon: Cpu },
]

const ADMIN = [
  { to: '/map', label: 'Campus Map', icon: MapPinned },
  { to: '/twin', label: 'Digital Twin', icon: Boxes },
  { to: '/replay', label: 'Event Replay', icon: History },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/issues', label: 'Issues', icon: Activity },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
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
  { to: '/admin/predictive', label: 'Predictive Maintenance', icon: TrendingUp },
  { to: '/admin/campus', label: 'Campus & Buildings', icon: Building2 },
  { to: '/admin/floor-plans', label: 'Floor Plans', icon: MapPinned },
  { to: '/admin/issue-config', label: 'Issue Configuration', icon: FileSearch },
  { to: '/admin/ai', label: 'AI Management', icon: Sparkles },
  { to: '/admin/sla', label: 'SLA Policies', icon: Shield },
  { to: '/admin/audit', label: 'Audit & Security', icon: ShieldAlert },
]
