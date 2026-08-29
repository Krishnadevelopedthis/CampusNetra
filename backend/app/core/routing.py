"""A route class that commits the request's transaction before it answers.

FastAPI exits dependencies with `yield` after the response has been sent, so a
session committed in `get_db`'s teardown lands *after* the client already has
its answer. Measured at three to five milliseconds — long enough that logging
in and immediately exchanging the refresh token failed about half the time,
because the token in the response had not been written yet.

The route handler returns before that teardown, so committing here closes the
window: nothing is reported as done until it is durable.
"""
from __future__ import annotations

from typing import Callable

from fastapi import Request, Response
from fastapi.routing import APIRoute


class CommitRoute(APIRoute):
    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def commit_before_responding(request: Request) -> Response:
            response = await handler(request)

            session = getattr(request.state, "db", None)
            # A read-only endpoint leaves nothing to commit, and a route that
            # takes no session has no state.db at all.
            if session is not None and session.in_transaction():
                await session.commit()
            return response

        return commit_before_responding
