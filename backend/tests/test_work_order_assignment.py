"""Regression tests for assign_work_order()'s eligibility check (issue category, then department).

Before this fix, the manual POST /work-orders/{id}/assign path validated
only that the target user exists and is role=technician -- nothing checked
that the technician actually belongs to the work order's own department,
unlike the auto-pick suggest_technician(), which has always filtered on
department. A manager could manually hand a work order to any technician
in the organisation, including one from a completely unrelated department.

No DB fixtures exist yet in this project's test suite (the AI tests all
mock at the unit level), so this follows the same pattern: a fake `db`
with an AsyncMock .scalar/.add, and SimpleNamespace stand-ins for the ORM
rows assign_work_order() actually reads/writes.
"""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.enums import UserRole, WorkOrderStatus
from app.services.work_orders import assign_work_order

ORG = uuid.uuid4()
DEPT_A = uuid.uuid4()
DEPT_B = uuid.uuid4()


def _user(role=UserRole.TECHNICIAN, department_id=DEPT_A, org=ORG, specialization=None):
    return SimpleNamespace(
        id=uuid.uuid4(), organization_id=org, role=role,
        department_id=department_id, full_name="Test Tech",
        specialization=specialization,
    )


def _wo(department_id=DEPT_A, issue_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(), department_id=department_id, issue_id=issue_id, status=WorkOrderStatus.OPEN,
        title="Leaking tap", reference="WO-1", priority=SimpleNamespace(value="medium"),
        assigned_to=None, assigned_by=None, assigned_at=None, scheduled_for=None,
        sla_due_at=None,
    )


@pytest.fixture(autouse=True)
def mock_notify(monkeypatch):
    monkeypatch.setattr("app.services.work_orders.notify_svc.notify", AsyncMock())


def _db(tech, category_code=None):
    # assign_work_order() reads the technician first, then (only when the
    # work order has an originating issue) that issue's category code.
    return SimpleNamespace(scalar=AsyncMock(side_effect=[tech, category_code]), add=MagicMock())


@pytest.mark.asyncio
async def test_same_department_assignment_succeeds():
    tech = _user(department_id=DEPT_A)
    wo = _wo(department_id=DEPT_A)
    actor = _user(role=UserRole.FACILITY_MANAGER)

    result = await assign_work_order(_db(tech), wo, tech.id, actor)

    assert result.assigned_to == tech.id
    assert result.status == WorkOrderStatus.ASSIGNED


@pytest.mark.asyncio
async def test_cross_department_assignment_is_rejected():
    """The exact gap this fix closes: a technician from Department B must
    not be assignable to a work order routed to Department A."""
    tech = _user(department_id=DEPT_B)
    wo = _wo(department_id=DEPT_A)
    actor = _user()

    with pytest.raises(HTTPException) as exc:
        await assign_work_order(_db(tech), wo, tech.id, actor)

    assert exc.value.status_code == 400
    assert "category" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_departmentless_work_order_accepts_any_technician():
    """Mirrors suggest_technician()'s own leniency: a work order with no
    department set (department_id is None) isn't scoped to anyone."""
    tech = _user(department_id=DEPT_B)
    wo = _wo(department_id=None)
    actor = _user()

    result = await assign_work_order(_db(tech), wo, tech.id, actor)

    assert result.assigned_to == tech.id


@pytest.mark.asyncio
async def test_non_technician_is_still_rejected():
    """Pre-existing check must survive this change unchanged."""
    not_tech = _user(role=UserRole.ADMIN)
    wo = _wo(department_id=DEPT_A)
    actor = _user()

    with pytest.raises(HTTPException) as exc:
        await assign_work_order(_db(not_tech), wo, not_tech.id, actor)

    assert exc.value.status_code == 400
    assert "not a technician" in exc.value.detail


@pytest.mark.asyncio
async def test_technician_serving_the_category_is_accepted_across_departments():
    """Technicians register against Issue Configuration categories: one who
    services the issue's category qualifies even outside its department."""
    tech = _user(department_id=DEPT_B, specialization=["PLUMB", "HVAC"])
    wo = _wo(department_id=DEPT_A, issue_id=uuid.uuid4())

    result = await assign_work_order(_db(tech, "HVAC"), wo, tech.id, _user())

    assert result.assigned_to == tech.id


@pytest.mark.asyncio
async def test_technician_not_serving_the_category_and_outside_department_is_rejected():
    tech = _user(department_id=DEPT_B, specialization=["PLUMB"])
    wo = _wo(department_id=DEPT_A, issue_id=uuid.uuid4())

    with pytest.raises(HTTPException) as exc:
        await assign_work_order(_db(tech, "ELEC"), wo, tech.id, _user())

    assert exc.value.status_code == 400
