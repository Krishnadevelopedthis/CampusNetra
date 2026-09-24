"""One endpoint: this person's own activity, pulled from the real tables
that already record it. See services/history.py for what actually
counts as an entry and why.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.core.routing import CommitRoute
from app.schemas.history import HistoryOut
from app.services import history as history_service

router = APIRouter(route_class=CommitRoute, prefix="/history", tags=["History"])


@router.get("", response_model=HistoryOut)
async def my_history(user: CurrentUser, db: DB):
    entries = await history_service.collect(db, user)
    return HistoryOut(entries=entries)
