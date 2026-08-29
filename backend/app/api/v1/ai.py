"""AI assistant, classification preview, and AI observability."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from app.ai.client import call_text
from app.ai.classifier import classify
from app.api.deps import DB, CurrentUser, RequireManager
from app.core.routing import CommitRoute
from app.core.config import settings
from app.core.enums import AssetState, IssueStatus, UserRole
from app.models.issues import Issue, IssueCategory, IssueDuplicateCandidate
from app.models.lostfound import LFItem, LFMatch
from app.models.platform import AIFeedback, AIInvocation
from app.models.spatial import Asset, Building, Campus, Floor, Room
from app.models.work import WorkOrder
from app.services.issues import load_categories

router = APIRouter(route_class=CommitRoute, prefix="/ai", tags=["AI & Intelligence"])

OPEN_ISSUES = [IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
               IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD]


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None


class ClassifyPreview(BaseModel):
    title: str = Field(min_length=3)
    description: str = Field(min_length=3)


@router.post("/classify-preview", response_model=dict)
async def classify_preview(payload: ClassifyPreview, user: CurrentUser, db: DB):
    """Live classification shown while the reporter is still typing."""
    categories = await load_categories(db, user.organization_id)
    result = await classify(payload.title, payload.description, categories)
    return {
        "category_id": result.category_id,
        "category_code": result.category_code,
        "category_name": next(
            (c["name"] for c in categories if c["id"] == result.category_id), None),
        "department_id": result.department_id,
        "priority": result.priority.value,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "model": result.model,
        "used_fallback": result.used_fallback,
        "alternatives": result.alternatives,
    }


async def _gather_context(db, user) -> str:
    """Read-only facts about this user's campus, given to the model as context.

    Scoped to the caller's own organization — and, for students and teachers,
    to their own reports only.
    """
    org = user.organization_id
    lines: list[str] = []

    if user.role in (UserRole.STUDENT, UserRole.TEACHER):
        mine = (await db.scalars(
            select(Issue).where(Issue.reported_by == user.id)
            .order_by(Issue.created_at.desc()).limit(10))).all()
        lines.append(f"The user has filed {len(mine)} recent report(s):")
        for i in mine:
            lines.append(f"  - {i.reference}: {i.title} [{i.status.value}, {i.priority.value}]")
    else:
        open_count = await db.scalar(
            select(func.count()).select_from(Issue)
            .where(Issue.organization_id == org, Issue.status.in_(OPEN_ISSUES))) or 0
        breached = await db.scalar(
            select(func.count()).select_from(Issue)
            .where(Issue.organization_id == org, Issue.sla_breached.is_(True),
                   Issue.status.in_(OPEN_ISSUES))) or 0
        lines.append(f"Campus currently has {open_count} open issues, {breached} past SLA.")

        faults = (await db.scalars(
            select(Asset).join(Room, Room.id == Asset.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Building, Building.id == Floor.building_id)
            .join(Campus, Campus.id == Building.campus_id)
            .where(Campus.organization_id == org,
                   Asset.state.in_([AssetState.FAULT, AssetState.WARNING]))
            .limit(15))).all()
        if faults:
            lines.append("Assets not healthy right now:")
            for a in faults:
                lines.append(f"  - {a.tag} ({a.name}): {a.state.value}")

        recent = (await db.scalars(
            select(Issue).where(Issue.organization_id == org, Issue.status.in_(OPEN_ISSUES))
            .order_by(Issue.created_at.desc()).limit(10))).all()
        if recent:
            lines.append("Most recent open issues:")
            for i in recent:
                lines.append(f"  - {i.reference}: {i.title} [{i.status.value}, {i.priority.value}]")

    cats = (await db.scalars(
        select(IssueCategory).where(IssueCategory.organization_id == org))).all()
    if cats:
        lines.append("Issue categories available: " + ", ".join(c.name for c in cats))

    return "\n".join(lines)


SYSTEM = """You are the Campus Netra assistant, embedded in a campus facility \
management platform. Answer using ONLY the campus data provided in the context block.

