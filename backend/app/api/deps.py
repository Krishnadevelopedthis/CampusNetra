"""Shared FastAPI dependencies: auth, role gates and pagination."""
from __future__ import annotations

import uuid
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole, UserStatus
from app.core.security import ACCESS_TOKEN, decode_token
from app.models.identity import Permission, RolePermission, User

bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if creds is None:
        raise CREDENTIALS_ERROR
    try:
        payload = decode_token(creds.credentials, ACCESS_TOKEN)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise CREDENTIALS_ERROR

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise CREDENTIALS_ERROR

    if user.status == UserStatus.PENDING_VERIFICATION:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email address not verified")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Account is {user.status.value}")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def require_roles(*roles: UserRole):
    """Route guard: `Depends(require_roles(UserRole.ADMIN))`."""
    allowed = set(roles)

    async def guard(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires one of: {', '.join(sorted(r.value for r in allowed))}",
            )
        return user

    return guard


# Common role bundles.
STAFF_ROLES = (UserRole.TECHNICIAN, UserRole.FACILITY_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
MANAGER_ROLES = (UserRole.FACILITY_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
ADMIN_ROLES = (UserRole.ADMIN, UserRole.SUPER_ADMIN)

RequireStaff = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
RequireManager = Annotated[User, Depends(require_roles(*MANAGER_ROLES))]
RequireAdmin = Annotated[User, Depends(require_roles(*ADMIN_ROLES))]


def require_permission(code: str):
    """Route guard backed by the role_permissions table, e.g.
    `Depends(require_permission("issues:resolve"))`.

    Unlike require_roles (which hardcodes an allowed-role tuple at each call
    site, unreachable from the outside), this looks up whether the caller's
    role has actually been granted this specific permission code -- so an
    admin's edits in Admin > Roles > Manage take real effect here, instead
    of only being recorded. app/services/permissions.py seeds a baseline at
    startup matching every route this replaces, so switching a route over
    to this changes nothing about who can do what until an admin changes it.
    """
    async def guard(user: CurrentUser, db: DB) -> User:
        granted = await db.scalar(
            select(RolePermission.role)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role == user.role, Permission.code == code)
        )
        if granted is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires permission: {code}")
        return user

    return guard


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=100),
    ):
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size
        self.limit = page_size


Paging = Annotated[Pagination, Depends(Pagination)]


def client_ip(request: Request) -> Optional[str]:
    """Honours X-Forwarded-For when running behind a proxy."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None
