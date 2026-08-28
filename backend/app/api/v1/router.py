"""Aggregates every v1 route module."""
from fastapi import APIRouter

from app.api.v1 import (
    ai, analytics, auth, campus, dashboard, issues, lostfound, notifications, work_orders,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(campus.router)
api_router.include_router(issues.router)
api_router.include_router(work_orders.router)
api_router.include_router(lostfound.router)
api_router.include_router(notifications.router)
api_router.include_router(ai.router)
api_router.include_router(analytics.router)
