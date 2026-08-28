# Database Schema

PostgreSQL 16. 49 tables, 15 enum types. Migrations are plain SQL, applied in
filename order by `scripts/dev_db.sh migrate`.

| Migration | Contents |
| --- | --- |
| `001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`, `citext`; all enum types |
| `002_identity.sql` | Organizations, departments, users, permissions, auth tokens |
| `003_spatial_twin.sql` | Campus → building → floor → room → asset; twin event store |
| `004_issues.sql` | Complaints, attachments, timeline, duplicate candidates |
| `005_work_orders_inspections.sql` | Work orders, SLA policies, parts, inspections |
| `006_lost_found.sql` | Lost & Found ledger, AI matches, ownership claims |
| `007_platform.sql` | Notifications, AI telemetry, predictions, simulations, audit |

## Spatial model

```
organizations
   └── campuses
         └── buildings          map_x, map_y  (0..1 on the campus map)
               └── floors       floor_plan_url
                     └── rooms  boundary: [[x,y],…]  (0..1 polygon)
                           └── assets  pos_x, pos_y  (0..1 within the room)
```

All geometry is normalised to `0..1`, so a plan renders at any viewport size
without rescaling or re-fetching.

## Digital Twin state

`assets.state` is the single source of truth for marker colour:

| State | Colour | Meaning |
| --- | --- | --- |
| `healthy` | `#10b981` | Operating normally |
| `warning` | `#f59e0b` | Degraded or blocked |
| `fault` | `#ef4444` | Broken, complaint open |
| `under_maintenance` | `#3b82f6` | Technician actively working |
| `inspection_required` | `#8b5cf6` | Inspection overdue |
| `decommissioned` | `#94a3b8` | Retired |

Two append-only tables make the twin replayable:

- **`asset_state_history`** — every transition, with the issue or work order that
  caused it. `state-at` replays this rather than approximating from current rows.
- **`twin_events`** — every event pushed to live subscribers. Rows carrying a
  `simulation_id` are excluded from the live map and from all analytics.

## Reference numbering

`next_reference(org_id, prefix)` is an atomic upsert on `reference_counters`,
so references are gap-free and scoped per organization:

`CMP-1042` issue · `WO-1024` work order · `INS-0031` inspection ·
`LR-2026-0044` lost report · `LF-2026-0082` found item · `CLM-2026-0044` claim

## Full-text search

`issues` and `lf_items` maintain a `tsvector` via trigger, with weighted fields
(title `A`, description `B`, location `C`). `pg_trgm` GIN indexes back fuzzy
matching for Lost & Found.

## Notable constraints

- `assets.tag` is globally unique — it is the human-facing twin identifier.
- `lf_matches` is unique on `(lost_item_id, found_item_id)`, so re-running the
  matcher is idempotent.
- `sla_policies` has a partial unique index on
  `(organization_id, priority, COALESCE(department_id, …))` where active, so a
  department-specific policy can override the organization default without ambiguity.
- `issues.reported_by` is `ON DELETE RESTRICT` — a user with filed complaints
  cannot be hard-deleted, only deactivated, preserving the audit trail.
