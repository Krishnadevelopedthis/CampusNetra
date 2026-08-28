"""Importing this package registers every model on the shared Base metadata."""
from app.models.identity import (  # noqa: F401
    Department, Organization, Permission, RefreshToken, RolePermission, User,
    UserPermissionOverride, VerificationCode,
)
from app.models.spatial import (  # noqa: F401
    Asset, AssetCategory, AssetStateHistory, Building, Campus, Floor, Room, TwinEvent,
)
from app.models.issues import (  # noqa: F401
    Issue, IssueAttachment, IssueCategory, IssueDuplicateCandidate, IssueEvent, IssueUpvote,
)
from app.models.work import (  # noqa: F401
    Inspection, InspectionResult, InspectionTemplate, InspectionTemplateItem,
    PartRequest, SLAPolicy, WorkOrder, WorkOrderAttachment, WorkOrderComment, WorkOrderEvent,
)
from app.models.lostfound import (  # noqa: F401
    LFAttachment, LFCategory, LFClaim, LFItem, LFMatch,
)
from app.models.platform import (  # noqa: F401
    AIConversation, AIFeedback, AIInvocation, AIKnowledge, AIMessage, AuditLog,
    LoginActivity, MaintenancePrediction, Notification, NotificationTemplate, Simulation,
)

__all__ = [n for n in dir() if not n.startswith("_")]
