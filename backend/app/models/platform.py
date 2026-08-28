"""Notifications, AI observability, predictions, simulations and audit."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    ARRAY, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.enums import NotificationChannel
from app.models.base import TimestampMixin, uuid_pk


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    # Frontend route to open on click, e.g. /issues/<id>
    link: Mapped[Optional[str]] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text, default="info", nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(Text)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    __table_args__ = (UniqueConstraint("organization_id", "code", "channel"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AIInvocation(TimestampMixin, Base):
    """Every model call is logged so the AI dashboards show real numbers."""
    __tablename__ = "ai_invocations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE")
    )
    task: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(Text)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    succeeded: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # True when the deterministic fallback ran because the LLM was unreachable.
    used_fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text)


class AIFeedback(TimestampMixin, Base):
    """Human verdict on an AI output — ground truth for the accuracy screens."""
    __tablename__ = "ai_feedback"

    id: Mapped[uuid.UUID] = uuid_pk()
    task: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    was_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    corrected_to: Mapped[Optional[dict]] = mapped_column(JSONB)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class AIConversation(TimestampMixin, Base):
    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(Text)


class AIMessage(TimestampMixin, Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Which DB lookups the assistant ran to produce this answer.
    tool_calls: Mapped[Optional[dict]] = mapped_column(JSONB)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))


class AIKnowledge(TimestampMixin, Base):
    __tablename__ = "ai_knowledge"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class MaintenancePrediction(TimestampMixin, Base):
    __tablename__ = "maintenance_predictions"

    id: Mapped[uuid.UUID] = uuid_pk()
    asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    predicted_for: Mapped[date] = mapped_column(Date, nullable=False)
    risk_score: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    reasoning: Mapped[Optional[str]] = mapped_column(Text)
    # {age_months, fault_count, mtbf_days, warranty_expired}
    signals: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL")
    )
    dismissed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Simulation(TimestampMixin, Base):
    __tablename__ = "simulations"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("campuses.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    scenario_type: Mapped[str] = mapped_column(Text, default="complaint_surge", nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="draft", nullable=False)
    # Department fan-out, technician load and SLA projection.
    results: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE")
    )
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(Text)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    before: Mapped[Optional[dict]] = mapped_column(JSONB)
    after: Mapped[Optional[dict]] = mapped_column(JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)


class LoginActivity(TimestampMixin, Base):
    __tablename__ = "login_activity"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    email: Mapped[Optional[str]] = mapped_column(Text)
    succeeded: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
