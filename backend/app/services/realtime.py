"""In-process WebSocket hub broadcasting live Digital Twin updates.

Clients subscribe per campus. A single-process hub is the right scope here;
running multiple workers would need a Redis pub/sub fan-out behind the same API.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import WebSocket

log = logging.getLogger(__name__)


def _encode(obj: Any) -> Any:
    if isinstance(obj, (UUID, Decimal)):
        return str(obj) if isinstance(obj, UUID) else float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"not JSON serialisable: {type(obj)}")


class TwinHub:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, campus_id: str) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms[campus_id].add(ws)
        log.debug("twin subscriber joined campus=%s (%d total)", campus_id, len(self._rooms[campus_id]))

    async def disconnect(self, ws: WebSocket, campus_id: str) -> None:
        async with self._lock:
            self._rooms[campus_id].discard(ws)
            if not self._rooms[campus_id]:
                self._rooms.pop(campus_id, None)

    async def broadcast(self, campus_id: str, event: dict) -> None:
        """Fan out to every subscriber; drops sockets that have gone away."""
        async with self._lock:
            targets = list(self._rooms.get(str(campus_id), ()))
        if not targets:
            return

        message = json.dumps(event, default=_encode)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._rooms.get(str(campus_id), set()).discard(ws)

    def subscriber_count(self, campus_id: str) -> int:
        return len(self._rooms.get(str(campus_id), ()))


hub = TwinHub()
