"""Authentication endpoints: register, verify, login, refresh, password reset."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, client_ip
from app.core.routing import CommitRoute
from app.core.config import settings
from app.core.enums import UserStatus
from app.core.security import hash_password, verify_password
from app.models.identity import User
from app.schemas.auth import (
    AuthResponse, ChangePasswordRequest, ForgotPasswordRequest, LoginRequest,
    RefreshRequest, RegisterRequest, ResendCodeRequest, ResetPasswordRequest,
    TokenPair, UpdateProfileRequest, UserOut, VerifyEmailRequest,
)
from app.schemas.common import Message
from app.services import auth as auth_service
from app.services.audit import record_audit
from app.services.email import send_otp

router = APIRouter(route_class=CommitRoute, prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=Message, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DB, request: Request):
    """Creates the account and emails a 6-digit verification code."""
    user, code, sent = await auth_service.register_user(db, payload)
    await record_audit(
        db, action="user.register", actor_id=user.id, organization_id=user.organization_id,
        entity_type="user", entity_id=user.id, ip_address=client_ip(request),
        after={"email": user.email, "role": user.role.value},
    )

    if sent.delivered:
        detail = f"Account created. A verification code has been sent to {user.email}."
    elif settings.expose_dev_codes:
        # No mail server on this deployment: show the code rather than stranding
        # the user at a verification step they can never complete.
        detail = "Account created. Email is not configured on this server, so your code is shown below."
    else:
        detail = (f"Account created, but the verification email could not be sent. "
                  f"{sent.error or ''} Use 'Resend code' once mail is working.").strip()

    return Message(
        detail=detail,
        dev_code=code if (not sent.delivered and settings.expose_dev_codes) else None,
    )


@router.post("/verify-email", response_model=AuthResponse)
async def verify_email(payload: VerifyEmailRequest, db: DB, request: Request):
    """Consumes the OTP, activates the account and signs the user straight in."""
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found for that email")
    if user.status == UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account is already verified")

    await auth_service.consume_verification_code(db, user, "email_verify", payload.code)

    now = datetime.now(timezone.utc)
    user.status = UserStatus.ACTIVE
    user.email_verified_at = now
    user.last_login_at = now

    tokens, raw = auth_service.issue_tokens(user)
    await auth_service.persist_refresh_token(
        db, user, raw, client_ip(request), request.headers.get("user-agent")
    )
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


@router.post("/resend-code", response_model=Message)
async def resend_code(payload: ResendCodeRequest, db: DB):
    """Always reports success — never reveals whether an address is registered."""
    generic = Message(detail="If that address is registered, a new code has been sent.")
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        return generic
    if payload.purpose not in {"email_verify", "password_reset"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported code purpose")

    code = await auth_service.create_verification_code(db, user, payload.purpose)
    sent = await send_otp(user.email, user.full_name, code, payload.purpose)
    if not sent.delivered and settings.expose_dev_codes:
        return Message(detail="Email is not configured on this server; your code is shown below.",
                       dev_code=code)
    return generic


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DB, request: Request):
    user = await auth_service.authenticate(
        db, payload.email, payload.password, payload.role,
        client_ip(request), request.headers.get("user-agent"),
    )
    tokens, raw = auth_service.issue_tokens(user)
    await auth_service.persist_refresh_token(
        db, user, raw, client_ip(request), request.headers.get("user-agent")
    )
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: DB, request: Request):
    """Rotates the refresh token — the presented one is revoked on use."""
    _, tokens = await auth_service.rotate_refresh_token(
        db, payload.refresh_token, client_ip(request), request.headers.get("user-agent")
    )
    return tokens


@router.post("/logout", response_model=Message)
async def logout(user: CurrentUser, db: DB):
    await auth_service.revoke_all_tokens(db, user.id)
    return Message(detail="Signed out on all devices.")


@router.post("/forgot-password", response_model=Message)
async def forgot_password(payload: ForgotPasswordRequest, db: DB):
    """Enumeration-safe: the response is identical for unknown addresses."""
    generic = Message(detail="If that address is registered, a reset code has been sent.")
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        return generic

    code = await auth_service.create_verification_code(db, user, "password_reset")
    sent = await send_otp(user.email, user.full_name, code, "password_reset")
    if not sent.delivered and settings.expose_dev_codes:
        return Message(detail="Email is not configured on this server; your code is shown below.",
                       dev_code=code)
    return generic


@router.post("/reset-password", response_model=Message)
async def reset_password(payload: ResetPasswordRequest, db: DB, request: Request):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid reset request")

    await auth_service.consume_verification_code(db, user, "password_reset", payload.code)

    user.password_hash = hash_password(payload.new_password)
    user.failed_login_count = 0
    user.locked_until = None
    # A password reset must invalidate every existing session.
    await auth_service.revoke_all_tokens(db, user.id)
    await record_audit(
        db, action="user.password_reset", actor_id=user.id,
        organization_id=user.organization_id, entity_type="user", entity_id=user.id,
        ip_address=client_ip(request),
    )
    return Message(detail="Password updated. Please sign in with your new password.")


@router.post("/change-password", response_model=Message)
async def change_password(payload: ChangePasswordRequest, user: CurrentUser, db: DB, request: Request):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must differ from the current one")

    user.password_hash = hash_password(payload.new_password)
    await auth_service.revoke_all_tokens(db, user.id)
    await record_audit(
        db, action="user.change_password", actor_id=user.id,
        organization_id=user.organization_id, entity_type="user", entity_id=user.id,
        ip_address=client_ip(request),
    )
    return Message(detail="Password changed. Other sessions have been signed out.")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UpdateProfileRequest, user: CurrentUser, db: DB):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    return UserOut.model_validate(user)


@router.post("/me/export", response_model=Message)
async def export_my_data(user: CurrentUser, db: DB):
    """Email the requester a copy of everything held about them.

    Sent only to the address on the account. A self-service export that accepts
    a destination is a way to read somebody else's data by asking politely.
    """
    from app.services.data_export import collect, render, summarise
    from app.services.email import send_email

    if not settings.email_delivers:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Email is not configured on this server, so the export cannot be sent. "
            "Contact your administrator.",
        )

    data = await collect(db, user)
    text, html = render(data)
    result = await send_email(
        user.email,
        subject="Your Campus Netra data",
        text=text,
        html=html,
    )
    if not result.delivered:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The export was prepared but could not be emailed. Please try again shortly.",
        )

    records = sum(n for _, n in summarise(data))
    return Message(
        detail=f"Sent to {user.email} — {records} record(s) across "
               f"{len(summarise(data))} section(s)."
    )
