"""Overdue follows the SLA policy for IoT inspections and stays immediate for
ones a person scheduled."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.core.enums import InspectionStatus, Priority
from app.services import inspections as svc
from app.services import work_orders as wo

ORG = uuid.uuid4()


def _insp(minutes_ago):
    return SimpleNamespace(
        id=uuid.uuid4(), status=InspectionStatus.SCHEDULED,
        scheduled_for=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago))


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Db:
    def __init__(self, inspections, severities):
        self.inspections, self.severities = inspections, severities

    async def scalars(self, _q):
        return _Rows(self.inspections)

    async def execute(self, _q):
        return _Rows([(i.id, sev) for i, sev in self.severities])


@pytest.fixture
def policies(monkeypatch):
    """High = 60 min, Critical = 15 min (the seeded policies), changeable per test."""
    table = {Priority.HIGH: 60, Priority.CRITICAL: 15}

    async def resolve(_db, _org, priority, _dept):
        mins = table.get(priority)
        return (SimpleNamespace(response_mins=mins), None) if mins else (None, None)

    monkeypatch.setattr(wo, "resolve_sla", resolve)
    return table


async def test_a_person_scheduled_inspection_is_overdue_as_soon_as_its_time_passes(policies):
    i = _insp(minutes_ago=1)
    assert await svc.mark_overdue(_Db([i], []), ORG) == 1
    assert i.status == InspectionStatus.OVERDUE


async def test_iot_inspection_gets_the_high_priority_response_time(policies):
    fresh, late = _insp(10), _insp(61)
    sev = SimpleNamespace(value="high")
    n = await svc.mark_overdue(_Db([fresh, late], [(fresh, sev), (late, sev)]), ORG)
    assert n == 1
    assert fresh.status == InspectionStatus.SCHEDULED          # 10 of 60 minutes used
    assert late.status == InspectionStatus.OVERDUE


async def test_a_critical_sensor_event_uses_the_critical_policy(policies):
    i = _insp(20)                                               # past 15, inside the High 60
    await svc.mark_overdue(_Db([i], [(i, SimpleNamespace(value="critical"))]), ORG)
    assert i.status == InspectionStatus.OVERDUE


async def test_changing_the_sla_policy_changes_when_it_goes_overdue(policies):
    policies[Priority.HIGH] = 30
    i = _insp(40)
    await svc.mark_overdue(_Db([i], [(i, SimpleNamespace(value="high"))]), ORG)
    assert i.status == InspectionStatus.OVERDUE                 # 40 > 30, though < the old 60


async def test_without_a_policy_a_fallback_response_time_applies(policies):
    policies.clear()
    inside, outside = _insp(svc.FALLBACK_RESPONSE_MINUTES - 5), _insp(svc.FALLBACK_RESPONSE_MINUTES + 5)
    sev = SimpleNamespace(value="high")
    await svc.mark_overdue(_Db([inside, outside], [(inside, sev), (outside, sev)]), ORG)
    assert inside.status == InspectionStatus.SCHEDULED and outside.status == InspectionStatus.OVERDUE


async def test_nothing_due_is_a_no_op(policies):
    assert await svc.mark_overdue(_Db([], []), ORG) == 0
