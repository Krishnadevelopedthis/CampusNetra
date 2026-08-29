"""Administration: users, roles, campus configuration, SLA, audit, predictive."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select

from app.api.deps import DB, CurrentUser, Paging, RequireAdmin, RequireManager, client_ip
from app.core.config import settings
from app.core.enums import Priority, UserRole, UserStatus
from app.core.security import hash_password
from app.models.identity import (
    AcademicProgramme, Department, Organization, Permission, RolePermission, User,
)
from app.models.issues import Issue, IssueCategory
from app.models.platform import AuditLog, LoginActivity, MaintenancePrediction
from app.models.spatial import Asset, AssetCategory, Building, Campus, Floor, Room
from app.models.work import SLAPolicy, WorkOrder
from app.schemas.auth import UserOut, validate_password
from app.schemas.common import Message, Page, UserBrief
from app.services import predictive
from app.services.audit import record_audit
from app.services.work_orders import create_work_order

router = APIRouter(prefix="/admin", tags=["Administration"])


# ---------------- Users ----------------
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole
    password: str
    phone: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    employee_id: Optional[str] = None
    enrollment_no: Optional[str] = None
    designation: Optional[str] = None
    specialization: Optional[list[str]] = None
    programme_id: Optional[uuid.UUID] = None
    academic_year: Optional[int] = Field(None, ge=1, le=10)

    @classmethod
    def __get_validators__(cls):  # pragma: no cover - pydantic v2 uses field_validator
        yield from ()


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    department_id: Optional[uuid.UUID] = None
    designation: Optional[str] = None
    specialization: Optional[list[str]] = None
    # A student's course, distinct from the maintenance department above.
    programme_id: Optional[uuid.UUID] = None
    academic_year: Optional[int] = Field(None, ge=1, le=10)


class ProgrammeUpsert(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=1, max_length=20)
    level: Optional[str] = Field(None, max_length=40)
    duration_years: Optional[float] = Field(None, gt=0, le=10)
    is_active: bool = True


@router.get("/users", response_model=Page[UserOut])
async def list_users(
    user: RequireManager, db: DB, paging: Paging,
    role: Optional[UserRole] = None,
    status_filter: Optional[UserStatus] = Query(None, alias="status"),
    department_id: Optional[uuid.UUID] = None,
    q: Optional[str] = None,
):
    query = select(User).where(User.organization_id == user.organization_id)
    if role:
        query = query.where(User.role == role)
    if status_filter:
        query = query.where(User.status == status_filter)
    if department_id:
        query = query.where(User.department_id == department_id)
    if q:
        like = f"%{q}%"
        query = query.where(or_(
            User.full_name.ilike(like), User.email.ilike(like),
            User.employee_id.ilike(like), User.enrollment_no.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (await db.scalars(
        query.order_by(User.full_name).offset(paging.offset).limit(paging.limit))).all()
    return Page[UserOut](items=[UserOut.model_validate(u) for u in rows],
                         total=total, page=paging.page, page_size=paging.page_size)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, admin: RequireAdmin, db: DB, request: Request):
    """Provision an account directly. This is the only path to elevated roles."""
    try:
        validate_password(payload.password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    if payload.role == UserRole.SUPER_ADMIN and admin.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super admin can create another super admin")

    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered")

    new_user = User(
        organization_id=admin.organization_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        phone=payload.phone,
        department_id=payload.department_id,
        employee_id=payload.employee_id,
        enrollment_no=payload.enrollment_no,
        designation=payload.designation,
        specialization=payload.specialization,
        # Admin-provisioned accounts skip email verification.
        status=UserStatus.ACTIVE,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    await db.flush()

    await record_audit(
        db, action="user.create", actor_id=admin.id,
        organization_id=admin.organization_id, entity_type="user", entity_id=new_user.id,
        after={"email": new_user.email, "role": new_user.role.value},
        ip_address=client_ip(request),
    )
    return UserOut.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID, payload: UserUpdate, admin: RequireAdmin, db: DB, request: Request
):
    target = await db.scalar(select(User).where(User.id == user_id))
    if target is None or target.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # An admin must not be able to strip the last super admin, or demote themselves
    # out of the ability to undo it.
    if target.id == admin.id and payload.role and payload.role != admin.role:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "You cannot change your own role")
    if target.role == UserRole.SUPER_ADMIN and admin.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super admin can modify another super admin")

    before = {"role": target.role.value, "status": target.status.value}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    await db.flush()

    await record_audit(
        db, action="user.update", actor_id=admin.id,
        organization_id=admin.organization_id, entity_type="user", entity_id=target.id,
        before=before, after={"role": target.role.value, "status": target.status.value},
        ip_address=client_ip(request),
    )
    return UserOut.model_validate(target)


@router.post("/users/{user_id}/deactivate", response_model=Message)
async def deactivate_user(
    user_id: uuid.UUID, admin: RequireAdmin, db: DB, request: Request
):
    """Deactivate rather than delete — complaints reference their reporter."""
    target = await db.scalar(select(User).where(User.id == user_id))
    if target is None or target.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate yourself")

    open_work = await db.scalar(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.assigned_to == target.id,
            WorkOrder.status.notin_(["closed", "cancelled", "verified"]))) or 0
    if open_work:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{target.full_name} still has {open_work} open work order(s). Reassign them first.")

    target.status = UserStatus.DEACTIVATED
    from app.services.auth import revoke_all_tokens
    await revoke_all_tokens(db, target.id)

    await record_audit(
        db, action="user.deactivate", actor_id=admin.id,
        organization_id=admin.organization_id, entity_type="user", entity_id=target.id,
        ip_address=client_ip(request),
    )
    return Message(detail=f"{target.full_name} deactivated and signed out everywhere.")


# ---------------- Departments & roles ----------------
@router.get("/departments", response_model=list[dict])
async def list_departments(user: CurrentUser, db: DB):
    rows = (await db.execute(
        select(Department, func.count(User.id))
        .join(User, User.department_id == Department.id, isouter=True)
        .where(Department.organization_id == user.organization_id)
        .group_by(Department.id).order_by(Department.name))).all()
    return [
        {"id": str(d.id), "name": d.name, "code": d.code, "description": d.description,
         "email": d.email, "is_active": d.is_active, "member_count": n}
        for d, n in rows
    ]


@router.get("/roles", response_model=list[dict])
async def list_roles(user: RequireManager, db: DB):
    """Role roster with headcount and the permissions each role carries."""
    counts = dict((await db.execute(
        select(User.role, func.count()).where(User.organization_id == user.organization_id)
        .group_by(User.role))).all())

    perms = (await db.execute(
        select(RolePermission.role, Permission.code, Permission.module)
        .join(Permission, Permission.id == RolePermission.permission_id))).all()
    by_role: dict = {}
    for role, code, module in perms:
        by_role.setdefault(role, []).append({"code": code, "module": module})

    return [
        {"role": r.value,
         "label": r.value.replace("_", " ").title(),
         "user_count": counts.get(r, 0),
         "permissions": by_role.get(r, [])}
        for r in UserRole
    ]


@router.get("/permissions", response_model=list[dict])
async def list_permissions(user: RequireManager, db: DB):
    rows = (await db.scalars(select(Permission).order_by(Permission.module, Permission.code))).all()
    return [{"id": str(p.id), "code": p.code, "module": p.module,
             "description": p.description} for p in rows]


# ---------------- Configuration ----------------
@router.get("/issue-categories", response_model=list[dict])
async def issue_config(user: RequireManager, db: DB):
    rows = (await db.execute(
        select(IssueCategory, Department.name, func.count(Issue.id))
        .join(Department, Department.id == IssueCategory.department_id, isouter=True)
        .join(Issue, Issue.category_id == IssueCategory.id, isouter=True)
        .where(IssueCategory.organization_id == user.organization_id)
        .group_by(IssueCategory.id, Department.name)
        .order_by(IssueCategory.name))).all()
    return [
        {"id": str(c.id), "name": c.name, "code": c.code, "icon": c.icon,
         "department": dept, "default_priority": c.default_priority.value,
         "keywords": c.keywords, "sla_response_mins": c.sla_response_mins,
         "sla_resolve_mins": c.sla_resolve_mins, "is_active": c.is_active,
         "issue_count": n}
        for c, dept, n in rows
    ]


class SLAUpdate(BaseModel):
    response_mins: int = Field(ge=1)
    resolve_mins: int = Field(ge=1)
    escalate_after_mins: Optional[int] = Field(None, ge=1)


@router.get("/sla", response_model=list[dict])
async def list_sla(user: RequireManager, db: DB):
    rows = (await db.execute(
        select(SLAPolicy, Department.name)
        .join(Department, Department.id == SLAPolicy.department_id, isouter=True)
        .where(SLAPolicy.organization_id == user.organization_id,
               SLAPolicy.is_active.is_(True))
        .order_by(SLAPolicy.priority.desc()))).all()

    out = []
    for p, dept in rows:
        breached = await db.scalar(
            select(func.count()).select_from(Issue).where(
                Issue.organization_id == user.organization_id,
                Issue.priority == p.priority, Issue.sla_breached.is_(True))) or 0
        total = await db.scalar(
            select(func.count()).select_from(Issue).where(
                Issue.organization_id == user.organization_id,
                Issue.priority == p.priority)) or 0
        out.append({
            "id": str(p.id), "name": p.name, "priority": p.priority.value,
            "department": dept, "response_mins": p.response_mins,
            "resolve_mins": p.resolve_mins,
            "escalate_after_mins": p.escalate_after_mins,
            "escalate_to_role": p.escalate_to_role.value if p.escalate_to_role else None,
            "issues_at_priority": total, "breached": breached,
            "compliance_pct": round(100 * (1 - breached / total), 1) if total else 100.0,
        })
    return out


@router.patch("/sla/{policy_id}", response_model=Message)
async def update_sla(
    policy_id: uuid.UUID, payload: SLAUpdate, admin: RequireAdmin, db: DB, request: Request
):
    policy = await db.scalar(select(SLAPolicy).where(SLAPolicy.id == policy_id))
    if policy is None or policy.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SLA policy not found")
    if payload.response_mins > payload.resolve_mins:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Response time cannot exceed resolution time")

    before = {"response_mins": policy.response_mins, "resolve_mins": policy.resolve_mins}
    policy.response_mins = payload.response_mins
    policy.resolve_mins = payload.resolve_mins
    policy.escalate_after_mins = payload.escalate_after_mins

    await record_audit(
        db, action="sla.update", actor_id=admin.id,
        organization_id=admin.organization_id, entity_type="sla_policy", entity_id=policy.id,
        before=before, after=payload.model_dump(), ip_address=client_ip(request),
    )
    return Message(detail=f"{policy.name} updated.")


# ---------------- Inspection templates ----------------
class ChecklistItemIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=300)
    help_text: Optional[str] = None
    requires_photo: bool = False
    # A failing critical item auto-raises a routed, high-priority issue.
    is_critical: bool = False


class TemplateUpsert(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = None
    frequency_days: Optional[int] = Field(None, ge=1, le=3650)
    items: list[ChecklistItemIn] = Field(min_length=1)


@router.post("/inspection-templates", response_model=dict, status_code=201)
async def create_template(payload: TemplateUpsert, user: RequireManager, db: DB):
    from app.models.work import InspectionTemplate, InspectionTemplateItem

    template = InspectionTemplate(
        organization_id=user.organization_id,
        name=payload.name, description=payload.description,
        frequency_days=payload.frequency_days,
    )
    db.add(template)
    await db.flush()

    for position, item in enumerate(payload.items, start=1):
        db.add(InspectionTemplateItem(
            template_id=template.id, position=position, **item.model_dump()))

    await db.flush()
    return {"id": str(template.id), "name": template.name,
            "items": len(payload.items)}


@router.patch("/inspection-templates/{template_id}", response_model=dict)
async def update_template(
    template_id: uuid.UUID, payload: TemplateUpsert, user: RequireManager, db: DB
):
    """Replace a template's checklist.

    Items are rewritten rather than diffed. Submitted inspections snapshot the
    prompt text they were answered against, so past results stay readable even
    though the template they came from has changed.
    """
    from app.models.work import InspectionTemplate, InspectionTemplateItem

    template = await db.scalar(
        select(InspectionTemplate).where(
            InspectionTemplate.id == template_id,
            InspectionTemplate.organization_id == user.organization_id))
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")

    template.name = payload.name
    template.description = payload.description
    template.frequency_days = payload.frequency_days

    await db.execute(
        InspectionTemplateItem.__table__.delete()
        .where(InspectionTemplateItem.template_id == template_id))
    for position, item in enumerate(payload.items, start=1):
        db.add(InspectionTemplateItem(
            template_id=template_id, position=position, **item.model_dump()))

    await db.flush()
    return {"id": str(template.id), "name": template.name, "items": len(payload.items)}


@router.delete("/inspection-templates/{template_id}", response_model=Message)
async def deactivate_template(template_id: uuid.UUID, user: RequireManager, db: DB):
    """Deactivate rather than delete — submitted inspections reference it."""
    from app.models.work import Inspection, InspectionTemplate

    template = await db.scalar(
        select(InspectionTemplate).where(
            InspectionTemplate.id == template_id,
            InspectionTemplate.organization_id == user.organization_id))
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")

    scheduled = await db.scalar(
        select(func.count()).select_from(Inspection).where(
            Inspection.template_id == template_id,
            Inspection.status.in_(["scheduled", "in_progress", "overdue"]))) or 0
    if scheduled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{scheduled} inspection(s) still use this template. Complete or cancel them first.")

    template.is_active = False
    return Message(detail=f"{template.name} deactivated.")


# ---------------- Notification templates ----------------
class NotificationTemplateUpsert(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    channel: str = Field(pattern="^(in_app|email|push|sms)$")
    subject: Optional[str] = None
    body: str = Field(min_length=1, max_length=4000)
    is_active: bool = True


# The placeholders each notification code can substitute. Surfacing these lets
# the editor validate a template instead of failing silently at send time.
NOTIFICATION_CODES: dict[str, list[str]] = {
    "issue.created":     ["reference", "title", "location", "priority", "reporter"],
    "issue.assigned":    ["reference", "title", "technician", "department"],
    "issue.resolved":    ["reference", "title", "resolution"],
    "workorder.assigned": ["reference", "title", "priority", "due"],
    "inspection.due":    ["reference", "template", "room", "due"],
    "lf.match_found":    ["reference", "title", "score"],
    "lf.claim_decision": ["reference", "title", "decision", "reason"],
    "sla.breached":      ["reference", "title", "department", "overdue_by"],
}


@router.get("/notification-templates", response_model=dict)
async def list_notification_templates(user: RequireManager, db: DB):
    from app.models.platform import NotificationTemplate

    rows = (await db.scalars(
        select(NotificationTemplate)
        .where(NotificationTemplate.organization_id == user.organization_id)
        .order_by(NotificationTemplate.code))).all()

    return {
        "templates": [
            {"id": str(t.id), "code": t.code, "channel": t.channel,
             "subject": t.subject, "body": t.body, "is_active": t.is_active}
            for t in rows
        ],
        "available_codes": [
            {"code": code, "placeholders": fields} for code, fields in NOTIFICATION_CODES.items()
        ],
    }


@router.put("/notification-templates", response_model=Message)
async def upsert_notification_template(
    payload: NotificationTemplateUpsert, user: RequireManager, db: DB
):
    from app.models.platform import NotificationTemplate

    known = NOTIFICATION_CODES.get(payload.code)
    if known is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unknown notification code. Valid codes: {', '.join(sorted(NOTIFICATION_CODES))}")

    # Catch typos in placeholders now, rather than shipping a message with a
    # literal {{recipent}} in it.
    used = set(re.findall(r"\{\{\s*(\w+)\s*\}\}", f"{payload.subject or ''} {payload.body}"))
    unknown = sorted(used - set(known))
    if unknown:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unknown placeholder(s) for {payload.code}: {', '.join('{{' + u + '}}' for u in unknown)}. "
            f"Available: {', '.join('{{' + k + '}}' for k in known)}")

    existing = await db.scalar(
        select(NotificationTemplate).where(
            NotificationTemplate.organization_id == user.organization_id,
            NotificationTemplate.code == payload.code,
            NotificationTemplate.channel == payload.channel))

    if existing is not None:
        existing.subject = payload.subject
        existing.body = payload.body
        existing.is_active = payload.is_active
        return Message(detail=f"{payload.code} ({payload.channel}) updated.")

    db.add(NotificationTemplate(
        organization_id=user.organization_id, **payload.model_dump()))
    return Message(detail=f"{payload.code} ({payload.channel}) created.")


# ---------------- Audit & security ----------------
@router.get("/audit", response_model=Page[dict])
async def audit_logs(
    admin: RequireAdmin, db: DB, paging: Paging,
    action: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
):
    query = select(AuditLog).where(AuditLog.organization_id == admin.organization_id)
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (await db.scalars(
        query.order_by(AuditLog.created_at.desc())
        .offset(paging.offset).limit(paging.limit))).all()

    actor_ids = {r.actor_id for r in rows if r.actor_id}
    actors = {u.id: u.full_name for u in (await db.scalars(
        select(User).where(User.id.in_(actor_ids)))).all()} if actor_ids else {}

    return Page[dict](
        items=[
            {"id": r.id, "action": r.action, "actor": actors.get(r.actor_id, "System"),
             "entity_type": r.entity_type,
             "entity_id": str(r.entity_id) if r.entity_id else None,
             "before": r.before, "after": r.after,
             "ip_address": str(r.ip_address) if r.ip_address else None,
             "created_at": r.created_at.isoformat()}
            for r in rows
        ],
        total=total, page=paging.page, page_size=paging.page_size,
    )


@router.get("/login-activity", response_model=list[dict])
async def login_activity(
    admin: RequireAdmin, db: DB,
    limit: int = Query(50, ge=1, le=200),
    failed_only: bool = Query(False),
):
    query = select(LoginActivity)
    if failed_only:
        query = query.where(LoginActivity.succeeded.is_(False))

    rows = (await db.scalars(
        query.order_by(LoginActivity.created_at.desc()).limit(limit))).all()
    return [
        {"id": r.id, "email": r.email, "succeeded": r.succeeded,
         "failure_reason": r.failure_reason,
         "ip_address": str(r.ip_address) if r.ip_address else None,
         "created_at": r.created_at.isoformat()}
        for r in rows
    ]


# ---------------- Work order configuration ----------------
@router.get("/workorder-config", response_model=dict)
async def workorder_config(user: RequireManager, db: DB):
    """How work orders actually flow, measured rather than declared.

    The status machine is fixed in code; what varies is where work piles up and
    who it lands on. Showing live counts against each state makes the
    configuration screen useful rather than a static diagram.
    """
    from app.core.enums import WORK_ORDER_TRANSITIONS, WorkOrderStatus
    from app.models.work import WorkOrder

    counts = dict((await db.execute(
        select(WorkOrder.status, func.count())
        .where(WorkOrder.organization_id == user.organization_id)
        .group_by(WorkOrder.status))).all())

    by_department = (await db.execute(
        select(Department.name, func.count(WorkOrder.id),
               func.count(WorkOrder.id).filter(WorkOrder.sla_breached.is_(True)),
               func.avg(WorkOrder.actual_mins))
        .select_from(Department)
        .join(WorkOrder, WorkOrder.department_id == Department.id, isouter=True)
        .where(Department.organization_id == user.organization_id)
        .group_by(Department.name))).all()

    technicians = (await db.execute(
        select(User.full_name, Department.name, func.count(WorkOrder.id))
        .select_from(User)
        .join(Department, Department.id == User.department_id, isouter=True)
        .join(WorkOrder, (WorkOrder.assigned_to == User.id)
              & (WorkOrder.status.notin_(["closed", "cancelled", "verified"])), isouter=True)
        .where(User.organization_id == user.organization_id,
               User.role == UserRole.TECHNICIAN, User.status == "active")
        .group_by(User.full_name, Department.name)
        .order_by(func.count(WorkOrder.id).desc()))).all()

    return {
        "statuses": [
            {
                "status": st.value,
                "count": counts.get(st, 0),
                "allowed_next": sorted(s.value for s in WORK_ORDER_TRANSITIONS.get(st, set())),
                "terminal": not WORK_ORDER_TRANSITIONS.get(st),
            }
            for st in WorkOrderStatus
        ],
        "by_department": [
            {"department": name, "total": total, "breached": breached,
             "avg_minutes": round(float(avg)) if avg else None}
            for name, total, breached, avg in by_department
        ],
        "technician_load": [
            {"name": name, "department": dept, "open_work_orders": count}
            for name, dept, count in technicians
        ],
    }


# ---------------- Digital twin configuration ----------------
@router.get("/twin-config", response_model=dict)
async def twin_config(user: RequireManager, db: DB):
    """Spatial data health: what is mapped, and what would be invisible."""
    from app.models.spatial import Asset, Building, Campus, Floor, Room
    from app.services.twin import STATE_COLOURS, STATE_LABELS
    from app.core.enums import AssetState

    campus_ids = (await db.scalars(
        select(Campus.id).where(Campus.organization_id == user.organization_id))).all()

    floors = (await db.execute(
        select(Building.code, Building.name, Floor.id, Floor.name, Floor.level,
               Floor.floor_plan_url, func.count(Room.id))
        .select_from(Floor)
        .join(Building, Building.id == Floor.building_id)
        .join(Room, Room.floor_id == Floor.id, isouter=True)
        .where(Building.campus_id.in_(campus_ids))
        .group_by(Building.code, Building.name, Floor.id, Floor.name,
                  Floor.level, Floor.floor_plan_url)
        .order_by(Building.code, Floor.level))).all()

    # A room without a boundary, or an asset without a position, exists in the
    # database but cannot be drawn — these are the gaps worth surfacing.
    rooms_total = await db.scalar(
        select(func.count(Room.id)).select_from(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id.in_(campus_ids))) or 0
    rooms_unmapped = await db.scalar(
        select(func.count(Room.id)).select_from(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id.in_(campus_ids), Room.boundary.is_(None))) or 0

    assets_total = await db.scalar(
        select(func.count(Asset.id)).select_from(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id.in_(campus_ids))) or 0
    assets_unplaced = await db.scalar(
        select(func.count(Asset.id)).select_from(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id.in_(campus_ids), Asset.pos_x.is_(None))) or 0

    orphan_assets = await db.scalar(
        select(func.count()).select_from(Asset).where(Asset.room_id.is_(None))) or 0

    buildings_unpositioned = await db.scalar(
        select(func.count()).select_from(Building)
        .where(Building.campus_id.in_(campus_ids), Building.map_x.is_(None))) or 0

    return {
        "legend": [
            {"state": s.value, "colour": STATE_COLOURS[s.value], "label": STATE_LABELS[s.value]}
            for s in AssetState
        ],
        "coverage": {
            "rooms_total": rooms_total,
            "rooms_unmapped": rooms_unmapped,
            "rooms_mapped_pct": round(100 * (rooms_total - rooms_unmapped) / rooms_total, 1) if rooms_total else 0,
            "assets_total": assets_total,
            "assets_unplaced": assets_unplaced,
            "assets_placed_pct": round(100 * (assets_total - assets_unplaced) / assets_total, 1) if assets_total else 0,
            "orphan_assets": orphan_assets,
            "buildings_unpositioned": buildings_unpositioned,
        },
        "floors": [
            {"building_code": bcode, "building": bname, "floor_id": str(fid),
             "floor": fname, "level": level,
             "has_plan_image": plan is not None, "rooms": rooms}
            for bcode, bname, fid, fname, level, plan, rooms in floors
        ],
    }


# ---------------- Predictive maintenance ----------------
@router.get("/predictive", response_model=dict)
async def predictive_forecast(
    user: RequireManager, db: DB,
    limit: int = Query(20, ge=1, le=100),
    min_risk: float = Query(0.55, ge=0, le=1),
):
    """Rank assets by predicted failure risk, with the reasons behind each score."""
    predictions = await predictive.forecast(
        db, user.organization_id, limit=limit, min_risk=min_risk)
    await predictive.persist_predictions(db, user.organization_id, predictions)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "threshold": min_risk,
        "model": "interpretable-v1",
        "weights": {
            "fault_history": predictive.W_FAULTS, "age": predictive.W_AGE,
            "service_overdue": predictive.W_SERVICE, "mtbf": predictive.W_MTBF,
            "warranty": predictive.W_WARRANTY,
        },
        "predictions": predictions,
        "summary": {
            "high_risk": sum(1 for p in predictions if p["risk_band"] == "high"),
            "medium_risk": sum(1 for p in predictions if p["risk_band"] == "medium"),
            "already_scheduled": sum(1 for p in predictions if p["existing_work_order"]),
        },
    }


class PreventiveWORequest(BaseModel):
    asset_id: uuid.UUID
    note: Optional[str] = None


@router.post("/predictive/work-order", response_model=dict, status_code=201)
async def raise_preventive_work_order(
    payload: PreventiveWORequest, user: RequireManager, db: DB
):
    """Turn a prediction into a scheduled preventive job."""
    asset = await db.scalar(select(Asset).where(Asset.id == payload.asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    existing = await db.scalar(
        select(WorkOrder.reference).where(
            WorkOrder.asset_id == asset.id, WorkOrder.is_predictive.is_(True),
            WorkOrder.status.notin_(["closed", "cancelled"])).limit(1))
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A preventive work order ({existing}) is already open for {asset.tag}")

    risk, signals, reasons = await predictive.score_asset(db, asset)
    category = await db.scalar(
        select(AssetCategory).where(AssetCategory.id == asset.category_id))

    wo = await create_work_order(
        db, user,
        title=f"Preventive maintenance — {asset.name}",
        description=(
            f"Raised from the predictive maintenance forecast "
            f"(risk {round(risk * 100)}%).\n\n"
            f"Signals: {'; '.join(reasons)}.\n\n"
            + (payload.note or "")
        ).strip(),
        asset_id=asset.id, room_id=asset.room_id,
        department_id=category.default_department_id if category else None,
        priority=Priority.HIGH if risk >= 0.75 else Priority.MEDIUM,
        scheduled_for=datetime.now(timezone.utc) + timedelta(days=max(3, int(30 * (1 - risk)))),
        is_predictive=True,
    )
    await db.flush()

    # Link the prediction to the job it produced.
    prediction = await db.scalar(
        select(MaintenancePrediction).where(
            MaintenancePrediction.asset_id == asset.id,
            MaintenancePrediction.work_order_id.is_(None))
        .order_by(MaintenancePrediction.created_at.desc()).limit(1))
    if prediction:
        prediction.work_order_id = wo.id

    return {"id": str(wo.id), "reference": wo.reference,
            "message": f"{wo.reference} scheduled for {asset.tag} (risk {round(risk * 100)}%)."}


# ---------------- Email delivery diagnostics ----------------

@router.get("/email/status", response_model=dict)
async def email_status(admin: RequireAdmin):
    """Whether outgoing mail is actually working, and if not, why.

    Configuration alone proves nothing: a key can be present but rejected, and
    a sender address can be set but unverified with the provider — both of
    which look exactly like "configured" from the outside while every message
    silently fails. This verifies the credential against the provider and
    reports the sender it would send as. The key itself is never returned.
    """
    from app.services.email import _sender, verify_connection

    _, sender = _sender()
    result = await verify_connection()

    return {
        "provider": settings.email_provider,
        "configured": settings.email_delivers,
        "sender": sender or None,
        "verified": result.delivered,
        "error": result.error,
        "hint": _delivery_hint(settings.email_provider, sender, result),
    }


def _delivery_hint(provider: str, sender: str | None, result) -> str | None:
    """The next thing to try, in the words of whoever has to fix it."""
    if provider == "none":
        return ("No transport is configured. Set RESEND_API_KEY or BREVO_API_KEY "
                "in the environment.")
    if not sender:
        return (f"SMTP_FROM is not a usable address (got {settings.SMTP_FROM!r}). "
                "Set it to 'you@example.com' or 'Campus Netra <you@example.com>' "
                "— with no surrounding quotes when setting it in a hosting dashboard.")
    if not result.delivered:
        return result.error
    if provider in ("brevo", "resend") and sender:
        return (f"Messages are sent as {sender}. If nothing arrives, that address "
                f"must be a verified sender with {provider} — an unverified sender "
                "is accepted by the API and then dropped.")
    return None


@router.post("/email/test", response_model=dict)
async def email_test(admin: RequireAdmin):
    """Send a real test message to the signed-in administrator.

    Deliberately only to the caller's own address: a diagnostic that can be
    pointed at an arbitrary recipient is a way to send mail from someone else's
    domain.
    """
    from app.services.email import send_email

    result = await send_email(
        admin.email,
        subject="Campus Netra — delivery test",
        text=(f"Hello {admin.full_name},\n\n"
              "This is a test from Campus Netra. If you are reading it, outgoing "
              "mail is working and verification codes will reach your users.\n"),
        html=(f"<p>Hello {admin.full_name},</p>"
              "<p>This is a test from Campus Netra. If you are reading it, outgoing "
              "mail is working and verification codes will reach your users.</p>"),
    )
    return {
        "sent": result.delivered,
        "to": admin.email,
        "provider": settings.email_provider,
        "error": result.error,
    }


# ---------------- Academic programmes ----------------

@router.get("/programmes", response_model=list[dict])
async def list_programmes(user: CurrentUser, db: DB, include_inactive: bool = False):
    """Courses students can be enrolled on.

    Distinct from /departments, which is the maintenance org chart complaints
    are routed to — the two must not be offered from one list.
    """
    query = (
        select(AcademicProgramme, func.count(User.id))
        .join(User, User.programme_id == AcademicProgramme.id, isouter=True)
        .where(AcademicProgramme.organization_id == user.organization_id)
        .group_by(AcademicProgramme.id)
        .order_by(AcademicProgramme.name)
    )
    if not include_inactive:
        query = query.where(AcademicProgramme.is_active.is_(True))

    return [
        {
            "id": str(p.id), "name": p.name, "code": p.code, "level": p.level,
            "duration_years": float(p.duration_years) if p.duration_years else None,
            "is_active": p.is_active, "student_count": count,
        }
        for p, count in (await db.execute(query)).all()
    ]


@router.post("/programmes", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_programme(payload: ProgrammeUpsert, admin: RequireAdmin, db: DB):
    clash = await db.scalar(select(AcademicProgramme.id).where(
        AcademicProgramme.organization_id == admin.organization_id,
        AcademicProgramme.code == payload.code))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Programme code {payload.code} already exists.")

    programme = AcademicProgramme(
        organization_id=admin.organization_id, **payload.model_dump())
    db.add(programme)
    await db.flush()
    return {"id": str(programme.id), "name": programme.name, "code": programme.code}


@router.patch("/programmes/{programme_id}", response_model=dict)
async def update_programme(
    programme_id: uuid.UUID, payload: ProgrammeUpsert, admin: RequireAdmin, db: DB
):
    programme = await db.scalar(select(AcademicProgramme).where(
        AcademicProgramme.id == programme_id,
        AcademicProgramme.organization_id == admin.organization_id))
    if programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")

    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] != programme.code:
        clash = await db.scalar(select(AcademicProgramme.id).where(
            AcademicProgramme.organization_id == admin.organization_id,
            AcademicProgramme.code == data["code"],
            AcademicProgramme.id != programme_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Programme code {data['code']} already exists.")

    for field, value in data.items():
        setattr(programme, field, value)
    await db.flush()
    return {"id": str(programme.id), "name": programme.name, "code": programme.code}


@router.delete("/programmes/{programme_id}", response_model=Message)
async def delete_programme(programme_id: uuid.UUID, admin: RequireAdmin, db: DB):
    """Retires a course rather than deleting it, when anyone is enrolled.

    Removing it outright would strip the course from every student who studied
    it, including graduates, so an in-use programme is deactivated instead and
    simply stops being offered.
    """
    programme = await db.scalar(select(AcademicProgramme).where(
        AcademicProgramme.id == programme_id,
        AcademicProgramme.organization_id == admin.organization_id))
    if programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Programme not found")

    enrolled = await db.scalar(select(func.count(User.id)).where(
        User.programme_id == programme_id)) or 0
    if enrolled:
        programme.is_active = False
        return Message(detail=f"{programme.name} retired — {enrolled} student(s) keep it on record.")

    await db.delete(programme)
    return Message(detail=f"{programme.name} removed.")
