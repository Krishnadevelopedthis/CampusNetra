"""Aggregates every v1 route module."""
from fastapi import APIRouter

from app.core.routing import CommitRoute
from app.api.v1 import (
    admin, ai, analytics, auth, campus, dashboard, inspections, issues, lostfound,
    notifications, uploads, work_orders,
)

# Every route commits its transaction before answering — see CommitRoute for
# why that cannot be left to the session dependency's teardown.
api_router = APIRouter(route_class=CommitRoute)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(campus.router)
api_router.include_router(issues.router)
api_router.include_router(work_orders.router)
api_router.include_router(lostfound.router)
api_router.include_router(inspections.router)
api_router.include_router(notifications.router)
api_router.include_router(ai.router)
api_router.include_router(analytics.router)
api_router.include_router(admin.router)
api_router.include_router(uploads.router)