Rules:
- If the context does not contain the answer, say so plainly and suggest where to look \
in the app (e.g. "Track Complaints", "Digital Twin", "Lost & Found").
- Reference IDs exactly as given (CMP-1042, WO-1024, P-101).
- Be concise: two or three sentences unless a list is genuinely clearer.
- Never invent issue references, asset tags, names or numbers."""


@router.post("/assistant", response_model=dict)
async def assistant(payload: AssistantRequest, user: CurrentUser, db: DB):
    """AI Campus Assistant. Degrades to a deterministic summary with no API key."""
    context = await _gather_context(db, user)

    if settings.ai_available:
        reply = await call_text(
            SYSTEM,
            f"Campus context:\n{context}\n\nUser ({user.role.value}) asks: {payload.message}",
            max_tokens=600,
        )
        if reply:
            db.add(AIInvocation(
                organization_id=user.organization_id, task="assistant",
                model=settings.AI_MODEL, confidence=None))
            return {"reply": reply, "confidence": 0.9, "sources": ["campus_data"],
                    "model": settings.AI_MODEL}

    # Fallback: answer from the same context with simple keyword routing, so the
    # assistant stays useful without an API key rather than returning an error.
    q = payload.message.lower()
    if any(w in q for w in ("complaint", "issue", "report", "ticket")):
        reply = ("Here is what I can see for you:\n\n" + context +
                 "\n\nOpen 'Track Complaints' for the full list.")
    elif any(w in q for w in ("asset", "fault", "broken", "twin", "projector", "fan", "ac")):
        reply = ("Current asset status:\n\n" + context +
                 "\n\nThe Digital Twin shows these live on the floor plan.")
    elif any(w in q for w in ("lost", "found", "missing", "bag", "wallet")):
        reply = ("Report a lost or found item under 'Lost & Found'. Campus Netra "
                 "compares image, description, location, category and timing to "
                 "suggest matches automatically, and notifies you above 80% confidence.")
    elif any(w in q for w in ("how", "help", "where", "what")):
        reply = ("You can report an issue with a photo and location — it is classified "
                 "and routed to the right department automatically. Track progress under "
                 "'Track Complaints', and see live campus state under 'Digital Twin'.\n\n" + context)
    else:
        reply = ("I work from live campus data. Here is the current picture:\n\n" + context +
                 "\n\nAsk me about complaints, assets, SLA status or lost property.")

    db.add(AIInvocation(
        organization_id=user.organization_id, task="assistant",
        model="heuristic-v1", used_fallback=True))
    return {"reply": reply, "confidence": 0.55, "sources": ["campus_data"],
            "model": "heuristic-v1"}


@router.get("/review-queue", response_model=dict)
async def review_queue(
    user: RequireManager, db: DB,
    confidence_below: float = Query(0.7, ge=0, le=1),
    limit: int = Query(25, ge=1, le=100),
):
    """Issues where the AI was unsure, and issues flagged as possible duplicates.

    Low confidence is where human review is actually worth someone's time —
    a correction there is also the training signal the accuracy figures come from.
    """
    org = user.organization_id

    # Join the AI's original pick and the issue's current category separately:
    # routing corrections (e.g. from a selected asset) mean they can differ, and a
    # reviewer confirming "correct" needs to see which one they are confirming.
    AiCategory = aliased(IssueCategory)
    CurrentCategory = aliased(IssueCategory)

    uncertain = (await db.execute(
        select(Issue, AiCategory.name, CurrentCategory.name)
        .join(AiCategory, AiCategory.id == Issue.ai_category_id, isouter=True)
        .join(CurrentCategory, CurrentCategory.id == Issue.category_id, isouter=True)
        .where(
            Issue.organization_id == org,
            Issue.ai_classified_at.isnot(None),
            Issue.ai_confidence < confidence_below,
            Issue.was_reclassified.is_(False),
            Issue.status.in_(OPEN_ISSUES),
        )
        .order_by(Issue.ai_confidence.asc())
        .limit(limit)
    )).all()

    dup_rows = (await db.execute(
        select(IssueDuplicateCandidate, Issue)
        .join(Issue, Issue.id == IssueDuplicateCandidate.issue_id)
        .where(
            Issue.organization_id == org,
            IssueDuplicateCandidate.resolution == "pending",
        )
        .order_by(IssueDuplicateCandidate.score.desc())
        .limit(limit)
    )).all()

    master_ids = [c.candidate_id for c, _ in dup_rows]
    masters = {i.id: i for i in (await db.scalars(
        select(Issue).where(Issue.id.in_(master_ids)))).all()} if master_ids else {}

    return {
        "uncertain": [
            {
                "id": str(i.id), "reference": i.reference, "title": i.title,
                "description": i.description[:180],
                "ai_category": ai_name,
                "current_category": current_name,
                "current_category_id": str(i.category_id) if i.category_id else None,
                # True when routing already overrode the text classifier, so the
                # UI can say what is actually in effect.
                "was_rerouted": ai_name != current_name,
                "confidence": float(i.ai_confidence) if i.ai_confidence is not None else None,
                "priority": i.priority.value,
                "reasoning": i.ai_reasoning,
                "model": i.ai_model,
                "created_at": i.created_at.isoformat(),
            }
            for i, ai_name, current_name in uncertain
        ],
        "duplicates": [
            {
                "id": str(c.id),
                "issue_id": str(c.issue_id), "issue_reference": issue.reference,
                "issue_title": issue.title,
                "candidate_id": str(c.candidate_id),
                "candidate_reference": masters[c.candidate_id].reference if c.candidate_id in masters else None,
                "candidate_title": masters[c.candidate_id].title if c.candidate_id in masters else None,
                "score": float(c.score),
                "verdict": "likely" if float(c.score) >= 0.75 else "possible",
                "signals": c.signals or {},
            }
            for c, issue in dup_rows if c.candidate_id in masters
        ],
        "counts": {
            "uncertain": len(uncertain),
            "duplicates": len(dup_rows),
        },
    }


@router.get("/performance", response_model=dict)
async def ai_performance(user: RequireManager, db: DB, days: int = Query(30, ge=1, le=365)):
    """AI Management dashboards: volume, latency, fallback rate and accuracy."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (await db.execute(
        select(AIInvocation.task, func.count(), func.avg(AIInvocation.confidence),
               func.avg(AIInvocation.latency_ms),
               func.sum(func.cast(AIInvocation.used_fallback, func.count().type)))
        .where(AIInvocation.organization_id == user.organization_id,
               AIInvocation.created_at >= since)
        .group_by(AIInvocation.task))).all()

    tasks = []
    for task, count, avg_conf, avg_latency, fallbacks in rows:
        feedback = (await db.execute(
            select(func.count(), func.sum(func.cast(AIFeedback.was_correct, func.count().type)))
            .where(AIFeedback.task == task, AIFeedback.created_at >= since))).first()
        reviewed, correct = (feedback[0] or 0), (feedback[1] or 0)
        tasks.append({
            "task": task,
            "invocations": count,
            "avg_confidence": round(float(avg_conf), 3) if avg_conf else None,
            "avg_latency_ms": round(float(avg_latency)) if avg_latency else None,
            "fallback_rate": round((fallbacks or 0) / count, 3) if count else 0,
            "human_reviewed": reviewed,
            "accuracy": round(correct / reviewed, 3) if reviewed else None,
        })

    return {
        "window_days": days,
        "mode": "live" if settings.ai_available else "heuristic",
        "model": settings.AI_MODEL if settings.ai_available else "heuristic-v1",
        "tasks": tasks,
    }
