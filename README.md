# Campus Netra

**AI-assisted campus facility management, with a live digital twin, IoT health monitoring and Lost & Found.**

Report a campus problem with a photo and a location. Campus Netra classifies it, routes it to the right team, opens a work order, and shows the affected equipment changing colour on a live map of the campus until it is fixed.

🌐 **Web:** [campusnetra.dpdns.org](https://campusnetra.dpdns.org) · 📱 **Android:** app available (APK)

---

## Features

| Area | What it does |
| --- | --- |
| **Issue reporting** | Report a problem with photos and an exact location (building, floor, room, equipment). AI suggests the category and priority. |
| **QR reporting** | Every asset can carry a QR sticker. Scanning it opens a report with the location already filled in. |
| **Smart routing** | Issues go to the right department and technician by specialisation and current workload. Likely duplicates are flagged. |
| **Work orders & SLA** | Assignment, progress, parts and costs, verification and closure, each with response and resolution targets. |
| **Digital twin** | A live 3D and floor-plan view of the campus. Equipment turns red, blue, amber, purple or green as its condition changes, in real time. |
| **Event replay** | See how the whole campus looked at any moment in the past. |
| **Inspections** | Checklist-based inspections. A failed critical check raises a complaint automatically. |
| **IoT health monitoring** | Sensor devices report power, fan and light status, temperature and humidity. Confirmed faults schedule an inspection and alert staff. A history chart shows the readings over time. |
| **Lost & Found** | Lost and found reports are matched automatically on photo, description, place, category and time, with a conservative threshold before anyone is notified. |
| **Predictive maintenance** | Ranks equipment by failure risk using an explainable, weighted model. |
| **Analytics & simulation** | Hotspots, repeat failures, team performance, cost, and "what-if" surge simulation. |
| **AI assistant** | Answers questions about the platform and the user's own data, and can file reports on their behalf. |
| **Mobile** | Phone-friendly layout with bottom navigation, plus an Android app. |

---

## How it works

```
 Report (web, app or QR)
        │
        ▼
 AI classification ──► department & technician routing
        │
        ▼
 Work order ──► repair ──► verification ──► closed
        │
        ▼
 Digital twin updates live:  🔴 fault → 🔵 in repair → 🟢 healthy
```

IoT devices feed the same loop:

```
 Sensor reading ──► fault confirmed ──► inspection scheduled ──► technician checks
                                                                    │
                                     no fault ◄─────────────────────┼────► fault confirmed
                                     (back to 🟢)                        complaint + work order
```

A piece of equipment returns to green only when nothing else is still open against it.

---

## Roles

| Role | Typical use |
| --- | --- |
| **Student / Teacher** | Report issues, track complaints, Lost & Found, campus map |
| **Technician** | Work orders, inspections, assets, digital twin |
| **Facility Manager** | Live issues, assignment, analytics, simulation |
| **Administrator** | Users and roles, campus setup, configuration, IoT devices, audit |

Access is permission-based: an administrator decides what each role can see and do.

---

## Screenshots

Real screens from the live app. Personal details (names, emails, phone numbers, ID numbers) are blurred. Click a section to open it, and any picture to see it full size.

<details open>
<summary><b>Sign in and registration</b> · 6 screens</summary>

Open to everyone: the website, sign-in and account creation.

<table>
<tr><td valign="top" width="50%"><b>Website</b><br><sub>The public home page introducing Campus Netra.</sub><br><br><a href="docs/screenshots/public/landing.png"><img src="docs/screenshots/public/landing.png" alt="Website" width="420"></a></td><td valign="top" width="50%"><b>Sign in</b><br><sub>Role tabs for students, teachers and technicians, with the built-in picture captcha.</sub><br><br><a href="docs/screenshots/public/login.png"><img src="docs/screenshots/public/login.png" alt="Sign in" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Create an account</b><br><sub>Registration for students, teachers, technicians and new institutions.</sub><br><br><a href="docs/screenshots/public/register.png"><img src="docs/screenshots/public/register.png" alt="Create an account" width="420"></a></td><td valign="top" width="50%"><b>Forgot password</b><br><sub>Reset by a code sent to the registered email or phone.</sub><br><br><a href="docs/screenshots/public/forgot-password.png"><img src="docs/screenshots/public/forgot-password.png" alt="Forgot password" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Sign in on a phone</b><br><sub>The same screens adapt to small screens.</sub><br><br><a href="docs/screenshots/public/login-mobile.png"><img src="docs/screenshots/public/login-mobile.png" alt="Sign in on a phone" width="240"></a></td><td valign="top" width="50%"><b>Register on a phone</b><br><sub>Registration form in the mobile layout.</sub><br><br><a href="docs/screenshots/public/register-mobile.png"><img src="docs/screenshots/public/register-mobile.png" alt="Register on a phone" width="240"></a></td></tr>
</table>

</details>

<details>
<summary><b>Student</b> · 19 screens</summary>

What a student (or teacher) sees: reporting problems, following them up and Lost & Found.

<table>
<tr><td valign="top" width="50%"><b>Dashboard</b><br><sub>Personal summary: active and resolved complaints, recent activity and campus health.</sub><br><br><a href="docs/screenshots/student/dashboard.jpg"><img src="docs/screenshots/student/dashboard.jpg" alt="Dashboard" width="420"></a></td><td valign="top" width="50%"><b>Report an issue</b><br><sub>Pick building, floor, room and equipment, describe the problem and add photos. AI suggests the category and priority.</sub><br><br><a href="docs/screenshots/student/report-issue.jpg"><img src="docs/screenshots/student/report-issue.jpg" alt="Report an issue" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Track complaints</b><br><sub>Every complaint the student filed, with status and SLA.</sub><br><br><a href="docs/screenshots/student/complaints.jpg"><img src="docs/screenshots/student/complaints.jpg" alt="Track complaints" width="420"></a></td><td valign="top" width="50%"><b>Complaint details</b><br><sub>Timeline from Reported to Closed, evidence photos, location, AI classification and assigned technician.</sub><br><br><a href="docs/screenshots/student/complaint-detail.jpg"><img src="docs/screenshots/student/complaint-detail.jpg" alt="Complaint details" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Lost & Found</b><br><sub>Browse lost and found items reported on campus.</sub><br><br><a href="docs/screenshots/student/lost-found.jpg"><img src="docs/screenshots/student/lost-found.jpg" alt="Lost & Found" width="420"></a></td><td valign="top" width="50%"><b>Report a lost or found item</b><br><sub>Description, place, time and photos, used to match lost items with found ones.</sub><br><br><a href="docs/screenshots/student/lost-found-report.jpg"><img src="docs/screenshots/student/lost-found-report.jpg" alt="Report a lost or found item" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Campus map</b><br><sub>A 3D map of the campus, from buildings down to individual rooms.</sub><br><br><a href="docs/screenshots/student/campus-map.jpg"><img src="docs/screenshots/student/campus-map.jpg" alt="Campus map" width="420"></a></td><td valign="top" width="50%"><b>AI assistant</b><br><sub>Answers questions about the platform and the student's own data, here explaining the QR scanner.</sub><br><br><a href="docs/screenshots/student/ai-assistant.jpg"><img src="docs/screenshots/student/ai-assistant.jpg" alt="AI assistant" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Notifications</b><br><sub>Updates on complaints, matches and account activity.</sub><br><br><a href="docs/screenshots/student/notifications.jpg"><img src="docs/screenshots/student/notifications.jpg" alt="Notifications" width="420"></a></td><td valign="top" width="50%"><b>QR scanner</b><br><sub>Scan the QR sticker on equipment to open a report with the location filled in. (Shown without a camera.)</sub><br><br><a href="docs/screenshots/student/qr-scanner.jpg"><img src="docs/screenshots/student/qr-scanner.jpg" alt="QR scanner" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>History</b><br><sub>Everything the student has done, in one timeline.</sub><br><br><a href="docs/screenshots/student/history.jpg"><img src="docs/screenshots/student/history.jpg" alt="History" width="420"></a></td><td valign="top" width="50%"><b>Search</b><br><sub>Search across complaints, assets and Lost & Found.</sub><br><br><a href="docs/screenshots/student/search.jpg"><img src="docs/screenshots/student/search.jpg" alt="Search" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Profile</b><br><sub>Personal details and campus record (contact details blurred here).</sub><br><br><a href="docs/screenshots/student/profile.jpg"><img src="docs/screenshots/student/profile.jpg" alt="Profile" width="420"></a></td><td valign="top" width="50%"><b>Settings</b><br><sub>Theme, notifications, security and account preferences.</sub><br><br><a href="docs/screenshots/student/settings.jpg"><img src="docs/screenshots/student/settings.jpg" alt="Settings" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Help & Support</b><br><sub>Getting started guide and frequently asked questions.</sub><br><br><a href="docs/screenshots/student/help.jpg"><img src="docs/screenshots/student/help.jpg" alt="Help & Support" width="420"></a></td><td valign="top" width="50%"><b>Phone: dashboard</b><br><sub>Bottom navigation with the campus map raised in the centre.</sub><br><br><a href="docs/screenshots/student/mobile-dashboard.jpg"><img src="docs/screenshots/student/mobile-dashboard.jpg" alt="Phone: dashboard" width="240"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: report an issue</b><br><sub>Reporting from a phone.</sub><br><br><a href="docs/screenshots/student/mobile-issues-new.jpg"><img src="docs/screenshots/student/mobile-issues-new.jpg" alt="Phone: report an issue" width="240"></a></td><td valign="top" width="50%"><b>Phone: complaints</b><br><sub>Complaint list on a phone.</sub><br><br><a href="docs/screenshots/student/mobile-issues.jpg"><img src="docs/screenshots/student/mobile-issues.jpg" alt="Phone: complaints" width="240"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: campus map</b><br><sub>The 3D campus map on a phone.</sub><br><br><a href="docs/screenshots/student/mobile-map.jpg"><img src="docs/screenshots/student/mobile-map.jpg" alt="Phone: campus map" width="240"></a></td><td></td></tr>
</table>

</details>

<details>
<summary><b>Technician</b> · 17 screens</summary>

What a technician sees: assigned work, inspections and equipment.

<table>
<tr><td valign="top" width="50%"><b>Dashboard</b><br><sub>Open issues, active work orders, SLA compliance and operational health.</sub><br><br><a href="docs/screenshots/technician/dashboard.jpg"><img src="docs/screenshots/technician/dashboard.jpg" alt="Dashboard" width="420"></a></td><td valign="top" width="50%"><b>My work orders</b><br><sub>Jobs assigned to the technician, most urgent first.</sub><br><br><a href="docs/screenshots/technician/work-orders.jpg"><img src="docs/screenshots/technician/work-orders.jpg" alt="My work orders" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Work board</b><br><sub>The same work as a board, column by status.</sub><br><br><a href="docs/screenshots/technician/work-board.jpg"><img src="docs/screenshots/technician/work-board.jpg" alt="Work board" width="420"></a></td><td valign="top" width="50%"><b>Work order details</b><br><sub>Progress steps, notes, evidence, parts and cost, and the SLA result.</sub><br><br><a href="docs/screenshots/technician/work-order-detail.jpg"><img src="docs/screenshots/technician/work-order-detail.jpg" alt="Work order details" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Inspections</b><br><sub>Scheduled, overdue and submitted inspections with average score.</sub><br><br><a href="docs/screenshots/technician/inspections.jpg"><img src="docs/screenshots/technician/inspections.jpg" alt="Inspections" width="420"></a></td><td valign="top" width="50%"><b>Inspection details</b><br><sub>Checklist answers (pass, fail, needs attention) and the resulting score.</sub><br><br><a href="docs/screenshots/technician/inspection-detail.jpg"><img src="docs/screenshots/technician/inspection-detail.jpg" alt="Inspection details" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Digital twin</b><br><sub>Live floor plans where each piece of equipment shows its condition by colour.</sub><br><br><a href="docs/screenshots/technician/digital-twin.jpg"><img src="docs/screenshots/technician/digital-twin.jpg" alt="Digital twin" width="420"></a></td><td valign="top" width="50%"><b>Assets</b><br><sub>Every asset with location, condition, warranty and last service.</sub><br><br><a href="docs/screenshots/technician/assets.jpg"><img src="docs/screenshots/technician/assets.jpg" alt="Assets" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Asset details</b><br><sub>Condition history, open issues and service record of one asset.</sub><br><br><a href="docs/screenshots/technician/asset-detail.jpg"><img src="docs/screenshots/technician/asset-detail.jpg" alt="Asset details" width="420"></a></td><td valign="top" width="50%"><b>Lost & Found</b><br><sub>Items reported on campus.</sub><br><br><a href="docs/screenshots/technician/lost-found.jpg"><img src="docs/screenshots/technician/lost-found.jpg" alt="Lost & Found" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>AI assistant</b><br><sub>Answers about the technician's own inspections and work orders.</sub><br><br><a href="docs/screenshots/technician/ai-assistant.jpg"><img src="docs/screenshots/technician/ai-assistant.jpg" alt="AI assistant" width="420"></a></td><td valign="top" width="50%"><b>Notifications</b><br><sub>New assignments, scheduled inspections and IoT alerts.</sub><br><br><a href="docs/screenshots/technician/notifications.jpg"><img src="docs/screenshots/technician/notifications.jpg" alt="Notifications" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>QR scanner</b><br><sub>Scan equipment to report or look it up.</sub><br><br><a href="docs/screenshots/technician/qr-scanner.jpg"><img src="docs/screenshots/technician/qr-scanner.jpg" alt="QR scanner" width="420"></a></td><td valign="top" width="50%"><b>History</b><br><sub>The technician's own activity.</sub><br><br><a href="docs/screenshots/technician/history.jpg"><img src="docs/screenshots/technician/history.jpg" alt="History" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: dashboard</b><br><sub>Technician home on a phone.</sub><br><br><a href="docs/screenshots/technician/mobile-dashboard.jpg"><img src="docs/screenshots/technician/mobile-dashboard.jpg" alt="Phone: dashboard" width="240"></a></td><td valign="top" width="50%"><b>Phone: work orders</b><br><sub>Assigned jobs on a phone.</sub><br><br><a href="docs/screenshots/technician/mobile-work-orders.jpg"><img src="docs/screenshots/technician/mobile-work-orders.jpg" alt="Phone: work orders" width="240"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: digital twin</b><br><sub>The digital twin in the centre of the technician's tab bar.</sub><br><br><a href="docs/screenshots/technician/mobile-twin.jpg"><img src="docs/screenshots/technician/mobile-twin.jpg" alt="Phone: digital twin" width="240"></a></td><td></td></tr>
</table>

</details>

<details>
<summary><b>Administrator</b> · 39 screens</summary>

What an administrator sees: the whole campus, people, configuration and IoT. Names and contact details are blurred.

<table>
<tr><td valign="top" width="50%"><b>Dashboard</b><br><sub>Campus-wide numbers: open issues, work orders, SLA compliance and health.</sub><br><br><a href="docs/screenshots/admin/dashboard.jpg"><img src="docs/screenshots/admin/dashboard.jpg" alt="Dashboard" width="420"></a></td><td valign="top" width="50%"><b>Campus map (3D)</b><br><sub>The real campus in 3D with buildings coloured by condition, plus complaint hotspots.</sub><br><br><a href="docs/screenshots/admin/campus-map.jpg"><img src="docs/screenshots/admin/campus-map.jpg" alt="Campus map (3D)" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Digital twin</b><br><sub>Floor plans with live equipment markers.</sub><br><br><a href="docs/screenshots/admin/digital-twin.jpg"><img src="docs/screenshots/admin/digital-twin.jpg" alt="Digital twin" width="420"></a></td><td valign="top" width="50%"><b>Event replay</b><br><sub>Rebuild how the campus looked at any past moment.</sub><br><br><a href="docs/screenshots/admin/event-replay.jpg"><img src="docs/screenshots/admin/event-replay.jpg" alt="Event replay" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Assets</b><br><sub>All assets across the campus with condition and warranty.</sub><br><br><a href="docs/screenshots/admin/assets.jpg"><img src="docs/screenshots/admin/assets.jpg" alt="Assets" width="420"></a></td><td valign="top" width="50%"><b>Issues</b><br><sub>Every complaint with priority, status, assignee and SLA.</sub><br><br><a href="docs/screenshots/admin/issues.jpg"><img src="docs/screenshots/admin/issues.jpg" alt="Issues" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Issue details</b><br><sub>Full history of one complaint, from report to closure.</sub><br><br><a href="docs/screenshots/admin/issue-detail.jpg"><img src="docs/screenshots/admin/issue-detail.jpg" alt="Issue details" width="420"></a></td><td valign="top" width="50%"><b>Issue map</b><br><sub>Where complaints are, room by room.</sub><br><br><a href="docs/screenshots/admin/issue-map.jpg"><img src="docs/screenshots/admin/issue-map.jpg" alt="Issue map" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Work orders</b><br><sub>All repair jobs and their SLA.</sub><br><br><a href="docs/screenshots/admin/work-orders.jpg"><img src="docs/screenshots/admin/work-orders.jpg" alt="Work orders" width="420"></a></td><td valign="top" width="50%"><b>Lost & Found</b><br><sub>All lost and found items.</sub><br><br><a href="docs/screenshots/admin/lost-found.jpg"><img src="docs/screenshots/admin/lost-found.jpg" alt="Lost & Found" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Analytics</b><br><sub>Hotspots, repeat failures, team performance and cost.</sub><br><br><a href="docs/screenshots/admin/analytics.jpg"><img src="docs/screenshots/admin/analytics.jpg" alt="Analytics" width="420"></a></td><td valign="top" width="50%"><b>Simulation</b><br><sub>What-if surge planning: workload, capacity and SLA impact.</sub><br><br><a href="docs/screenshots/admin/simulation.jpg"><img src="docs/screenshots/admin/simulation.jpg" alt="Simulation" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Inspections</b><br><sub>Inspection overview for the whole campus.</sub><br><br><a href="docs/screenshots/admin/inspections.jpg"><img src="docs/screenshots/admin/inspections.jpg" alt="Inspections" width="420"></a></td><td valign="top" width="50%"><b>Administration overview</b><br><sub>Users, open issues, asset health, SLA, system health and AI activity.</sub><br><br><a href="docs/screenshots/admin/admin-overview.jpg"><img src="docs/screenshots/admin/admin-overview.jpg" alt="Administration overview" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Users & roles</b><br><sub>Manage accounts and roles (blurred for privacy).</sub><br><br><a href="docs/screenshots/admin/admin-users.jpg"><img src="docs/screenshots/admin/admin-users.jpg" alt="Users & roles" width="420"></a></td><td valign="top" width="50%"><b>Predictive maintenance</b><br><sub>Assets ranked by failure risk, with the reasons.</sub><br><br><a href="docs/screenshots/admin/admin-predictive.jpg"><img src="docs/screenshots/admin/admin-predictive.jpg" alt="Predictive maintenance" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Campus & buildings</b><br><sub>Set up campuses, buildings, floors and rooms, and place the campus on the map.</sub><br><br><a href="docs/screenshots/admin/admin-campus.jpg"><img src="docs/screenshots/admin/admin-campus.jpg" alt="Campus & buildings" width="420"></a></td><td valign="top" width="50%"><b>Floor plan editor</b><br><sub>Upload a plan, outline the rooms and place equipment inside them.</sub><br><br><a href="docs/screenshots/admin/admin-floor-plans.jpg"><img src="docs/screenshots/admin/admin-floor-plans.jpg" alt="Floor plan editor" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Asset registry</b><br><sub>Add and edit equipment room by room.</sub><br><br><a href="docs/screenshots/admin/admin-asset-registry.jpg"><img src="docs/screenshots/admin/admin-asset-registry.jpg" alt="Asset registry" width="420"></a></td><td valign="top" width="50%"><b>Create asset QR</b><br><sub>Generate and download the QR sticker for any asset.</sub><br><br><a href="docs/screenshots/admin/admin-asset-qr.jpg"><img src="docs/screenshots/admin/admin-asset-qr.jpg" alt="Create asset QR" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Maintenance & costs</b><br><sub>Spending on repairs and parts.</sub><br><br><a href="docs/screenshots/admin/admin-costs.jpg"><img src="docs/screenshots/admin/admin-costs.jpg" alt="Maintenance & costs" width="420"></a></td><td valign="top" width="50%"><b>Lost & Found desk</b><br><sub>Review matches and claims (blurred for privacy).</sub><br><br><a href="docs/screenshots/admin/admin-lost-found-desk.jpg"><img src="docs/screenshots/admin/admin-lost-found-desk.jpg" alt="Lost & Found desk" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>AI management</b><br><sub>AI decisions, accuracy and items waiting for review.</sub><br><br><a href="docs/screenshots/admin/admin-ai.jpg"><img src="docs/screenshots/admin/admin-ai.jpg" alt="AI management" width="420"></a></td><td valign="top" width="50%"><b>Inspection checklists</b><br><sub>Build the checklists inspections use.</sub><br><br><a href="docs/screenshots/admin/admin-inspection-checklists.jpg"><img src="docs/screenshots/admin/admin-inspection-checklists.jpg" alt="Inspection checklists" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Notification templates</b><br><sub>The wording of in-app and email notifications for each event.</sub><br><br><a href="docs/screenshots/admin/admin-notifications.jpg"><img src="docs/screenshots/admin/admin-notifications.jpg" alt="Notification templates" width="420"></a></td><td valign="top" width="50%"><b>Work order flow</b><br><sub>Configure how work orders move between statuses.</sub><br><br><a href="docs/screenshots/admin/admin-work-order-flow.jpg"><img src="docs/screenshots/admin/admin-work-order-flow.jpg" alt="Work order flow" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Twin configuration</b><br><sub>How much of the campus is mapped, marker colours, and every floor with its rooms.</sub><br><br><a href="docs/screenshots/admin/admin-twin-config.jpg"><img src="docs/screenshots/admin/admin-twin-config.jpg" alt="Twin configuration" width="420"></a></td><td valign="top" width="50%"><b>Issue configuration</b><br><sub>Categories, departments, keywords and SLA per category.</sub><br><br><a href="docs/screenshots/admin/admin-issue-config.jpg"><img src="docs/screenshots/admin/admin-issue-config.jpg" alt="Issue configuration" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>SLA policies</b><br><sub>Response and resolution targets per priority, with compliance.</sub><br><br><a href="docs/screenshots/admin/admin-sla.jpg"><img src="docs/screenshots/admin/admin-sla.jpg" alt="SLA policies" width="420"></a></td><td valign="top" width="50%"><b>Audit & security</b><br><sub>Who did what and when (blurred for privacy).</sub><br><br><a href="docs/screenshots/admin/admin-audit.jpg"><img src="docs/screenshots/admin/admin-audit.jpg" alt="Audit & security" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>IoT health</b><br><sub>Registered ESP32 devices and live equipment health, room by room.</sub><br><br><a href="docs/screenshots/admin/iot-health.jpg"><img src="docs/screenshots/admin/iot-health.jpg" alt="IoT health" width="420"></a></td><td valign="top" width="50%"><b>IoT device history</b><br><sub>Power, temperature, humidity, fan and light over time, with fault markers.</sub><br><br><a href="docs/screenshots/admin/iot-device-history.jpg"><img src="docs/screenshots/admin/iot-device-history.jpg" alt="IoT device history" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>AI assistant</b><br><sub>A live summary of the campus on request.</sub><br><br><a href="docs/screenshots/admin/ai-assistant.jpg"><img src="docs/screenshots/admin/ai-assistant.jpg" alt="AI assistant" width="420"></a></td><td valign="top" width="50%"><b>Notifications</b><br><sub>SLA breaches, IoT faults and new complaints.</sub><br><br><a href="docs/screenshots/admin/notifications.jpg"><img src="docs/screenshots/admin/notifications.jpg" alt="Notifications" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>QR scanner</b><br><sub>Available to every role.</sub><br><br><a href="docs/screenshots/admin/qr-scanner.jpg"><img src="docs/screenshots/admin/qr-scanner.jpg" alt="QR scanner" width="420"></a></td><td valign="top" width="50%"><b>Page not found</b><br><sub>A friendly page for broken links.</sub><br><br><a href="docs/screenshots/admin/not-found-404.jpg"><img src="docs/screenshots/admin/not-found-404.jpg" alt="Page not found" width="420"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: dashboard</b><br><sub>Administrator home on a phone.</sub><br><br><a href="docs/screenshots/admin/mobile-dashboard.jpg"><img src="docs/screenshots/admin/mobile-dashboard.jpg" alt="Phone: dashboard" width="240"></a></td><td valign="top" width="50%"><b>Phone: campus map</b><br><sub>The 3D map on a phone.</sub><br><br><a href="docs/screenshots/admin/mobile-map.jpg"><img src="docs/screenshots/admin/mobile-map.jpg" alt="Phone: campus map" width="240"></a></td></tr>
<tr><td valign="top" width="50%"><b>Phone: IoT health</b><br><sub>Monitored rooms on a phone.</sub><br><br><a href="docs/screenshots/admin/mobile-admin-health.jpg"><img src="docs/screenshots/admin/mobile-admin-health.jpg" alt="Phone: IoT health" width="240"></a></td><td></td></tr>
</table>

</details>

---

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Recharts, Three.js / MapLibre for the 3D and outdoor maps
- **Backend:** Python, FastAPI, async SQLAlchemy, WebSockets
- **Database:** PostgreSQL, plus a time-series store for sensor history
- **IoT:** ESP32 devices over MQTT
- **AI:** language models for classification, matching and the assistant, each with a rule-based fallback, so the platform works without them
- **Mobile:** Capacitor (Android)

---

## Project structure

```
CampusNetra/
├── frontend/   Web app (and the Android project in frontend/android)
├── backend/    API, background jobs and AI services
├── database/   Schema migrations and seed data
├── docs/       Diagrams (DFD, class, sequence, state, use case)
└── scripts/    Development helpers
```

---

## Running locally

**Requirements:** Node.js 20+, Python 3.11+, PostgreSQL 16.

**Backend**

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt     # Windows: .venv\Scripts\pip
cp .env.example .env                          # then fill in your own values
.venv/bin/uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Android app** (requires the Android SDK and JDK 21)

```bash
cd frontend
npm run build:app
cd android && ./gradlew assembleDebug
```

> Configuration lives in environment variables (`backend/.env`). Never commit real credentials. `.env.example` lists what is needed, without values.

---

## Security

- Role and permission checks on every request
- Short-lived access tokens with single-use refresh tokens, and one active session per account
- Built-in image captcha, login lockout and rate limiting on code and SMS requests
- AI assistant guarded against revealing credentials or other users' data
- Secrets are supplied through the environment, never stored in the code

---

© Campus Netra. All rights reserved.
