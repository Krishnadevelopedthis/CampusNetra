"""An SLA countdown runs only while work is open; it must never turn finished,
rejected, duplicate or cancelled records "overdue" as real time passes."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.api.v1.work_orders import _wo_sla_minutes
from app.core.enums import IssueStatus, WorkOrderStatus
from app.services.issue_views import issue_sla_minutes

NOW = datetime.now(timezone.utc)


def _issue(status, due, resolved=None, closed=None):
    return SimpleNamespace(status=status, sla_due_at=due, resolved_at=resolved, closed_at=closed)


def test_open_issue_counts_down_against_the_live_clock():
    m = issue_sla_minutes(_issue(IssueStatus.ASSIGNED, NOW + timedelta(hours=2)))
    assert 118 <= m <= 120


def test_open_issue_past_due_is_negative():
    assert issue_sla_minutes(_issue(IssueStatus.IN_PROGRESS, NOW - timedelta(hours=3))) < 0


def test_rejected_and_duplicate_have_no_sla_clock():
    long_ago = NOW - timedelta(days=4)
    assert issue_sla_minutes(_issue(IssueStatus.REJECTED, long_ago)) is None
    assert issue_sla_minutes(_issue(IssueStatus.DUPLICATE, long_ago)) is None


def test_finished_issue_freezes_at_resolution():
    due = NOW - timedelta(days=5)
    done = due - timedelta(hours=1)           # finished an hour before the deadline
    m = issue_sla_minutes(_issue(IssueStatus.CLOSED, due, resolved=done))
    assert m == 60                             # still 60, however long ago that was


def test_closed_without_resolved_at_falls_back_to_closed_at():
    due = NOW - timedelta(days=5)
    m = issue_sla_minutes(_issue(IssueStatus.CLOSED, due, closed=due + timedelta(minutes=30)))
    assert m == -30


def test_reopened_issue_counts_live_again_despite_old_resolved_at():
    due = NOW + timedelta(hours=1)
    m = issue_sla_minutes(_issue(IssueStatus.IN_PROGRESS, due, resolved=NOW - timedelta(days=1)))
    assert 58 <= m <= 60


def _wo(status, due, completed=None):
    return SimpleNamespace(status=status, sla_due_at=due, completed_at=completed)


def test_cancelled_work_order_has_no_sla_clock():
    assert _wo_sla_minutes(_wo(WorkOrderStatus.CANCELLED, NOW - timedelta(days=2))) is None


def test_completed_work_order_freezes_and_open_one_runs():
    due = NOW - timedelta(days=2)
    assert _wo_sla_minutes(_wo(WorkOrderStatus.COMPLETED, due, completed=due - timedelta(hours=2))) == 120
    assert _wo_sla_minutes(_wo(WorkOrderStatus.IN_PROGRESS, NOW - timedelta(hours=1))) < 0
