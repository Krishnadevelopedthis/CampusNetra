"""Registration, login, token rotation and OTP verification."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.security import (
    create_access_token, create_refresh_token, decode_token, generate_opaque_token,
    generate_otp, hash_password, sha256, verify_password, REFRESH_TOKEN,
)
from app.models.identity import Department, Organization, RefreshToken, User, VerificationCode
from app.schemas.auth import RegisterRequest, TokenPair
from app.services.audit import record_login
from app.services.email import send_otp

# Roles a person may pick for themselves. Elevated roles are provisioned by an admin.
SELF_SERVICE_ROLES = {UserRole.STUDENT, UserRole.TEACHER, UserRole.TECHNICIAN}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def issue_tokens(user: User) -> tuple[TokenPair, str]:
    """Returns the pair plus the raw refresh token, which the caller must persist hashed."""
    raw_refresh = create_refresh_token(str(user.id))
    return (
        TokenPair(
            access_token=create_access_token(str(user.id), user.role.value, user.organization_id),
            refresh_token=raw_refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        ),
        raw_refresh,
    )


async def persist_refresh_token(
    db: AsyncSession, user: User, raw: str,
    ip: Optional[str] = None, ua: Optional[str] = None,
) -> None:
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=sha256(raw),
        expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=ip, user_agent=ua,
    ))


async def create_verification_code(db: AsyncSession, user: User, purpose: str) -> str:
    """Invalidates any outstanding code for the same purpose, then issues a fresh one."""
    await db.execute(
        update(VerificationCode)
        .where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .values(consumed_at=_now())
    )
    code = generate_otp()
    db.add(VerificationCode(
        user_id=user.id, purpose=purpose, code_hash=sha256(code),
        expires_at=_now() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
    ))
    return code


async def consume_verification_code(
    db: AsyncSession, user: User, purpose: str, code: str
) -> None:
    """Raises 400 on any failure. Attempts are counted to blunt brute force."""
    record = await db.scalar(
        select(VerificationCode)
        .where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    if record is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No verification code was requested")
    if record.expires_at < _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification code has expired")
    if record.attempts >= 5:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect attempts; request a new code")

    if record.code_hash != sha256(code):
        record.attempts += 1
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect verification code")

    record.consumed_at = _now()


def email_domain(address: str) -> str:
    """Domain part, lowercased. Plus-addressing does not affect it."""
    return address.rsplit("@", 1)[-1].strip().lower()


async def resolve_organization(db: AsyncSession, address: str) -> tuple[Optional[uuid.UUID], Optional[str]]:
    """Decide which campus a self-registering user belongs to.

    Returns (organization_id, rejection_reason). Exactly one is non-None.

    Matching on the email domain is what makes email verification meaningful:
    proving you control 21bce1234@vit.ac.in also proves you belong to VIT. A
    campus platform should not accept an arbitrary Gmail as a student.
    """
    domain = email_domain(address)

    match = await db.scalar(
        select(Organization).where(func.lower(Organization.email_domain) == domain)
    )
    if match is not None:
        return match.id, None

    # An institution that has not configured a domain cannot be matched on one.
    # When it is the only tenant, the deployment is unambiguous — a single-campus
    # install — so joining it is the correct behaviour rather than a guess.
    configured = (await db.scalars(
        select(Organization).where(Organization.email_domain.isnot(None))
    )).all()
    if not configured:
        orgs = (await db.scalars(select(Organization).limit(2))).all()
        if len(orgs) == 1:
            return orgs[0].id, None

    accepted = sorted({o.email_domain for o in configured if o.email_domain})
    if accepted:
        return None, (
            f"Registration is limited to campus email addresses "
            f"({', '.join('@' + d for d in accepted)}). "
            f"Ask your administrator to create an account if you do not have one."
        )
    return None, ("No campus is configured on this system yet. "
                  "An administrator must register the institution first.")


async def register_user(db: AsyncSession, payload: RegisterRequest):
    """Create the account and email the verification code.

    Returns (user, code, send_result) so the route can tell the caller whether the
    email actually went out rather than assuming it did.
    """
    """Creates the account (and the organization, for an enterprise signup)."""
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    org_id = payload.organization_id
    role = payload.role

    if payload.organization_name is None and org_id is None:
        # Self-service signup: derive the campus from the email address.
        org_id, rejection = await resolve_organization(db, payload.email)
        if rejection:
            raise HTTPException(status.HTTP_403_FORBIDDEN, rejection)

    if payload.organization_name:
        # Enterprise/college registration: the signer-up becomes that tenant's admin.
        org = Organization(
            name=payload.organization_name,
            contact_email=payload.email,
            slug=payload.organization_name.lower().replace(" ", "-")[:60],
        )
        db.add(org)
        await db.flush()
        org_id = org.id
        role = UserRole.ADMIN
    elif role not in SELF_SERVICE_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"The {role.value} role must be provisioned by an administrator",
        )

    department_id = None
    if payload.department_code and org_id:
        department_id = await db.scalar(
            select(Department.id).where(
                Department.organization_id == org_id,
                Department.code == payload.department_code,
            )
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
        phone=payload.phone,
        organization_id=org_id,
        department_id=department_id,
        enrollment_no=payload.enrollment_no,
        employee_id=payload.employee_id,
        designation=payload.designation,
        status=UserStatus.PENDING_VERIFICATION,
    )
    db.add(user)
    await db.flush()

    code = await create_verification_code(db, user, "email_verify")
    result = await send_otp(user.email, user.full_name, code, "email_verify")
    return user, code, result


async def authenticate(
    db: AsyncSession, email: str, password: str,
    expected_role: Optional[UserRole] = None,
    ip: Optional[str] = None, ua: Optional[str] = None,
) -> User:
    """Verifies credentials, enforcing lockout. Failure messages stay generic."""
    user = await db.scalar(select(User).where(User.email == email))

    async def fail(reason: str, code: int = status.HTTP_401_UNAUTHORIZED, detail: str = "Incorrect email or password"):
        await record_login(db, email=email, succeeded=False, user_id=user.id if user else None,
                           failure_reason=reason, ip_address=ip, user_agent=ua)
        await db.commit()
        raise HTTPException(code, detail)

    if user is None:
        # Hash anyway so a missing account is not distinguishable by response time.
        verify_password(password, "$2b$12$" + "x" * 53)
        await fail("no_such_user")

    if user.locked_until and user.locked_until > _now():
        mins = max(1, int((user.locked_until - _now()).total_seconds() // 60))
        await fail("locked", status.HTTP_423_LOCKED,
                   f"Account temporarily locked. Try again in {mins} minute(s).")

    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = _now() + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_count = 0
            await fail("locked_out", status.HTTP_423_LOCKED,
                       f"Too many failed attempts. Account locked for {settings.LOCKOUT_MINUTES} minutes.")
        await fail("bad_password")

    # The login screen's role tab must agree with the stored role.
    if expected_role and user.role != expected_role:
        await fail("role_mismatch", status.HTTP_403_FORBIDDEN,
                   f"This account is not registered as a {expected_role.value.replace('_', ' ')}")

    if user.status == UserStatus.PENDING_VERIFICATION:
        await fail("unverified", status.HTTP_403_FORBIDDEN,
                   "Please verify your email address before signing in")
    if user.status != UserStatus.ACTIVE:
        await fail(user.status.value, status.HTTP_403_FORBIDDEN,
                   f"This account is {user.status.value}")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = _now()
    await record_login(db, email=email, succeeded=True, user_id=user.id, ip_address=ip, user_agent=ua)
    return user


async def rotate_refresh_token(
    db: AsyncSession, raw_token: str, ip: Optional[str] = None, ua: Optional[str] = None
) -> tuple[User, TokenPair]:
    """Single-use refresh tokens: the presented one is revoked as it is exchanged."""
    import jwt as _jwt
    try:
        payload = decode_token(raw_token, REFRESH_TOKEN)
        user_id = uuid.UUID(payload["sub"])
    except (_jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == sha256(raw_token),
            RefreshToken.revoked_at.is_(None),
        )
    )
    if stored is None or stored.expires_at < _now():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token is expired or revoked")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is unavailable")

    stored.revoked_at = _now()
    tokens, raw_new = issue_tokens(user)
    await persist_refresh_token(db, user, raw_new, ip, ua)
    return user, tokens


async def revoke_all_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
