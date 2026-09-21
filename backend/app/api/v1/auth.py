"""Authentication endpoints: register, verify, login, refresh, password reset."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import base64

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, client_ip
from app.core.routing import CommitRoute
from app.core.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.security import (
    create_captcha_token, generate_captcha_text, hash_password, verify_captcha_token,
    verify_password,
)
from app.models.identity import NameChangeRequest, User
from app.schemas.auth import (
    AuthResponse, CaptchaOut, ChangeEmailRequest, ChangePasswordRequest, ChangePhoneRequest,
    ForgotPasswordRequest, LoginRequest, NameChangeRequestOut, RefreshRequest, RegisterRequest,
    RequestEmailChangeRequest, RequestPhoneChangeRequest, ResendCodeRequest, ResetPasswordRequest,
    TokenPair, UpdateProfileRequest, UserOut, VerifyEmailRequest,
)
from app.schemas.common import Message
from app.services import auth as auth_service
from app.services import notifications as notify_svc
from app.services.audit import record_audit
from app.services.captcha import render_captcha_png
from app.services.email import send_email, send_otp
from app.services.sms import send_otp_sms

router = APIRouter(route_class=CommitRoute, prefix="/auth", tags=["Authentication"])


def _require_captcha(token: str, answer: str) -> None:
    if not verify_captcha_token(token, answer):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Incorrect captcha. Please try again with a new one.",
        )


@router.get("/captcha", response_model=CaptchaOut)
async def get_captcha():
    """A fresh challenge for the login and forgot-password forms.

    Stateless — the answer never touches the database, so this needs no
    cleanup job and works identically across multiple app instances.
    """
    text = generate_captcha_text()
    token = create_captcha_token(text)
    png = render_captcha_png(text)
    image = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    return CaptchaOut(captcha_token=token, image=image)


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
                       dev_code=code, expires_in=settings.OTP_EXPIRE_MINUTES * 60)
    return generic


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DB, request: Request):
    _require_captcha(payload.captcha_token, payload.captcha_answer)
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
    """Enumeration-safe: the response is identical whether or not the
    email/phone is registered. Sends by whichever channel was given —
    the schema enforces exactly one of the two.
    """
    _require_captcha(payload.captcha_token, payload.captcha_answer)

    if payload.email:
        generic = Message(detail="If that address is registered, a reset code has been sent.")
        user = await db.scalar(select(User).where(User.email == payload.email))
        if user is None:
            return generic
        code = await auth_service.create_verification_code(db, user, "password_reset")
        sent = await send_otp(user.email, user.full_name, code, "password_reset")
        if not sent.delivered and settings.expose_dev_codes:
            return Message(detail="Email is not configured on this server; your code is shown below.",
                           dev_code=code, expires_in=settings.OTP_EXPIRE_MINUTES * 60)
        return generic

    generic = Message(detail="If that number is registered, a reset code has been sent.")
    user = await db.scalar(select(User).where(User.phone == payload.phone))
    if user is None:
        return generic
    code = await auth_service.create_verification_code(db, user, "password_reset")
    sent = await send_otp_sms(user.phone, code, "password_reset")
    if not sent.delivered and settings.expose_dev_phone_codes:
        return Message(detail="No SMS provider is configured on this server; your code is shown below.",
                       dev_code=code, expires_in=settings.OTP_EXPIRE_MINUTES * 60)
    return generic


@router.post("/reset-password", response_model=Message)
async def reset_password(payload: ResetPasswordRequest, db: DB, request: Request):
    if payload.email:
        user = await db.scalar(select(User).where(User.email == payload.email))
    else:
        user = await db.scalar(select(User).where(User.phone == payload.phone))
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


async def _ensure_email_free(db: DB, email: str, user: User) -> None:
    # users.email is CITEXT, so this comparison already ignores case.
    taken = await db.scalar(select(User.id).where(User.email == email, User.id != user.id))
    if taken is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email address is already in use")


@router.post("/me/change-email", response_model=Message)
async def request_email_change(payload: RequestEmailChangeRequest, user: CurrentUser, db: DB):
    """Sends a code to the new address; nothing changes until it is entered.

    The code goes to the address being claimed, because that is what needs
    proving — a code sent to the old one shows only that the requester can read
    mail they already had. It is also bound to that address, so it cannot be
    redeemed for a different one.
    """
    new_email = str(payload.new_email)
    if new_email.lower() == user.email.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your email address")
    await _ensure_email_free(db, new_email, user)

    code = await auth_service.create_verification_code(
        db, user, "email_change", bind=new_email.lower()
    )
    sent = await send_otp(new_email, user.full_name, code, "email_change")
    if sent.delivered:
        return Message(detail=f"A verification code has been sent to {new_email}.",
                       expires_in=settings.OTP_EXPIRE_MINUTES * 60)
    if settings.expose_dev_codes:
        return Message(
            detail="Email is not configured on this server; your code is shown below.",
            dev_code=code, expires_in=settings.OTP_EXPIRE_MINUTES * 60,
        )
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        f"The verification email could not be sent. {sent.error or ''}".strip(),
    )


@router.post("/me/verify-email-change", response_model=UserOut)
async def verify_email_change(
    payload: ChangeEmailRequest, user: CurrentUser, db: DB, request: Request
):
    """Redeems the code sent to the new address and moves the account onto it."""
    new_email = str(payload.new_email)
    # Checked again: the address may have been claimed since the code went out.
    await _ensure_email_free(db, new_email, user)
    await auth_service.consume_verification_code(
        db, user, "email_change", payload.otp_code, bind=new_email.lower()
    )

    old_email = user.email
    user.email = new_email
    user.email_verified_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(
        db, action="user.change_email", actor_id=user.id,
        organization_id=user.organization_id, entity_type="user", entity_id=user.id,
        ip_address=client_ip(request), before={"email": old_email}, after={"email": new_email},
    )

    # The old mailbox is the only place the real owner would hear about a change
    # they did not make, so it is told either way.
    await send_email(
        old_email,
        "Your Campus Netra email address was changed",
        f"Hello {user.full_name},\n\n"
        f"The email address on your Campus Netra account was changed to {new_email}.\n\n"
        f"If you made this change, there is nothing more to do. If you did not, "
        f"contact your campus administrator straight away.\n\n"
        f"— Campus Netra",
    )
    return UserOut.model_validate(user)


async def _ensure_phone_free(db: DB, phone: str, user: User) -> None:
    other = await db.scalar(select(User).where(User.phone == phone, User.id != user.id))
    if other is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That phone number is already in use")


@router.post("/me/change-phone", response_model=Message)
async def request_phone_change(payload: RequestPhoneChangeRequest, user: CurrentUser, db: DB):
    """Sends an OTP by SMS to the new number to prove it's reachable, same
    shape as the email-change flow. Reuses the existing 'phone_verify' OTP
    purpose, bound to the new number so a code cannot be redeemed for a
    different one.
    """
    if payload.new_phone == user.phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your phone number")
    await _ensure_phone_free(db, payload.new_phone, user)

    code = await auth_service.create_verification_code(
        db, user, "phone_verify", bind=payload.new_phone
    )

    sent = await send_otp_sms(payload.new_phone, code, "phone_verify")
    if sent.delivered:
        return Message(detail=f"A verification code has been sent to {payload.new_phone}.",
                       expires_in=settings.OTP_EXPIRE_MINUTES * 60)
    if settings.expose_dev_phone_codes:
        return Message(
            detail="No SMS provider is configured on this server; your code is shown below.",
            dev_code=code, expires_in=settings.OTP_EXPIRE_MINUTES * 60,
        )
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        f"The verification SMS could not be sent. {sent.error or ''}".strip(),
    )


@router.post("/me/verify-phone-change", response_model=UserOut)
async def verify_phone_change(payload: ChangePhoneRequest, user: CurrentUser, db: DB, request: Request):
    await _ensure_phone_free(db, payload.new_phone, user)
    await auth_service.consume_verification_code(
        db, user, "phone_verify", payload.otp_code, bind=payload.new_phone
    )

    old_phone = user.phone
    user.phone = payload.new_phone
    user.phone_verified_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(
        db, action="user.change_phone", actor_id=user.id,
        organization_id=user.organization_id, entity_type="user", entity_id=user.id,
        ip_address=client_ip(request),
        before={"phone": old_phone}, after={"phone": payload.new_phone},
    )
    return UserOut.model_validate(user)


@router.post("/me/change-name", response_model=dict)
async def request_name_change(
    user: CurrentUser, db: DB, request: Request,
    new_full_name: str = Form(..., min_length=2, max_length=120),
    id_document: UploadFile = File(...),
):
    """Changing your name needs proof, since it's what everyone else on the
    campus sees you as. Upload a photo of an ID card; if the claimed name is
    found on it with enough confidence the change applies immediately,
    otherwise it's queued for an administrator to look at.
    """
    from app.services.id_verification import (
        OcrUnavailable, contains_identifier, extract_id_number, extract_text, match_name,
    )
    from app.services.storage import StoredImage, UploadError, store_image
    from app.schemas.auth import validate_full_name

    try:
        new_full_name = validate_full_name(new_full_name)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    if new_full_name == user.full_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your name")

    existing = await db.scalar(
        select(NameChangeRequest).where(
            NameChangeRequest.user_id == user.id, NameChangeRequest.status == "pending",
        )
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have a name-change request awaiting review",
        )

    data = await id_document.read()
    try:
        # private=True: an ID card must not be reachable from the public media
        # mount, so this is stored outside it and fetched through an
        # administrator-only route instead.
        stored: StoredImage = store_image(
            data, id_document.filename, subdir="identity_verification", private=True,
        )
    except UploadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    ocr_excerpt: Optional[str] = None
    score: Optional[float] = None
    id_on_document = False
    detected_id_number: Optional[str] = None
    # The number the account already carries. Without it on the card there is
    # nothing connecting the document to the person asking, so an account that
    # has none can never be decided automatically.
    account_id = (user.enrollment_no or user.employee_id or "").strip()
    try:
        ocr_text = extract_text(data)
        result = match_name(new_full_name, ocr_text)
        score, ocr_excerpt = result.score, result.ocr_excerpt
        id_on_document = contains_identifier(ocr_text, account_id)
        detected_id_number = extract_id_number(ocr_text)
    except OcrUnavailable:
        # No Tesseract on this server — fall through with score=None, which
        # always queues for manual review rather than auto-deciding blind.
        pass

    row = NameChangeRequest(
        user_id=user.id,
        previous_name=user.full_name,
        requested_name=new_full_name,
        id_document_url=stored.url,
        ocr_excerpt=ocr_excerpt,
        match_score=score,
    )

    name_matches = score is not None and score >= settings.NAME_MATCH_THRESHOLD

    # Both halves, or a person decides: the name proves what the card says, the
    # account's own number proves the card is this person's.
    if name_matches and id_on_document:
        row.status = "auto_approved"
        row.decided_at = datetime.now(timezone.utc)
        row.decision_note = (
            f"Auto-approved: {int(score * 100)}% of name tokens matched the ID, "
            f"which also carries the account's own number."
        )
        old_name = user.full_name
        user.full_name = new_full_name
        db.add(row)
        await db.flush()
        await record_audit(
            db, action="user.change_name", actor_id=user.id,
            organization_id=user.organization_id, entity_type="user", entity_id=user.id,
            ip_address=client_ip(request), before={"full_name": old_name},
            after={"full_name": new_full_name},
        )
        return {"status": "auto_approved", "full_name": user.full_name, "match_score": score, "detected_id_number": detected_id_number}

    db.add(row)
    await db.flush()

    admins = await db.scalars(
        select(User.id).where(
            User.organization_id == user.organization_id,
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
            User.status == UserStatus.ACTIVE,
        )
    )
    await notify_svc.notify(
        db, list(admins),
        title=f"Name change requested by {user.full_name}",
        body=f"Wants to change their name to \"{new_full_name}\".",
        link="/admin/users", kind="account",
        entity_type="user", entity_id=user.id,
    )
    if name_matches and account_id:
        detail = (
            "Your ID shows that name but not your own "
            f"{'enrolment' if user.enrollment_no else 'employee'} number, "
            "so an administrator will check it."
        )
    elif name_matches:
        detail = (
            "Your account has no enrolment or employee number on file to check the ID "
            "against, so an administrator will review it."
        )
    else:
        detail = "Your ID could not be confidently matched, so an administrator will review it."

    return {"status": "pending", "detail": detail, "match_score": score, "detected_id_number": detected_id_number}


@router.get("/me/name-change-request", response_model=Optional[NameChangeRequestOut])
async def my_name_change_request(user: CurrentUser, db: DB):
    row = await db.scalar(
        select(NameChangeRequest)
        .where(NameChangeRequest.user_id == user.id)
        .order_by(NameChangeRequest.created_at.desc())
    )
    if row is None:
        return None
    return NameChangeRequestOut.model_validate(row, from_attributes=True)


@router.post("/me/weekly-report", response_model=Message)
async def email_weekly_report(user: CurrentUser, db: DB):
    """Email the requester their own last-7-days activity summary.

    Same reasoning as the data export just above: sent only to the
    address already on the account, never a destination the caller
    supplies.
    """
    from app.services.weekly_report import collect, render
    from app.services.email import send_email

    if not settings.email_delivers:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Email is not configured on this server, so the report cannot be sent. "
            "Contact your administrator.",
        )

    summary = await collect(db, user)
    text, html = render(summary)
    result = await send_email(
        user.email,
        subject="Your CampusNetra weekly summary",
        text=text,
        html=html,
    )
    if not result.delivered:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The summary was prepared but could not be emailed. Please try again shortly.",
        )

    total = (
        len(summary.issues_reported) + len(summary.issues_resolved)
        + len(summary.lf_reported) + len(summary.lf_claims)
    )
    return Message(detail=f"Sent to {user.email} — {total} item(s) from the last 7 days.")


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


class DeletionRequestBody(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


@router.post("/me/delete-request", response_model=dict)
async def request_account_deletion(
    payload: DeletionRequestBody, user: CurrentUser, db: DB
):
    """Ask an administrator to remove this account.

    Not self-service. Approval anonymises rather than deletes, because the
    reports the person filed belong to the campus's maintenance record — so
    somebody has to look at what would be kept before agreeing.
    """
    from app.models.identity import AccountDeletionRequest
    from app.services.account_removal import retained_counts

    existing = await db.scalar(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.user_id == user.id,
            AccountDeletionRequest.status == "pending",
        )
    )
    if existing is not None:
        return {
            "status": "pending",
            "requested_at": existing.created_at.isoformat(),
            "detail": "You already have a request awaiting review.",
        }

    request_row = AccountDeletionRequest(user_id=user.id, reason=payload.reason)
    db.add(request_row)
    await db.flush()

    admins = await db.scalars(
        select(User.id).where(
            User.organization_id == user.organization_id,
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
            User.status == UserStatus.ACTIVE,
        )
    )
    await notify_svc.notify(
        db, list(admins),
        title=f"Account deletion requested by {user.full_name}",
        body=payload.reason or "No reason given.",
        link="/admin/users", kind="account",
        entity_type="user", entity_id=user.id,
    )

    return {
        "status": "pending",
        "retained": await retained_counts(db, user.id),
        "detail": "Your request has been sent to an administrator.",
    }


@router.get("/me/delete-request", response_model=dict)
async def my_deletion_request(user: CurrentUser, db: DB):
    """The state of this account's request, if there is one."""
    from app.models.identity import AccountDeletionRequest

    row = await db.scalar(
        select(AccountDeletionRequest)
        .where(AccountDeletionRequest.user_id == user.id)
        .order_by(AccountDeletionRequest.created_at.desc())
    )
    if row is None or row.status in ("withdrawn", "rejected"):
        return {"status": row.status if row else None,
                "decision_note": row.decision_note if row else None}
    return {
        "status": row.status,
        "requested_at": row.created_at.isoformat(),
        "decision_note": row.decision_note,
    }


@router.delete("/me/delete-request", response_model=Message)
async def withdraw_deletion_request(user: CurrentUser, db: DB):
    from app.models.identity import AccountDeletionRequest

    row = await db.scalar(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.user_id == user.id,
            AccountDeletionRequest.status == "pending",
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No request is awaiting review")
    row.status = "withdrawn"
    return Message(detail="Request withdrawn. Your account stays as it is.")
