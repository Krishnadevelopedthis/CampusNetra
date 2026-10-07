# Campus Netra — Software Engineering Diagrams

Every diagram is a separate figure (own canvas, layout, SVG, PNG and editable source) and was
drawn from the implemented code, not from the project brief. Terminology is the same in all of
them: Campus, Building, Floor, Room, Asset, User, Department, **Issue** (the complaint), Work Order,
Work Order Event (history), Health Event (asset health), IoT Device, Lost and Found, Digital Twin, SLA.

| Figure | Files | Source (editable) |
|---|---|---|
| DFD Level 0 | `dfd/campusnetra_dfd_level_0.svg/.png` | `dfd/source/build_dfd_level0.py` |
| DFD Level 1 | `dfd/campusnetra_dfd_level_1.svg/.png` | `dfd/source/build_dfd_level1.html` (+ generated `campusnetra_dfd_level_1.dot`) |
| Class diagram | `class/campusnetra_class_diagram.svg/.png` | `class/source/build_class_diagram.html` (+ generated `campusnetra_class_diagram.dot`) |
| Sequence — User login | `sequence/login_sequence.svg/.png` | `sequence/source/login_sequence.puml` |
| Sequence — Issue reporting | `sequence/complaint_sequence.svg/.png` | `sequence/source/complaint_sequence.puml` |
| Sequence — Maintenance / work order | `sequence/maintenance_sequence.svg/.png` | `sequence/source/maintenance_sequence.puml` |
| Sequence — IoT asset health | `sequence/iot_health_sequence.svg/.png` | `sequence/source/iot_health_sequence.puml` |
| State — Issue (complaint) lifecycle | `state/complaint_state_diagram.svg/.png` | `state/source/complaint_state_diagram.puml` |
| State — Work order lifecycle (extra) | `state/work_order_state_diagram.svg/.png` | `state/source/work_order_state_diagram.puml` |
| State — Asset lifecycle | `state/asset_state_diagram.svg/.png` | `state/source/asset_state_diagram.puml` |
| Use case | `use-case/campusnetra_use_case_diagram.svg/.png` | `use-case/source/build_use_case.py` |

DFD: Level 0 and Level 1 only. A Level 2 diagram was optional and is not included.

## What each diagram documents

* **DFD Level 0** — the context of the system: seven external entities and the data that crosses the
  system boundary in each direction. Every flow is its own arrow with its label on it. Yourdon–DeMarco
  notation (rectangle = external entity, circle = process).
* **DFD Level 1** — nine processes (authentication, campus and asset management, issues, work orders and
  SLA, inspections, IoT health monitoring, digital twin and event replay, lost and found, analytics /
  prediction / simulation) and nine data stores that correspond to the real tables (D1 `users`, `refresh_tokens`
  …; D2 `campuses/buildings/floors/rooms`; D3 `assets`, `asset_categories`; D4 `issues` + events; D5 `work_orders`
  + events, parts, `sla_policies`; D6 `inspections` + templates and results; D7 `iot_devices`, sensor
  mappings, `health_events`; D8 `twin_events`, `asset_state_history`; D9 `lf_items`, `lf_matches`, `lf_claims`).
  A double-headed arrow between a process and a store means the process both reads and writes it. A line
  between an external entity and a process that carries two labels is two flows, one per direction.
* **Class diagram** — the 20 principal domain classes with their foreign keys. Multiplicities were checked
  against the schema (nullable foreign keys are `0..1`). Filled diamond = composition (cascade delete in the
  models), hollow diamond = aggregation (`Room` houses `Asset`; an asset may exist without a room).
  Only foreign keys that have a drawn relationship are listed as attributes. No methods are shown because the
  models carry no domain methods; the behaviour lives in `app/services/*`.
* **Sequence diagrams** — the four main workflows, written against the real call chains
  (`auth.login → auth_service.authenticate`, `issues.create_issue`, `issues.transition → work_orders.create_work_order`
  and `work_orders.transition_work_order`, `mqtt_client → iot_health.process_device_telemetry`).
