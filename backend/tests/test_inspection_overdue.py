"""An inspection raised by an IoT fault is scheduled for "now"; it must not
read as overdue the moment someone opens the Inspections page."""
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.services import inspections as svc

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


def test_an_inspection_scheduled_just_now_is_not_overdue():
    assert not (NOW < svc.overdue_cutoff(NOW))                       # scheduled_for == now
    assert not (NOW - timedelta(seconds=1) < svc.overdue_cutoff(NOW))


def test_it_becomes_overdue_only_after_the_grace_period():
    grace = settings.INSPECTION_OVERDUE_GRACE_MINUTES
    just_inside = NOW - timedelta(minutes=grace - 1)
    just_past = NOW - timedelta(minutes=grace + 1)
    assert not (just_inside < svc.overdue_cutoff(NOW))
    assert just_past < svc.overdue_cutoff(NOW)


def test_grace_can_be_set_to_zero(monkeypatch):
    monkeypatch.setattr(settings, "INSPECTION_OVERDUE_GRACE_MINUTES", 0)
    assert svc.overdue_cutoff(NOW) == NOW
