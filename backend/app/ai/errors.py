"""Classifies a failed AI provider call into what the router should actually
do about it -- retry the same route, cool it down and try the next one,
disable the provider outright, or give up on this request entirely. See
app/ai/router.py for how each kind maps to a decision.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class ErrorKind(str, Enum):
    RATE_LIMIT = "rate_limit"
    QUOTA_EXHAUSTED = "quota_exhausted"
    MODEL_UNAVAILABLE = "model_unavailable"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    TEMPORARY_SERVER_ERROR = "temporary_server_error"
    TIMEOUT = "timeout"
    CONNECTION_ERROR = "connection_error"
    UNSUPPORTED_CAPABILITY = "unsupported_capability"
    INVALID_REQUEST = "invalid_request"
    AUTHENTICATION_ERROR = "authentication_error"
    BILLING_REQUIRED = "billing_required"
    UNKNOWN_ERROR = "unknown_error"


# Kinds where trying the exact same (provider, model) again right now is
# pointless -- move on to the next candidate instead of retrying in place.
NO_SAME_ROUTE_RETRY = {
    ErrorKind.RATE_LIMIT, ErrorKind.QUOTA_EXHAUSTED, ErrorKind.AUTHENTICATION_ERROR,
    ErrorKind.BILLING_REQUIRED, ErrorKind.MODEL_UNAVAILABLE, ErrorKind.UNSUPPORTED_CAPABILITY,
    ErrorKind.INVALID_REQUEST,
}

# Kinds where the whole request should stop, not cycle through every other
# configured provider hoping for a different result on an identical request.
FATAL_FOR_THIS_CALL = {ErrorKind.INVALID_REQUEST}

# Default cooldown (seconds) before a route is eligible again, per kind.
# Conservative on purpose -- see app/ai/health.py; RATE_LIMIT is overridden
# per-call when the provider sends a real Retry-After.
DEFAULT_COOLDOWN_SECONDS: dict[ErrorKind, int] = {
    ErrorKind.RATE_LIMIT: 60,
    ErrorKind.QUOTA_EXHAUSTED: 6 * 3600,
    ErrorKind.MODEL_UNAVAILABLE: 300,
    ErrorKind.PROVIDER_UNAVAILABLE: 30,
    ErrorKind.TEMPORARY_SERVER_ERROR: 30,
    ErrorKind.TIMEOUT: 20,
    ErrorKind.CONNECTION_ERROR: 20,
}


class ProviderCallError(Exception):
    """Raised by a provider's complete() on any failure -- the router only
    ever has to look at .kind, never provider-specific exception types."""

    def __init__(self, kind: ErrorKind, message: str, retry_after: Optional[float] = None):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.retry_after = retry_after  # seconds, when the provider told us explicitly


def classify_http_status(status_code: int, body_text: str = "") -> ErrorKind:
    """Status-code-first classification -- shared by every provider's HTTP
    error handling. `body_text` (best-effort) disambiguates the codes that
    mean different things depending on payload, per spec: don't blindly
    fallback on every 4xx."""
    lower = (body_text or "").lower()

    if status_code == 401:
        return ErrorKind.AUTHENTICATION_ERROR
    if status_code == 402:
        return ErrorKind.BILLING_REQUIRED
    if status_code == 403:
        # Some providers (OpenRouter, Gemini) return 403 for both "your key
        # can't do this" and "you're out of free quota" -- the body usually
        # says which.
        # OpenRouter: "Key limit exceeded" / "insufficient credits" is about the
        # model being billed, not a bad key -- other (free) models still work,
        # so this must not disable the whole provider.
        if "quota" in lower or "billing" in lower or "limit" in lower or "credit" in lower:
            return ErrorKind.QUOTA_EXHAUSTED
        return ErrorKind.AUTHENTICATION_ERROR
    if status_code == 404:
        return ErrorKind.MODEL_UNAVAILABLE
    if status_code == 408:
        return ErrorKind.TIMEOUT
    if status_code == 409:
        return ErrorKind.TEMPORARY_SERVER_ERROR
    if status_code == 429:
        if "quota" in lower or "exceeded your current quota" in lower:
            return ErrorKind.QUOTA_EXHAUSTED
        return ErrorKind.RATE_LIMIT
    if status_code == 400:
        if "tool" in lower or "function" in lower or "not support" in lower or "unsupported" in lower:
            return ErrorKind.UNSUPPORTED_CAPABILITY
        return ErrorKind.INVALID_REQUEST
    if status_code in (500, 502, 503, 504):
        return ErrorKind.TEMPORARY_SERVER_ERROR
    return ErrorKind.UNKNOWN_ERROR


def classify_exception(exc: Exception) -> ErrorKind:
    """Fallback path for SDK/network exceptions that never carry a clean
    HTTP status (connection refused, DNS failure, asyncio timeout, or an
    openai-SDK exception whose .status_code we can still pull out)."""
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
    if status_code is not None:
        body = ""
        try:
            body = str(getattr(exc, "message", "") or str(exc))
        except Exception:  # noqa: BLE001
            pass
        return classify_http_status(int(status_code), body)

    name = type(exc).__name__.lower()
    if "timeout" in name:
        return ErrorKind.TIMEOUT
    if "connect" in name or "network" in name:
        return ErrorKind.CONNECTION_ERROR
    return ErrorKind.UNKNOWN_ERROR