* **State diagrams** — drawn from `ISSUE_TRANSITIONS`, `WORK_ORDER_TRANSITIONS` and from every call of
  `set_asset_state` in the code.
* **Use case diagram** — actors and use cases validated against the permissions that are seeded for each role
  (`role_permissions`). Actor generalization means inherited permissions: Student, Teacher, Technician and Facility
  Manager each hold everything a Registered User can do; Facility Manager holds all Technician permissions;
  Admin holds all Facility Manager permissions.

## Assumptions and inconsistencies found in the implementation

1. **Complaint = `Issue`.** The code and database call it an issue; the interface also says "complaint".
2. **Inspection is not part of the complaint → work order path.** A manager marking an issue *Assigned* creates the
   work order directly. Inspections are separate: scheduled from templates, raised by IoT health events, or the source
   of a new issue when a critical check fails. The sequence diagrams follow the real behaviour.
3. **Facility Manager is a fifth role** (besides Student, Teacher, Technician and Admin) and is needed as an actor
   (assigning, verifying, scheduling inspections, simulation). `super_admin` has the same permissions as `admin`
   and is not drawn separately.
4. **`WorkOrderStatus.DRAFT` is defined and has transitions, but no code path creates a draft**, so it is not shown
   in the work order state diagram.
5. **Asset states** are `healthy, warning, fault, under_maintenance, inspection_required, decommissioned`. There is no
   "repaired" or "retired" state. `decommissioned` is reached only by a manual state change by staff.
6. **IoT never creates a work order directly.** A confirmed anomaly creates a Health Event and schedules an inspection;
   a work order exists only if the technician fails the inspection.
7. **The asset returns to Healthy when the issue becomes Resolved** (completed work), not when the work order is
   closed, and only if no other open issue still references the asset.
8. **No OTP login.** Email codes exist only for email verification and password reset, so "Email Service" appears in
   the DFD and the use case diagram and no OTP step appears in the login sequence. Login uses a captcha instead.
9. Notifications (in-app and email) are produced inside several processes; they are not drawn as a separate DFD
   process. `AuditLog`, `Notification`, `IssueEvent`, `SLAPolicy` and `InspectionResult` are not in the class diagram
   to keep it readable (SLA appears as `sla_due_at` on `Issue` and `WorkOrder`).
10. The public Lost & Found claim and handover steps were not exercised end to end in testing; the diagrams describe
    what the code implements.

## Source files that were inspected

`backend/app/core/enums.py` (statuses and transition tables), `app/models/{identity,spatial,issues,work,lostfound,iot,platform}.py`,
`app/api/v1/{auth,issues,work_orders,inspections,campus,lostfound,iot,admin,analytics}.py`,
`app/services/{auth,issues,work_orders,inspections,twin,iot_health,mqtt_client,predictive,storage,templates,notifications}.py`,
`app/api/deps.py`, `app/ai/{classifier,router}.py`, the live schema (`information_schema` columns and foreign keys) and the seeded
`role_permissions` table.

## How to regenerate

* **PlantUML** (sequence and state): `java -jar plantuml.jar -tsvg -o .. source/<name>.puml` and `-tpng` for the PNG
  (needs Java 17+; the shared look is in `style.iuml`).
* **DFD Level 0 and use case**: `python source/build_dfd_level0.py` / `python source/build_use_case.py`
  write the SVG; export the PNG by opening the SVG in a browser (or `chrome --headless --screenshot`).
* **DFD Level 1 and class diagram**: open the `.html` file in a browser (it loads Graphviz WebAssembly from a CDN) —
  the page builds the diagram from the lists at the top of the file; `window.__dot` holds the Graphviz DOT text that was
  rendered (also saved as `source/*.dot`, which can be edited and rendered with any Graphviz).
* The SVG files open in draw.io, Inkscape or Word for further editing.
