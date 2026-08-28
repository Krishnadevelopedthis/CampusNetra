"""Password hashing, JWT issuing/verification and OTP helpers."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

ACCESS_TOKEN = "access"
REFRESH_TOKEN = "refresh"

# bcrypt silently truncates beyond 72 bytes, so reject longer input explicitly.
_MAX_PASSWORD_BYTES = 72


# ---------- passwords ----------
def hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    if len(pw) > _MAX_PASSWORD_BYTES:
        raise ValueError("password must be at most 72 bytes")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash in the DB must read as "wrong password", never a 500.
        return False


# ---------- JWT ----------
def _create_token(subject: str, token_type: str, expires: timedelta, **claims: Any) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        # A random id makes each token individually revocable.
        "jti": secrets.token_urlsafe(16),
        **claims,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: str, role: str, org_id: str | None = None) -> str:
    return _create_token(
        user_id,
        ACCESS_TOKEN,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        role=role,
        org=str(org_id) if org_id else None,
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        user_id, REFRESH_TOKEN, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


def decode_token(token: str, expected_type: str | None = None) -> dict:
    """Raises jwt.PyJWTError subclasses on any problem — callers map to 401."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if expected_type and payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"expected a {expected_type} token")
    return payload


# ---------- opaque tokens & OTP ----------
def sha256(value: str) -> str:
    """Refresh tokens and OTPs are stored hashed, never in plaintext."""
    return hashlib.sha256(value.encode()).hexdigest()


def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)
