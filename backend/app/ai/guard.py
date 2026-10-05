"""Privacy and secrecy guard for the AI Agent.

The system prompt tells the model not to reveal credentials or other people's
data, but a prompt is a request, not a control. This module is the control: it
runs in code on both sides of the model, so a jailbroken or confused model
still cannot hand over what it was never given, and cannot print what looks
like a secret.

  * `redact_tool_result` runs on every tool result BEFORE the model sees it.
    It strips credential-like keys everywhere, and strips contact details and
    identifiers of any person who is not the caller (reporters, claimants,
    technicians that a record happens to embed). The caller's own profile is
    left intact — it is their data.
  * `scrub_reply` runs on the model's final text BEFORE it is returned. It
    masks the live configured secrets by value, anything shaped like a token,
    key, password or connection string, and email addresses that are not the
    caller's own (or the public support address).
"""
from __future__ import annotations

import re
from typing import Any

from app.core.config import settings

HIDDEN = "[hidden]"

# Keys whose values are credentials in any record, whoever owns it.
_SECRET_KEY_RE = re.compile(
    r"(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|"
    r"hashed|hash|otp|credential|private[_-]?key|dsn|connection[_-]?string|"
    r"verification[_-]?code|reset[_-]?code)",
    re.IGNORECASE,
)

# Contact details / identifiers of a person. Dropped for anyone but the caller.
_PERSONAL_KEYS = frozenset({
    "email", "phone", "mobile", "enrollment_no", "employee_id", "student_id",
    "id_number", "avatar_url", "last_login_at", "email_verified_at",
    "phone_verified_at", "date_of_birth", "address",
})
# A mapping that carries one of these keys describes a person.
_PERSON_MARKERS = frozenset({"email", "full_name", "phone", "enrollment_no", "employee_id"})
# Whole sub-records that only ever hold another person's declaration or proof.
_PRIVATE_PREFIXES = ("declared_",)
_PRIVATE_KEYS = frozenset({
    "handover_proof_url", "proof_urls", "proof_note", "declaration_text", "contact_pref",
})


def _is_self(node: dict, user) -> bool:
    ident = node.get("id") or node.get("user_id") or node.get("reported_by")
    return ident is not None and str(ident) == str(user.id)


def _is_staff(user) -> bool:
    from app.api.deps import STAFF_ROLES

    return user.role in STAFF_ROLES


def redact_tool_result(value: Any, user) -> Any:
    """Return a copy of a tool result that is safe to show the model."""
    if isinstance(value, list):
        return [redact_tool_result(v, user) for v in value]
    if not isinstance(value, dict):
        return value

    describes_person = bool(_PERSON_MARKERS & value.keys())
    mine = describes_person and _is_self(value, user)
    staff = _is_staff(user)
    out: dict = {}
    for key, val in value.items():
        k = str(key)
        if _SECRET_KEY_RE.search(k):
            continue
        if k in _PRIVATE_KEYS or k.startswith(_PRIVATE_PREFIXES):
            continue
        if describes_person and not mine:
            if k in _PERSONAL_KEYS:
                continue
            # Students and teachers do not need to see who else reported or
            # claimed something; staff may see a name to coordinate work.
            if not staff and k in ("full_name", "designation"):
                continue
        out[key] = redact_tool_result(val, user)
    return out


# --- reply scrubbing -------------------------------------------------------

_PATTERNS: tuple[re.Pattern, ...] = (
    re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),            # JWT
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b"),                                     # sk-... keys
    re.compile(r"\b(?:gsk|ghp|gho|xox[abp]|AKIA|AIza)[A-Za-z0-9_-]{16,}\b"),               # vendor keys
    re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s:/@]+:[^\s@/]+@[^\s]+", re.IGNORECASE),          # scheme://user:pass@host
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{16,}"),
    re.compile(
        r"(?i)\b(password|passwd|pwd|secret|api[_ -]?key|token|otp|passcode)\b"
        r"(\s*(?:is|=|:)\s*)[\"']?[^\s\"',;]{4,}"
    ),
)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _configured_secrets() -> list[str]:
    """Live secret values from settings (by value, so a leak is caught even in
    a shape no pattern predicts)."""
    found: list[str] = []
    for name in dir(settings):
        if name.startswith("_") or not name.isupper():
            continue
        if not re.search(r"(KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL|DSN|SMTP_PASS)", name):
            continue
        val = getattr(settings, name, None)
        if isinstance(val, str) and len(val) >= 8:
            found.append(val)
    return sorted(set(found), key=len, reverse=True)


def scrub_reply(text: str, user) -> str:
    """Mask secrets and other people's email addresses in the model's reply."""
    if not text:
        return text
    for secret in _configured_secrets():
        text = text.replace(secret, HIDDEN)
    for pat in _PATTERNS:
        if pat.groups >= 2:
            text = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}{HIDDEN}", text)
        else:
            text = pat.sub(HIDDEN, text)

    allowed = {str(getattr(user, "email", "")).lower(), str(settings.SUPPORT_EMAIL).lower()}
    return _EMAIL_RE.sub(lambda m: m.group(0) if m.group(0).lower() in allowed else HIDDEN, text)
