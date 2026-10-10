/**
 * What the first-run tour points at, per role. `target` is a data-tour value
 * (see Sidebar, MobileTabBar and AppLayout); the same value is set on the
 * sidebar item and on the phone's tab, and the tour uses whichever is on
 * screen. A step whose target is not on screen is skipped, so one list works
 * on a phone, a tablet and a desktop, and for any set of permissions.
 */
const nav = (to) => `nav:${to}`

const WELCOME = (name) => ({
  title: `Welcome to Campus Netra${name ? `, ${name}` : ''}!`,
  body: 'Here is a one-minute tour of the main buttons. You can skip it any time and replay it later from your profile menu.',
  welcome: true,
})

const COMMON_TAIL = [
  { target: 'search', title: 'Search', body: 'Find any complaint, asset or Lost & Found item by its name or reference number.' },
  { target: 'notifications', title: 'Notifications', body: 'Updates on your complaints, new assignments and matches show up here, with a count of what is unread.' },
  { target: 'qr', title: 'QR scanner', body: 'Scan the QR sticker on any equipment. A report opens with its building, floor and room already filled in.', shape: 'circle' },
  { target: 'assistant', title: 'AI assistant', body: 'Ask anything about Campus Netra or your own complaints, in plain words. It can even file a report for you.', shape: 'circle' },
  { target: 'theme', title: 'Light or dark', body: 'Switch between the light and dark look whenever you like.' },
  { target: 'profile-menu', title: 'Your profile', body: 'Profile, settings, history and help live here. You can replay this tour from here too.' },
]

const FINISH = {
  title: "You're all set!",
  body: 'Start by reporting an issue or exploring the campus map. If you get stuck, just ask the AI assistant.',
  finish: true,
}

const REPORTER = [
  { target: nav('/dashboard'), title: 'Home', body: 'Your dashboard: open complaints, resolved ones and recent activity, all updated live.' },
  { target: nav('/issues/new'), title: 'Report an issue', body: 'Something broken? Pick the room, add a photo and describe it. AI sends it to the right team.' },
  { target: nav('/issues'), title: 'Track complaints', body: 'Follow every complaint you reported, from Reported to Closed, and see who is working on it.' },
  { target: nav('/lost-found'), title: 'Lost & Found', body: 'Lost or found something? Report it here. Lost and found items are matched automatically.' },
  { target: nav('/map'), title: 'Campus map', body: 'A 3D map of your campus. Tap a building, a floor and a room to see its equipment and report a problem.', shape: 'circle' },
]

const TECHNICIAN = [
  { target: nav('/dashboard'), title: 'Home', body: 'Your day at a glance: open issues, active work orders and how you are doing on SLA.' },
  { target: nav('/work-orders'), title: 'Work orders', body: 'Jobs assigned to you, most urgent first. Open one to start it, add notes and photos, and mark it done.' },
  { target: nav('/work-orders/board'), title: 'Work board', body: 'The same jobs as a board, one column per status.' },
  { target: nav('/inspections'), title: 'Inspections', body: 'Checklists for rooms and equipment. A failed critical check raises a complaint automatically.' },
  { target: nav('/twin'), title: 'Digital twin', body: 'Live floor plans. Each piece of equipment shows its condition: green fine, red faulty, blue in repair, purple needs inspection.', shape: 'circle' },
  { target: nav('/assets'), title: 'Assets', body: 'All equipment with its location, condition, warranty and service history.' },
  { target: nav('more'), title: 'More', body: 'Everything else, like Lost & Found and History, is in here.' },
]

const MANAGER = [
  { target: nav('/dashboard'), title: 'Home', body: 'Campus-wide numbers: open issues, work in progress, SLA compliance and equipment health.' },
  { target: nav('/issues'), title: 'Issues', body: 'Every complaint on campus. Assign it to a technician and track it against its deadline.' },
  { target: nav('/work-orders'), title: 'Work orders', body: 'All repair jobs, who has them and whether they are on time.' },
  { target: nav('/map'), title: 'Campus map', body: 'The campus in 3D, coloured by condition, with a heatmap of where complaints come from.', shape: 'circle' },
  { target: nav('/twin'), title: 'Digital twin', body: 'Live floor plans with every piece of equipment and its current condition.' },
  { target: nav('/replay'), title: 'Event replay', body: 'See exactly how the campus looked at any moment in the past.' },
  { target: nav('/analytics'), title: 'Analytics', body: 'Hotspots, repeat failures, team performance and maintenance cost.' },
  { target: nav('/simulation'), title: 'Simulation', body: 'Plan ahead: see what a sudden surge of complaints would do to workload and deadlines.' },
  { target: nav('more'), title: 'More', body: 'Every other section, like inspections, assets and Lost & Found, is in here.' },
]

const ADMIN = [
  ...MANAGER.filter((s) => s.target !== nav('more')),
  { target: nav('/admin'), title: 'Administration', body: 'Users and roles, campus setup, categories, SLA policies, notifications and the audit log.' },
  { target: nav('/admin/health'), title: 'IoT health', body: 'Live readings from ESP32 sensors. Faults are caught automatically and an inspection is scheduled.' },
  { target: nav('more'), title: 'More', body: 'Every other section, including all administration pages, is in here.' },
]

export function stepsFor(role, firstName) {
  const middle = {
    student: REPORTER, teacher: REPORTER, technician: TECHNICIAN,
    facility_manager: MANAGER, admin: ADMIN, super_admin: ADMIN,
  }[role] || REPORTER
  return [WELCOME(firstName), ...middle, ...COMMON_TAIL, FINISH]
}
