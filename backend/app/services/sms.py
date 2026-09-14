"""Outbound SMS.

Mirrors services/email.py: when no provider is configured, the message is
logged instead of sent, and the caller is told delivery did not happen so
it can surface that honestly instead of claiming a text is on its way.

Twilio is the only provider wired in. Its REST API is called directly with
httpx (same approach as the Resend/Brevo HTTP paths in email.py) rather than
pulling in the twilio SDK, since a POST with basic auth is all that's needed.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


@dataclass
class SendResult:
    delivered: bool
    error: Optional[str] = None
    # True when no SMS provider is configured and the message was only logged.
    logged_only: bool = False


def _api_error(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return body.get("message") or str(body)
    except Exception:
        return resp.text[:300]


def to_e164(phone: str) -> str:
    """The stored `phone` column is a bare 10-digit local number (see
    RequestPhoneChangeRequest's normalisation in schemas/auth.py, which strips
    a +91 or leading 0 off whatever the user typed) — Twilio needs the full
    E.164 form. Already-international numbers (a leading '+') are passed
    through untouched, so this stays correct if that normalisation ever
    changes to keep the country code.
    """
    phone = phone.strip()
    if phone.startswith("+"):
        return phone
    return f"{settings.SMS_DEFAULT_COUNTRY_CODE}{phone}"


async def _send_twilio(to: str, body: str) -> SendResult:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                data={"To": to_e164(to), "From": settings.TWILIO_FROM_NUMBER, "Body": body},
            )
    except httpx.HTTPError as exc:
        log.error("Could not reach Twilio: %s", exc)
        return SendResult(delivered=False, error=f"Could not reach Twilio: {exc}")

    if resp.status_code < 300:
        return SendResult(delivered=True)

    detail = _api_error(resp)
    log.error("Twilio rejected the message (%s): %s", resp.status_code, detail)
    if resp.status_code == 401:
        return SendResult(delivered=False,
                          error="Twilio rejected the request. Check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.")
    if "unverified" in detail.lower() or "not verified" in detail.lower():
        # Twilio trial accounts can only text numbers you've manually
        # verified in the console — the single most common failure here,
        # and one that "check your credentials" would misdiagnose.
        return SendResult(
            delivered=False,
            error=("Twilio trial accounts can only send to phone numbers verified in the "
                   "console (Phone Numbers → Verified Caller IDs), or upgrade the account "
                   "to send to any number."))
    if "not a valid" in detail.lower() or "invalid" in detail.lower():
        return SendResult(delivered=False,
                          error=f"Twilio rejected the phone number or sender: {detail}")
    return SendResult(delivered=False, error=f"Twilio error: {detail}")


async def send_sms(to: str, body: str) -> SendResult:
    if settings.SMS_PROVIDER == "twilio":
        if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
            return SendResult(delivered=False,
                              error="SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/"
                                    "TWILIO_FROM_NUMBER are not all set.")
        return await _send_twilio(to, body)

    log.info("\n%s\n  SMS NOT SENT — no SMS provider configured\n  To: %s\n\n%s\n%s",
             "=" * 70, to, body, "=" * 70)
    return SendResult(delivered=False, logged_only=True,
                      error="SMS delivery is not configured on this server.")


# What each purpose is for, in one short sentence — SMS has no room for the
# email template's framing, so the whole message has to fit in ~150 chars.
_OTP_COPY = {
    "phone_verify": "to verify this phone number",
    "password_reset": "to reset your password",
}
_OTP_DEFAULT = "to confirm this request"


async def send_otp_sms(to: str, code: str, purpose: str) -> SendResult:
    action = _OTP_COPY.get(purpose, _OTP_DEFAULT)
    body = (f"{code} is your Campus Netra code {action}. "
             f"Expires in {settings.OTP_EXPIRE_MINUTES} minutes. Don't share this code.")
    return await send_sms(to, body)


async def verify_sms_connection() -> SendResult:
    """Check the SMS provider without sending anything, for the /health probe
    and the check-sms script."""
    if settings.SMS_PROVIDER != "twilio":
        return SendResult(delivered=False, logged_only=True,
                          error="No SMS provider configured.")
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
        return SendResult(delivered=False,
                          error="TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are not set.")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN))
    except httpx.HTTPError as exc:
        return SendResult(delivered=False, error=f"Could not reach Twilio: {exc}")

    if resp.status_code < 300:
        if not settings.TWILIO_FROM_NUMBER:
            return SendResult(delivered=False,
                              error="Credentials are valid but TWILIO_FROM_NUMBER is not set.")
        return SendResult(delivered=True)
    if resp.status_code == 401:
        return SendResult(delivered=False,
                          error="Twilio rejected TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.")
    return SendResult(delivered=False, error=_api_error(resp))
