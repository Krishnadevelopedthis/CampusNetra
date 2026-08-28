"""Authentication request/response bodies."""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.enums import UserRole
from app.schemas.common import ORMModel

# At least one lower, one upper, one digit; length enforced separately for a
# clearer error message than a single opaque regex failure.
_PW_CHECKS = [
    (re.compile(r"[a-z]"), "a lowercase letter"),
    (re.compile(r"[A-Z]"), "an uppercase letter"),
    (re.compile(r"\d"), "a digit"),
]


def validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    missing = [label for rx, label in _PW_CHECKS if not rx.search(v)]
    if missing:
        raise ValueError("Password must contain " + ", ".join(missing))
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole = UserRole.STUDENT
    phone: Optional[str] = None
    # Role-specific identifiers, validated against the chosen role below.
    enrollment_no: Optional[str] = None
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department_code: Optional[str] = None
    organization_id: Optional[uuid.UUID] = None
    # Enterprise signup creates the tenant alongside the first admin user.
    organization_name: Optional[str] = None

    _v_pw = field_validator("password")(validate_password)

    @field_validator("role")
    @classmethod
    def _no_self_service_superadmin(cls, v: UserRole) -> UserRole:
        if v == UserRole.SUPER_ADMIN:
            raise ValueError("super_admin cannot be self-registered")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    # The login screen's role tab. When supplied it must match the stored role,
    # so a student cannot sign in through the Admin tab.
    role: Optional[UserRole] = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    new_password: str

    _v_pw = field_validator("new_password")(validate_password)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class ResendCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = "email_verify"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    _v_pw = field_validator("new_password")(validate_password)


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    status: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    designation: Optional[str] = None
    enrollment_no: Optional[str] = None
    employee_id: Optional[str] = None
    specialization: Optional[list[str]] = None
    organization_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    email_verified_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserOut
    tokens: TokenPair


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    designation: Optional[str] = None
    preferences: Optional[dict] = None
