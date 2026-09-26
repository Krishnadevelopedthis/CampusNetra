"""Permission catalogue + role-default seeding.

Two tables: `permissions` (the fixed catalogue of grantable actions) and
`role_permissions` (which of those each role currently has). Both start
empty on a fresh database. Seeding happens at app startup -- not lazily on
an admin's first visit to Admin > Roles -- because require_permission()
(see app/api/deps.py) gates real requests from the moment the app starts;
if role_permissions were still empty when the first real request landed,
every route using it would deny everyone until an admin happened to open
that page first.

PERMISSION_ROLE_DEFAULTS mirrors this app's actual, pre-existing route
guards (RequireStaff/RequireManager/RequireAdmin/CurrentUser on each
endpoint) at the time permission-based enforcement was introduced -- so
switching a route over to reading this table changes nothing about who
could do what on day one. Everything from here on is what an admin edits
via Admin > Roles > Manage.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.models.identity import Permission, RolePermission

PERMISSION_CATALOGUE = [
    ("issues", "view", "See complaints"),
    ("issues", "create", "Report a new complaint"),
    ("issues", "triage", "Triage and assign complaints"),
    ("issues", "resolve", "Transition/resolve/close complaints"),
    ("work_orders", "view", "See work orders"),
    ("work_orders", "create", "Create a work order"),
    ("work_orders", "assign", "Assign a work order to a technician"),
    ("work_orders", "update", "Update/close a work order"),
    ("inspections", "view", "See inspections"),
    ("inspections", "schedule", "Schedule an inspection"),
    ("inspections", "conduct", "Carry out an inspection"),
    ("lost_found", "view", "Browse Lost & Found"),
    ("lost_found", "report", "Report a lost/found item"),
    ("lost_found", "review", "Review AI matches and approve claims"),
    ("assets", "view", "View campus assets"),
    ("assets", "manage", "Add/edit buildings, rooms and assets"),
    ("users", "view", "View the user directory"),
    ("users", "manage", "Edit user roles and status"),
    ("analytics", "view", "View analytics and reports"),
    ("analytics", "simulate", "Run scenario simulations"),
    ("admin", "sla", "Configure SLA policies"),
    ("admin", "audit", "View the audit log"),
    ("admin", "campus_config", "Edit campus/organization configuration"),
    ("notifications", "manage", "Manage notification templates"),
]

EVERYONE = tuple(UserRole)
STAFF = (UserRole.TECHNICIAN, UserRole.FACILITY_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
MANAGERS = (UserRole.FACILITY_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
ADMINS = (UserRole.ADMIN, UserRole.SUPER_ADMIN)

# code -> which roles have it today, matched one-for-one against the real
# route guard each corresponding endpoint used before this table existed.
PERMISSION_ROLE_DEFAULTS: dict[str, tuple[UserRole, ...]] = {
    "issues:view": EVERYONE,
    "issues:create": EVERYONE,
    "issues:triage": STAFF,
    "issues:resolve": STAFF,
    "work_orders:view": EVERYONE,
    "work_orders:create": STAFF,
    "work_orders:assign": MANAGERS,
    "work_orders:update": STAFF,
    "inspections:view": EVERYONE,
    "inspections:schedule": MANAGERS,
    "inspections:conduct": STAFF,
    "lost_found:view": EVERYONE,
    "lost_found:report": EVERYONE,
    "lost_found:review": STAFF,
    "assets:view": EVERYONE,
    "assets:manage": STAFF,
    "users:view": MANAGERS,
    "users:manage": ADMINS,
    "analytics:view": MANAGERS,
    "analytics:simulate": MANAGERS,
    "admin:sla": MANAGERS,
    "admin:audit": ADMINS,
    "admin:campus_config": ADMINS,
    "notifications:manage": MANAGERS,
}


async def ensure_seeded(db: AsyncSession) -> None:
    """Idempotent, and the two tables are checked independently on purpose:
    `permissions` alone used to be seeded lazily by an admin GET endpoint
    before role-based enforcement existed, so a database can easily have
    permissions rows already while role_permissions is still completely
    empty (confirmed happening on this app's own real database while
    building this). Checking only `permissions` for "already seeded" would
    silently skip populating role_permissions forever on such a database --
    every permission-gated route would then deny every role, permanently.
    Once role_permissions has ANY row, though, this stops touching it, so
    an admin's own edits in Admin > Roles are never overwritten on restart.
    """
    by_code: dict[str, Permission] = {
        p.code: p for p in (await db.scalars(select(Permission))).all()
    }
    for module, action, description in PERMISSION_CATALOGUE:
        code = f"{module}:{action}"
        if code in by_code:
            continue
        p = Permission(code=code, module=module, description=description)
        db.add(p)
        by_code[code] = p
    await db.flush()

    if await db.scalar(select(RolePermission.role).limit(1)):
        await db.commit()
        return

    for code, roles in PERMISSION_ROLE_DEFAULTS.items():
        perm = by_code.get(code)
        if perm is None:
            continue
        for role in roles:
            db.add(RolePermission(role=role, permission_id=perm.id))
    await db.flush()
    await db.commit()
