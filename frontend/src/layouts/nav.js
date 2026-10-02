import {
  Activity, Banknote, BarChart3, Bell, Boxes, Building2, ClipboardCheck, ClipboardList, Clock, Cpu,
  FileSearch, Gauge, HeartPulse, History, LayoutDashboard, ListChecks, MapPinned, Package,
  PlusCircle, QrCode, Search, Settings, Shield, ShieldAlert, Sparkles, TrendingUp,
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

// GET /history is scoped to the caller and works for any authenticated
// role (issues reported, L&F activity, profile-change audit entries) —
// it isn't reporter-specific, so every role gets a link to it, always
// last so its position doesn't jump around between roles.
const HISTORY_LINK = { to: '/history', label: 'History', icon: Clock }

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
  { to: '/issues/map', label: 'Issue Map', icon: MapPinned },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/simulation', label: 'Simulation', icon: Cpu },
]

/** Sub-navigation inside the Administration section. */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/users', label: 'Users & Roles', icon: Users },
  { to: '/admin/predictive', label: 'Predictive Maintenance', icon: TrendingUp },
  { to: '/admin/campus', label: 'Campus & Buildings', icon: Building2 },
  { to: '/admin/assets', label: 'Asset Registry', icon: Boxes },
  { to: '/admin/assets/qr', label: 'Create Asset QR', icon: QrCode },
  { to: '/admin/costs', label: 'Maintenance & Costs', icon: Banknote },
  { to: '/admin/floor-plans', label: 'Floor Plans', icon: MapPinned },
  { to: '/admin/issue-config', label: 'Issue Configuration', icon: FileSearch },
  { to: '/admin/lost-found', label: 'Lost & Found Desk', icon: Search },
  { to: '/admin/ai', label: 'AI Management', icon: Sparkles },
  { to: '/admin/inspection-config', label: 'Inspection Checklists', icon: ClipboardCheck },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/workorder-config', label: 'Work Order Flow', icon: ListChecks },
  { to: '/admin/twin-config', label: 'Twin Configuration', icon: Boxes },
  { to: '/admin/sla', label: 'SLA Policies', icon: Shield },
  { to: '/admin/audit', label: 'Audit & Security', icon: ShieldAlert },
]

const adminTab = (to) => ADMIN_NAV.find((t) => t.to === to)

/**
 * Admin sidebar. Items with `children` are collapsible groups: the
 * Administration tabs live under the module they configure (Assets ->
 * Asset Registry, Create Asset QR, ...), and the module's own page is the
 * group's first entry.
 */
const ADMIN = [
  {
    to: '/map', label: 'Campus Map', icon: MapPinned,
    children: [
      { to: '/map', label: 'Campus Map', icon: MapPinned },
      adminTab('/admin/campus'),
      adminTab('/admin/floor-plans'),
    ],
  },
  {
    to: '/twin', label: 'Digital Twin', icon: Boxes,
    children: [
      { to: '/twin', label: 'Digital Twin', icon: Boxes },
      adminTab('/admin/twin-config'),
    ],
  },
  { to: '/replay', label: 'Event Replay', icon: History },
  {
    to: '/assets', label: 'Assets', icon: Package,
    children: [
      { to: '/assets', label: 'All Assets', icon: Package },
      adminTab('/admin/assets'),
      adminTab('/admin/assets/qr'),
      adminTab('/admin/predictive'),
      adminTab('/admin/costs'),
    ],
  },
  {
    to: '/issues', label: 'Issues', icon: Activity,
    children: [
      { to: '/issues', label: 'All Issues', icon: Activity },
      adminTab('/admin/issue-config'),
      adminTab('/admin/sla'),
    ],
  },
  { to: '/issues/map', label: 'Issue Map', icon: MapPinned },
  {
    to: '/work-orders', label: 'Work Orders', icon: Wrench,
    children: [
      { to: '/work-orders', label: 'All Work Orders', icon: Wrench },
      adminTab('/admin/workorder-config'),
    ],
  },
  {
    to: '/lost-found', label: 'Lost & Found', icon: Search,
    children: [
      { to: '/lost-found', label: 'Lost & Found', icon: Search },
      adminTab('/admin/lost-found'),
    ],
  },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  {
    to: '/inspections', label: 'Inspections', icon: ClipboardCheck,
    children: [
      { to: '/inspections', label: 'All Inspections', icon: ClipboardCheck },
      adminTab('/admin/inspection-config'),
    ],
  },
  {
    to: '/admin', label: 'Administration', icon: Settings,
    children: [
      adminTab('/admin'),
      adminTab('/admin/users'),
      adminTab('/admin/ai'),
      adminTab('/admin/notifications'),
      adminTab('/admin/audit'),
    ],
  },
  { to: '/admin/health', label: 'Health', icon: HeartPulse },
]

/** Every navigable route in a nav list, with groups flattened. */
export function navLeaves(items) {
  return items.flatMap((i) => i.children || [i])
}

/** Permission each module page needs (matches the backend's route guards). */
export const ROUTE_PERMISSIONS = {
  '/issues': 'issues:view',
  '/issues/new': 'issues:create',
  '/issues/map': 'issues:view',
  '/work-orders': 'work_orders:view',
  '/work-orders/board': 'work_orders:view',
  '/inspections': 'inspections:view',
  '/assets': 'assets:view',
  '/analytics': 'analytics:view',
  '/simulation': 'analytics:simulate',
  '/lost-found': 'lost_found:view',
}

/** Modules added to any role's sidebar once that role is granted them. */
const GRANTABLE = [
  { to: '/issues', label: 'Issues', icon: Activity },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/work-orders', label: 'Work Orders', icon: Wrench },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/lost-found', label: 'Lost & Found', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/simulation', label: 'Simulation', icon: Cpu },
]

/**
 * Sidebar for a role, driven by the permissions granted in Admin → Roles:
 * the role's usual menu minus modules whose permission was revoked, plus any
 * permitted module the menu doesn't already have. Without `perms` (still
 * loading) the role's usual menu is returned unchanged.
 */
export function navFor(role, perms) {
  const base = baseNavFor(role)
  if (!perms) return base
  const allowed = (to) => !ROUTE_PERMISSIONS[to] || perms.includes(ROUTE_PERMISSIONS[to])

  const filtered = base
    .map((item) => {
      if (!item.children) return item
      const children = item.children.filter((c) => allowed(c.to))
      return { ...item, children, to: allowed(item.to) ? item.to : children[0]?.to }
    })
    .filter((item) => (item.children ? item.children.length > 0 : allowed(item.to)))

  const present = new Set(navLeaves(filtered).map((l) => l.to))
  const extras = GRANTABLE.filter((g) => allowed(g.to) && !present.has(g.to))

  const history = filtered[filtered.length - 1]?.to === '/history' ? filtered.pop() : null
  return [...filtered, ...extras, ...(history ? [history] : [])]
}

function baseNavFor(role) {
  switch (role) {
    case 'technician':
      return [...COMMON, ...TECHNICIAN, HISTORY_LINK]
    case 'facility_manager':
      return [...COMMON, ...MANAGER, HISTORY_LINK]
    case 'admin':
    case 'super_admin':
      return [...COMMON, ...ADMIN, HISTORY_LINK]
    default:
      return [...COMMON, ...REPORTER, HISTORY_LINK]
  }
}
