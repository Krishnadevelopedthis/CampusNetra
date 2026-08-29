"""In-app notification feed."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update

from app.api.deps import DB, CurrentUser
from app.core.routing import CommitRoute
from app.core.security import decode_token
from app.models.platform import Notification
from app.schemas.common import Message
from app.services.realtime import users as user_hub

router = APIRouter(route_class=CommitRoute, prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=dict)
async def list_notifications(
    user: CurrentUser, db: DB,
    limit: int = Query(25, ge=1, le=100),
    unread_only: bool = Query(False),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))

    rows = (await db.scalars(
        query.order_by(Notification.created_at.desc()).limit(limit))).all()

    unread = await db.scalar(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))) or 0

    return {
        "items": [
            {"id": str(n.id), "title": n.title, "body": n.body, "link": n.link,
             "kind": n.kind, "entity_type": n.entity_type,
             "entity_id": str(n.entity_id) if n.entity_id else None,
             "read_at": n.read_at.isoformat() if n.read_at else None,
             "created_at": n.created_at.isoformat()}
            for n in rows
        ],
        "unread": unread,
    }


@router.post("/{notification_id}/read", response_model=Message)
async def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DB):
    n = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.read_at = n.read_at or datetime.now(timezone.utc)
    return Message(detail="Marked as read.")


@router.post("/read-all", response_model=Message)
async def mark_all_read(user: CurrentUser, db: DB):
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc)))
    return Message(detail=f"{result.rowcount} notification(s) marked as read.")


@router.websocket("/ws")
async def notification_socket(websocket: WebSocket, token: str = Query(...)):
    """Live feed for one signed-in user.

    The token arrives as a query parameter because browsers cannot set an
    Authorization header on a WebSocket handshake. It is an access token — short
    lived, and the same one the REST calls already carry — and the socket is
    closed the moment it fails to verify, before it is ever accepted.
    """
    try:
        payload = decode_token(token, "access")
        user_id = payload["sub"]
    except (jwt.PyJWTError, KeyError):
        # 1008 = policy violation. Closing before accept() keeps an
        # unauthenticated peer from ever holding an open socket.
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await user_hub.connect(websocket, user_id)
    try:
        await websocket.send_json({"type": "connected"})
        while True:
            # Heartbeats only; nothing a client sends here is acted on.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await user_hub.disconnect(websocket, user_id)
