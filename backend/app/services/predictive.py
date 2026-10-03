"""Predictive maintenance.

Scores each asset's risk of near-term failure from signals the platform already
records — age, warranty, fault history, mean time between failures and service
overdue — and can raise preventive work orders from the top of that list.

This is deliberately an interpretable model rather than a learned one: a facility
manager has to justify spending money on a machine that is currently working, so
every score comes with the reasons that produced it.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AssetState, IssueStatus, Priority
from app.models.identity import User
from app.models.issues import Issue
from app.models.platform import MaintenancePrediction
from app.models.spatial import Asset, AssetCategory, Building, Campus, Floor, Room
from app.models.work import WorkOrder

# Weights sum to 1.0. Fault history dominates: what has broken before is the
# strongest available predictor of what breaks next.
W_FAULTS = 0.35
W_AGE = 0.20
W_SERVICE = 0.20
W_MTBF = 0.15
W_WARRANTY = 0.10

# Below this an asset is not worth surfacing. 0.4 because an asset with no
# complaints can score at most 0.5 (faults carry 35% of the weight): one past
# its service life, overdue for service and out of warranty lands near 0.45 and
# is exactly what preventive maintenance is for. At the old 0.55 such assets
# could never appear, so the list stayed empty until things had already broken.
RISK_THRESHOLD = 0.40


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


async def score_asset(
    db: AsyncSession, asset: Asset, fault_times: Optional[list[datetime]] = None,
) -> tuple[float, dict, list[str]]:
    """Return (risk, signals, human-readable reasons) for one asset.

    `fault_times` is every complaint time for this asset, oldest first. The
    forecast passes it in (one query for all assets); a single-asset call may
    leave it out and it is read here.
    """
    now = _now()
    signals: dict = {}
    reasons: list[str] = []

    if fault_times is None:
        fault_times = list((await db.scalars(
            select(Issue.created_at).where(Issue.asset_id == asset.id).order_by(Issue.created_at)
        )).all())
    # Faults of a unit that has since been replaced belong to that old unit.
    if asset.installed_at:
        fault_times = [t for t in fault_times if t >= asset.installed_at]

    # --- Fault history over the last year ---
    year_ago = now - timedelta(days=365)
    fault_count = sum(1 for t in fault_times if t >= year_ago)
    # Three or more faults in a year saturates this signal.
    fault_score = _clamp(fault_count / 3.0)
    signals["fault_count_12m"] = fault_count
    if fault_count >= 3:
        reasons.append(f"{fault_count} faults in the last 12 months")
    elif fault_count > 0:
        reasons.append(f"{fault_count} fault{'s' if fault_count > 1 else ''} in the last 12 months")

    # --- Age against expected life ---
    age_score = 0.0
    if asset.purchase_date and asset.expected_life_months:
        age_months = (now.date() - asset.purchase_date).days / 30.44
        ratio = age_months / asset.expected_life_months
        age_score = _clamp(ratio)
        signals["age_months"] = round(age_months)
        signals["life_used_pct"] = round(ratio * 100)
        if ratio >= 1.0:
            reasons.append("past its expected service life")
        elif ratio >= 0.8:
            reasons.append(f"{round(ratio * 100)}% through its expected life")

    # --- Service overdue ---
    service_score = 0.0
    if asset.service_interval_days:
        last = asset.last_service_at or (
            datetime.combine(asset.purchase_date, datetime.min.time(), tzinfo=timezone.utc)
            if asset.purchase_date else None
        )
        if last:
            days_since = (now - last).days
            ratio = days_since / asset.service_interval_days
            service_score = _clamp(ratio / 2.0)   # 2x the interval saturates
            signals["days_since_service"] = days_since
            signals["service_interval_days"] = asset.service_interval_days
            if ratio > 1.0:
                reasons.append(
                    f"service overdue by {days_since - asset.service_interval_days} days")

    # --- Mean time between failures ---
    mtbf_score = 0.0
    fault_dates = fault_times
    if len(fault_dates) >= 2:
        gaps = [(b - a).days for a, b in zip(fault_dates, fault_dates[1:])]
        mtbf = sum(gaps) / len(gaps)
        signals["mtbf_days"] = round(mtbf)
        # A machine failing more often than every 90 days is deteriorating.
        mtbf_score = _clamp((90 - mtbf) / 90) if mtbf < 90 else 0.0
        if mtbf < 60:
            reasons.append(f"failing roughly every {round(mtbf)} days")

    # --- Warranty ---
    warranty_score = 0.0
    if asset.warranty_expiry:
        if asset.warranty_expiry < now.date():
            warranty_score = 1.0
            signals["warranty_expired"] = True
            reasons.append("out of warranty")
        else:
            signals["warranty_expired"] = False

    risk = (
        fault_score * W_FAULTS + age_score * W_AGE + service_score * W_SERVICE
        + mtbf_score * W_MTBF + warranty_score * W_WARRANTY
    )

    # An asset already in a bad state is a present problem, not a prediction —
    # damp it so the forecast surfaces things that have not failed yet.
    if asset.state in (AssetState.FAULT, AssetState.UNDER_MAINTENANCE):
        risk *= 0.4
        signals["currently_faulty"] = True

    signals["components"] = {
        "faults": round(fault_score, 3), "age": round(age_score, 3),
        "service": round(service_score, 3), "mtbf": round(mtbf_score, 3),
        "warranty": round(warranty_score, 3),
    }
    return round(_clamp(risk), 3), signals, reasons


async def forecast(
    db: AsyncSession, organization_id: uuid.UUID, *, limit: int = 20,
    min_risk: float = RISK_THRESHOLD,
) -> list[dict]:
    """Rank every asset in the organization by predicted failure risk."""
    assets = (await db.scalars(
        select(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Campus, Campus.id == Building.campus_id)
        .where(Campus.organization_id == organization_id,
               Asset.state != AssetState.DECOMMISSIONED)
    )).all()

    # Every complaint time for every asset, in one query. Scoring used to run
    # two queries per asset, which on a few thousand assets (against a remote
    # database) left the page "Scoring assets…" for many minutes.
    fault_times: dict = {}
    for asset_id, created in (await db.execute(
        select(Issue.asset_id, Issue.created_at)
        .where(Issue.organization_id == organization_id, Issue.asset_id.is_not(None))
        .order_by(Issue.created_at)
    )).all():
        fault_times.setdefault(asset_id, []).append(created)

    scored = []
    for asset in assets:
        risk, signals, reasons = await score_asset(db, asset, fault_times.get(asset.id, []))
        if risk >= min_risk:
            scored.append((asset, risk, signals, reasons))

    rooms = {r.id: r for r in (await db.scalars(
        select(Room).where(Room.id.in_({a.room_id for a, *_ in scored})))).all()} if scored else {}
    categories = {c.id: c for c in (await db.scalars(
        select(AssetCategory).where(AssetCategory.id.in_({a.category_id for a, *_ in scored})))).all()} if scored else {}
    # Has a preventive work order already been raised for each asset?
    existing_wo: dict = {}
    if scored:
        for asset_id, ref in (await db.execute(
            select(WorkOrder.asset_id, WorkOrder.reference).where(
                WorkOrder.asset_id.in_([a.id for a, *_ in scored]), WorkOrder.is_predictive.is_(True),
                WorkOrder.status.notin_(["closed", "cancelled"]),
            )
        )).all():
            existing_wo.setdefault(asset_id, ref)

    out = []
    for asset, risk, signals, reasons in scored:
        room = rooms.get(asset.room_id)
        category = categories.get(asset.category_id)
        existing = existing_wo.get(asset.id)

        out.append({
            "asset_id": str(asset.id),
            "tag": asset.tag,
            "name": asset.name,
            "category": category.name if category else None,
            "room": room.name if room else None,
            "room_id": str(room.id) if room else None,
            "state": asset.state.value,
            "risk_score": risk,
            "risk_band": "high" if risk >= 0.65 else "medium" if risk >= 0.5 else "low",
            "reasons": reasons or ["No individual signal is strong; combined score only"],
            "signals": signals,
            "existing_work_order": existing,
            # Sooner for higher risk: ~18 days at 0.4, 3 days at 1.0.
            "recommended_by": (date.today() + timedelta(days=max(3, int(30 * (1 - risk))))).isoformat(),
        })

    out.sort(key=lambda x: x["risk_score"], reverse=True)
    return out[:limit]


async def persist_predictions(
    db: AsyncSession, organization_id: uuid.UUID, predictions: list[dict]
) -> int:
    """Store today's forecast so accuracy can be reviewed later."""
    today = date.today()
    stored = 0
    ids = [uuid.UUID(p["asset_id"]) for p in predictions]
    todays = {m.asset_id: m for m in (await db.scalars(
        select(MaintenancePrediction).where(
            MaintenancePrediction.asset_id.in_(ids), MaintenancePrediction.predicted_for == today)
    )).all()} if ids else {}
    for p in predictions:
        asset_id = uuid.UUID(p["asset_id"])
        existing = todays.get(asset_id)
        if existing is not None:
            existing.risk_score = p["risk_score"]
            existing.signals = p["signals"]
            existing.reasoning = "; ".join(p["reasons"])
            continue

        db.add(MaintenancePrediction(
            asset_id=asset_id, predicted_for=today, risk_score=p["risk_score"],
            reasoning="; ".join(p["reasons"]), signals=p["signals"],
        ))
        stored += 1
    return stored
