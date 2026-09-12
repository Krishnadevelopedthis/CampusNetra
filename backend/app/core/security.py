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


# ---------- captcha ----------
# The answer never touches the server's storage: it travels to the client as a
# JWT carrying only a hash of itself, so checking one needs no DB table.
#
# What the server does keep is which challenges have been spent. A token that
# can be answered once and then replayed for the rest of its life puts no limit
# on anything — one solved image would cover every password guess made in the
# next five minutes — so each is retired the first time it is checked.
#
# A small map pruned as it goes, not a table: nothing to migrate, nothing to
# clean up, and a restart at worst lets a token be reused within the minutes it
# had left. Across several instances a token could be spent once per instance;
# a shared cache is the next step if it is ever deployed that way.
CAPTCHA_TOKEN = "captcha"

_spent_captchas: dict[str, float] = {}
_SPENT_CAPTCHA_LIMIT = 20_000


def _spend_captcha(jti: str, expires_at: float) -> bool:
    """True the first time a challenge is presented, False every time after."""
    now = datetime.now(timezone.utc).timestamp()

    if len(_spent_captchas) >= _SPENT_CAPTCHA_LIMIT:
        for key in [k for k, exp in _spent_captchas.items() if exp <= now]:
            _spent_captchas.pop(key, None)
        if len(_spent_captchas) >= _SPENT_CAPTCHA_LIMIT:
            # Nothing had expired, so forget the oldest rather than grow without
            # bound. Those tokens outlive their record, which costs a replay at
            # most — the alternative is unbounded memory.
            oldest = sorted(_spent_captchas.items(), key=lambda kv: kv[1])
            for key, _ in oldest[: _SPENT_CAPTCHA_LIMIT // 2]:
                _spent_captchas.pop(key, None)

    if jti in _spent_captchas:
        return False
    _spent_captchas[jti] = expires_at
    return True

# Excludes visually ambiguous characters (0/O, 1/I/l) so a person reading the
# distorted image isn't fighting the font as well as the noise.
_CAPTCHA_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def generate_captcha_text(length: int = 5) -> str:
    return "".join(secrets.choice(_CAPTCHA_ALPHABET) for _ in range(length))


def _captcha_answer_hash(answer: str) -> str:
    return sha256(answer.strip().upper())


def create_captcha_token(answer: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "type": CAPTCHA_TOKEN,
        "ans": _captcha_answer_hash(answer),
        "iat": now,
        "exp": now + timedelta(minutes=settings.CAPTCHA_EXPIRE_MINUTES),
        "jti": secrets.token_urlsafe(8),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_captcha_token(token: str, answer: str) -> bool:
    """False on anything wrong — expired, malformed, wrong type, wrong answer,
    or a challenge that has already been answered once.

    Never raises: a captcha is a UX gate, not an auth boundary, so the caller
    always gets a clean yes/no to turn into "incorrect, try again".
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return False
    if payload.get("type") != CAPTCHA_TOKEN:
        return False

    jti, expires_at = payload.get("jti"), payload.get("exp")
    if not jti or not expires_at:
        return False

    # Spent before the answer is compared, so a wrong guess burns the challenge
    # too — otherwise a single image could be guessed at until it gave way.
    if not _spend_captcha(str(jti), float(expires_at)):
        return False

    return payload.get("ans") == _captcha_answer_hash(answer)
