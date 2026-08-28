"""Python mirrors of the PostgreSQL enum types defined in database/migrations."""
from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:  # so f-strings render the value, not 'Class.MEMBER'
        return self.value


class UserRole(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    TECHNICIAN = "technician"
    FACILITY_MANAGER = "facility_manager"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class UserStatus(StrEnum):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"


class AssetState(StrEnum):
    """Drives the marker colour on the Digital Twin floor plan."""
    HEALTHY = "healthy"                        # green
    WARNING = "warning"                        # amber
    FAULT = "fault"                            # red
    UNDER_MAINTENANCE = "under_maintenance"    # blue
    INSPECTION_REQUIRED = "inspection_required"  # purple
    DECOMMISSIONED = "decommissioned"          # grey


class RoomKind(StrEnum):
    CLASSROOM = "classroom"
    LECTURE_HALL = "lecture_hall"
    LABORATORY = "laboratory"
    OFFICE = "office"
    LIBRARY = "library"
    WASHROOM = "washroom"
    CORRIDOR = "corridor"
    CAFETERIA = "cafeteria"
    AUDITORIUM = "auditorium"
    HOSTEL_ROOM = "hostel_room"
    SERVER_ROOM = "server_room"
    STORE = "store"
    UTILITY = "utility"
    OTHER = "other"


class IssueStatus(StrEnum):
    REPORTED = "reported"
    TRIAGED = "triaged"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    RESOLVED = "resolved"
    VERIFIED = "verified"
    CLOSED = "closed"
    REJECTED = "rejected"
    DUPLICATE = "duplicate"


class Priority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkOrderStatus(StrEnum):
    DRAFT = "draft"
    OPEN = "open"
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    AWAITING_PARTS = "awaiting_parts"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    VERIFIED = "verified"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class InspectionStatus(StrEnum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class ChecklistResult(StrEnum):
    PASS = "pass"
    FAIL = "fail"
    NA = "na"
    NEEDS_ATTENTION = "needs_attention"


class LFKind(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LFStatus(StrEnum):
    OPEN = "open"
    MATCHED = "matched"
    CLAIM_PENDING = "claim_pending"
    CLAIMED = "claimed"
    RETURNED = "returned"
    ARCHIVED = "archived"
    EXPIRED = "expired"


class ClaimStatus(StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    COLLECTED = "collected"


class MatchStatus(StrEnum):
    SUGGESTED = "suggested"
    NOTIFIED = "notified"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class TwinEventKind(StrEnum):
    ASSET_STATE_CHANGED = "asset_state_changed"
    ISSUE_CREATED = "issue_created"
    ISSUE_STATUS_CHANGED = "issue_status_changed"
    WORK_ORDER_CREATED = "work_order_created"
    WORK_ORDER_STATUS_CHANGED = "work_order_status_changed"
    INSPECTION_SUBMITTED = "inspection_submitted"
    SLA_BREACHED = "sla_breached"
    ASSET_CREATED = "asset_created"
    ASSET_MOVED = "asset_moved"
    SIMULATION = "simulation"


class NotificationChannel(StrEnum):
    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"
    SMS = "sms"


# ---------- state machines ----------
# Encoded once here so the API, the UI and the tests agree on what is legal.
ISSUE_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.REPORTED:    {IssueStatus.TRIAGED, IssueStatus.ASSIGNED, IssueStatus.REJECTED, IssueStatus.DUPLICATE},
    IssueStatus.TRIAGED:     {IssueStatus.ASSIGNED, IssueStatus.REJECTED, IssueStatus.DUPLICATE},
    IssueStatus.ASSIGNED:    {IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD, IssueStatus.TRIAGED},
    IssueStatus.IN_PROGRESS: {IssueStatus.RESOLVED, IssueStatus.ON_HOLD},
    IssueStatus.ON_HOLD:     {IssueStatus.IN_PROGRESS, IssueStatus.ASSIGNED},
    IssueStatus.RESOLVED:    {IssueStatus.VERIFIED, IssueStatus.IN_PROGRESS},  # reopen if the fix failed
    IssueStatus.VERIFIED:    {IssueStatus.CLOSED},
    IssueStatus.CLOSED:      set(),
    IssueStatus.REJECTED:    set(),
    IssueStatus.DUPLICATE:   set(),
}

WORK_ORDER_TRANSITIONS: dict[WorkOrderStatus, set[WorkOrderStatus]] = {
    WorkOrderStatus.DRAFT:          {WorkOrderStatus.OPEN, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.OPEN:           {WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.ASSIGNED:       {WorkOrderStatus.ACCEPTED, WorkOrderStatus.OPEN, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.ACCEPTED:       {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD, WorkOrderStatus.OPEN},
    WorkOrderStatus.IN_PROGRESS:    {WorkOrderStatus.COMPLETED, WorkOrderStatus.AWAITING_PARTS, WorkOrderStatus.ON_HOLD},
    WorkOrderStatus.AWAITING_PARTS: {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.ON_HOLD:        {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.OPEN, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.COMPLETED:      {WorkOrderStatus.VERIFIED, WorkOrderStatus.IN_PROGRESS},
    WorkOrderStatus.VERIFIED:       {WorkOrderStatus.CLOSED},
    WorkOrderStatus.CLOSED:         set(),
    WorkOrderStatus.CANCELLED:      set(),
}


def can_transition(current, target, table) -> bool:
    return target in table.get(current, set())
