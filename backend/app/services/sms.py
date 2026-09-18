"""Outbound SMS.

Mirrors services/email.py: when no provider is configured, the message is
logged instead of sent, and the caller is told delivery did not happen so
it can surface that honestly instead of claiming a text is on its way.

SMS providers supported:
- Brevo
- Twilio
- Self-hosted Android SMS Gateway

The self-hosted gateway exposes:
    POST /api/send

with:
    {
        "phone_number": "+919XXXXXXXXX",
        "message": "Campus Netra verification code..."
    }

Authentication:
    X-API-Key: <gateway API key>

See EMAIL_AND_SMS_SETUP.md for setup details.
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

        if isinstance(body, dict):
            return (
                body.get("message")
                or body.get("error")
                or body.get("detail")
                or str(body)
            )

        return str(body)

    except Exception:
        return resp.text[:300]


def to_e164(phone: str) -> str:
    """The stored `phone` column is a bare 10-digit local number.

    A leading '+91' is passed through unchanged.

    A bare Indian number such as:
        9876543210

    becomes:
        +919876543210
    """

    phone = phone.strip()

    if phone.startswith("+"):
        return phone

    # Handle a leading zero defensively.
    if phone.startswith("0"):
        phone = phone[1:]

    return f"{settings.SMS_DEFAULT_COUNTRY_CODE}{phone}"


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------

async def _send_twilio(to: str, body: str) -> SendResult:
    url = (
        "https://api.twilio.com/2010-04-01/"
        f"Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                auth=(
                    settings.TWILIO_ACCOUNT_SID,
                    settings.TWILIO_AUTH_TOKEN,
                ),
                data={
                    "To": to_e164(to),
                    "From": settings.TWILIO_FROM_NUMBER,
                    "Body": body,
                },
            )

    except httpx.HTTPError as exc:
        log.error("Could not reach Twilio: %s", exc)

        return SendResult(
            delivered=False,
            error=f"Could not reach Twilio: {exc}",
        )

    if resp.status_code < 300:
        return SendResult(delivered=True)

    detail = _api_error(resp)

    log.error(
        "Twilio rejected the message (%s): %s",
        resp.status_code,
        detail,
    )

    if resp.status_code == 401:
        return SendResult(
            delivered=False,
            error=(
                "Twilio rejected the request. "
                "Check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN."
            ),
        )

    if "unverified" in detail.lower() or "not verified" in detail.lower():
        return SendResult(
            delivered=False,
            error=(
                "Twilio trial accounts can only send to phone numbers "
                "verified in the console (Phone Numbers → Verified Caller IDs), "
                "or upgrade the account to send to any number."
            ),
        )

    if "not a valid" in detail.lower() or "invalid" in detail.lower():
        return SendResult(
            delivered=False,
            error=f"Twilio rejected the phone number or sender: {detail}",
        )

    return SendResult(
        delivered=False,
        error=f"Twilio error: {detail}",
    )


# ---------------------------------------------------------------------------
# Brevo
# ---------------------------------------------------------------------------

BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/send"


async def _send_brevo(to: str, body: str) -> SendResult:
    """Send transactional SMS through Brevo."""

    if not settings.BREVO_API_KEY:
        return SendResult(
            delivered=False,
            error="BREVO_API_KEY is not configured.",
        )

    if not settings.BREVO_SMS_SENDER:
        return SendResult(
            delivered=False,
            error="BREVO_SMS_SENDER is not configured.",
        )

    recipient = to_e164(to)

    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }

    payload = {
        "sender": settings.BREVO_SMS_SENDER,
        "recipient": recipient,
        "content": body,
        "type": "transactional",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                BREVO_SMS_URL,
                headers=headers,
                json=payload,
            )

    except httpx.HTTPError as exc:
        log.error("Could not reach Brevo SMS API: %s", exc)

        return SendResult(
            delivered=False,
            error=f"Could not reach Brevo SMS API: {exc}",
        )

    if resp.status_code < 300:
        try:
            data = resp.json()

            log.info(
                "Brevo SMS accepted: recipient=%s message_id=%s",
                recipient,
                data.get("messageId"),
            )

        except Exception:
            log.info(
                "Brevo SMS accepted: recipient=%s",
                recipient,
            )

        return SendResult(delivered=True)

    detail = _api_error(resp)

    log.error(
        "Brevo rejected SMS (%s): %s",
        resp.status_code,
        detail,
    )

    if resp.status_code == 401:
        return SendResult(
            delivered=False,
            error="Brevo rejected the API key. Check BREVO_API_KEY.",
        )

    if resp.status_code == 400:
        return SendResult(
            delivered=False,
            error=f"Brevo rejected the SMS request: {detail}",
        )

    return SendResult(
        delivered=False,
        error=f"Brevo SMS error: {detail}",
    )



# ---------------------------------------------------------------------------
# SmsHorizon
# ---------------------------------------------------------------------------

SMSHORIZON_URL = "https://smshorizon.co.in/api/v2/sendsms.php"


async def _send_smshorizon(to: str, body: str) -> SendResult:
    """Send SMS through SmsHorizon."""

    if not settings.SMSHORIZON_API_KEY:
        return SendResult(
            delivered=False,
            error="SMSHORIZON_API_KEY is not configured.",
        )

    recipient = to_e164(to)

    headers = {
        "Authorization": f"Bearer {settings.SMSHORIZON_API_KEY}",
        "accept": "application/json",
    }

    payload = {
        "mobile": recipient,
        "message": body,
        "senderid": settings.SMSHORIZON_SENDER_ID,
        "tid": settings.SMSHORIZON_TEMPLATE_ID,
        "type": "txt",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                SMSHORIZON_URL,
                headers=headers,
                data=payload,
            )

    except httpx.HTTPError as exc:
        log.error("Could not reach SmsHorizon: %s", exc)
        return SendResult(
            delivered=False,
            error=f"Could not reach SmsHorizon: {exc}",
        )

    if resp.status_code < 300:
        log.info("SmsHorizon accepted SMS: recipient=%s", recipient)
        return SendResult(delivered=True)

    detail = _api_error(resp)

    log.error(
        "SmsHorizon rejected SMS (%s): %s",
        resp.status_code,
        detail,
    )

    return SendResult(
        delivered=False,
        error=f"SmsHorizon error: {detail}",
    )







# ---------------------------------------------------------------------------
# Self-hosted Android SMS Gateway
# ---------------------------------------------------------------------------

async def _send_self_hosted(to: str, body: str) -> SendResult:
    """Send SMS through the self-hosted Android SMS Gateway.

    The public gateway URL is configured through:

        SELF_HOSTED_SMS_URL

    The API key is configured through:

        SELF_HOSTED_SMS_API_KEY

    The endpoint used is:

        POST {SELF_HOSTED_SMS_URL}/api/send
    """

    if not settings.SELF_HOSTED_SMS_URL:
        return SendResult(
            delivered=False,
            error="SELF_HOSTED_SMS_URL is not configured.",
        )

    if not settings.SELF_HOSTED_SMS_API_KEY:
        return SendResult(
            delivered=False,
            error="SELF_HOSTED_SMS_API_KEY is not configured.",
        )

    recipient = to_e164(to)

    url = (
        settings.SELF_HOSTED_SMS_URL.strip().rstrip("/")
        + "/api/send"
    )

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "X-API-Key": settings.SELF_HOSTED_SMS_API_KEY,
    }

    payload = {
        "phone_number": recipient,
        "message": body,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=10,
                read=20,
                write=10,
                pool=10,
            )
        ) as client:
            resp = await client.post(
                url,
                headers=headers,
                json=payload,
            )

    except httpx.ConnectError as exc:
        log.error(
            "Could not connect to self-hosted SMS gateway: %s",
            exc,
        )

        return SendResult(
            delivered=False,
            error=(
                "Could not connect to the self-hosted SMS gateway. "
                "Check the Cloudflare Tunnel, Windows PC, Android gateway, "
                "and SELF_HOSTED_SMS_URL."
            ),
        )

    except httpx.TimeoutException:
        log.error(
            "Self-hosted SMS gateway request timed out."
        )

        return SendResult(
            delivered=False,
            error=(
                "The self-hosted SMS gateway timed out while "
                "processing the request."
            ),
        )

    except httpx.HTTPError as exc:
        log.error(
            "Could not reach self-hosted SMS gateway: %s",
            exc,
        )

        return SendResult(
            delivered=False,
            error=f"Could not reach self-hosted SMS gateway: {exc}",
        )

    if resp.status_code < 300:
        try:
            data = resp.json()

            log.info(
                "Self-hosted SMS gateway accepted message: "
                "recipient=%s sms_id=%s status=%s",
                recipient,
                data.get("sms_id"),
                data.get("status"),
            )

        except Exception:
            log.info(
                "Self-hosted SMS gateway accepted message: "
                "recipient=%s",
                recipient,
            )

        return SendResult(delivered=True)

    detail = _api_error(resp)

    log.error(
        "Self-hosted SMS gateway rejected message (%s): %s",
        resp.status_code,
        detail,
    )

    if resp.status_code in (401, 403):
        return SendResult(
            delivered=False,
            error=(
                "The self-hosted SMS gateway rejected the API key. "
                "Check SELF_HOSTED_SMS_API_KEY."
            ),
        )

    if resp.status_code == 400:
        return SendResult(
            delivered=False,
            error=(
                "The self-hosted SMS gateway rejected the request: "
                f"{detail}"
            ),
        )

    if resp.status_code == 429:
        return SendResult(
            delivered=False,
            error=(
                "The self-hosted SMS gateway rate limit was exceeded. "
                "Please retry later."
            ),
        )

    return SendResult(
        delivered=False,
        error=f"Self-hosted SMS gateway error: {detail}",
    )


# ---------------------------------------------------------------------------
# SMS Provider Dispatcher
# ---------------------------------------------------------------------------

async def send_sms(to: str, body: str) -> SendResult:
    provider = (settings.SMS_PROVIDER or "").strip().lower()

    # SmsHorizon
    if provider == "smshorizon":
        return await _send_smshorizon(to, body)
    # Self-hosted Android SMS Gateway
    if provider == "self_hosted":
        return await _send_self_hosted(to, body)

    # Existing Brevo SMS support
    if provider == "brevo":
        return await _send_brevo(to, body)

    # Existing Twilio SMS support
    if provider == "twilio":
        if not (
            settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_FROM_NUMBER
        ):
            return SendResult(
                delivered=False,
                error=(
                    "SMS_PROVIDER=twilio but "
                    "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/"
                    "TWILIO_FROM_NUMBER are not all set."
                ),
            )

        return await _send_twilio(to, body)

    # Existing no-provider behavior
    log.info(
        "\n%s\n"
        "  SMS NOT SENT — no supported SMS provider configured\n"
        "  Provider: %s\n"
        "  To: %s\n\n"
        "%s\n%s",
        "=" * 70,
        provider or "none",
        to,
        body,
        "=" * 70,
    )

    return SendResult(
        delivered=False,
        logged_only=True,
        error="SMS delivery is not configured on this server.",
    )


# ---------------------------------------------------------------------------
# OTP SMS
# ---------------------------------------------------------------------------

# What each purpose is for, in one short sentence — SMS has no room for the
# email template's framing, so the whole message has to fit in ~150 chars.
_OTP_COPY = {
    "phone_verify": "to verify this phone number",
    "password_reset": "to reset your password",
}

_OTP_DEFAULT = "to confirm this request"


async def send_otp_sms(
    to: str,
    code: str,
    purpose: str,
) -> SendResult:
    action = _OTP_COPY.get(purpose, _OTP_DEFAULT)

    body = (
        f"{code} is your Campus Netra code {action}. "
        f"Expires in {settings.OTP_EXPIRE_MINUTES} minutes. "
        "Don't share this code with anyone"
    )

    return await send_sms(to, body)


# ---------------------------------------------------------------------------
# SMS Provider Health Check
# ---------------------------------------------------------------------------

async def verify_sms_connection() -> SendResult:
    """Check the configured SMS provider without sending anything.

    Used by the /health probe and admin SMS status diagnostic.
    """

    provider = (settings.SMS_PROVIDER or "").strip().lower()

    # ---------------------------------------------------------
    # Self-hosted Android SMS Gateway
    # ---------------------------------------------------------

    if provider == "self_hosted":
        if not settings.SELF_HOSTED_SMS_URL:
            return SendResult(
                delivered=False,
                error="SELF_HOSTED_SMS_URL is not set.",
            )

        if not settings.SELF_HOSTED_SMS_API_KEY:
            return SendResult(
                delivered=False,
                error="SELF_HOSTED_SMS_API_KEY is not set.",
            )

        # /api/info does not send an SMS.
        # It is therefore safe for health checks.
        url = (
            settings.SELF_HOSTED_SMS_URL.strip().rstrip("/")
            + "/api/info"
        )

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    url,
                    headers={
                        "accept": "application/json",
                    },
                )

        except httpx.ConnectError as exc:
            log.error(
                "Could not connect to self-hosted SMS gateway: %s",
                exc,
            )

            return SendResult(
                delivered=False,
                error=(
                    "Could not connect to the self-hosted SMS gateway. "
                    "Check the Cloudflare Tunnel and Android gateway."
                ),
            )

        except httpx.TimeoutException:
            return SendResult(
                delivered=False,
                error="Self-hosted SMS gateway timed out.",
            )

        except httpx.HTTPError as exc:
            return SendResult(
                delivered=False,
                error=(
                    f"Could not reach self-hosted SMS gateway: {exc}"
                ),
            )

        if resp.status_code < 300:
            try:
                data = resp.json()

                if data.get("status") == "active":
                    log.info(
                        "Self-hosted SMS gateway is active: version=%s",
                        data.get("version"),
                    )

                    return SendResult(delivered=True)

            except Exception:
                pass

            return SendResult(
                delivered=False,
                error=(
                    "Self-hosted SMS gateway responded, but the "
                    "gateway status was not recognized as active."
                ),
            )

        detail = _api_error(resp)

        return SendResult(
            delivered=False,
            error=(
                "Self-hosted SMS gateway health check failed "
                f"({resp.status_code}): {detail}"
            ),
        )

    # ---------------------------------------------------------
    # Existing Brevo health check
    # ---------------------------------------------------------

    if provider == "brevo":
        if not settings.BREVO_API_KEY:
            return SendResult(
                delivered=False,
                error="BREVO_API_KEY is not set.",
            )

        if not settings.BREVO_SMS_SENDER:
            return SendResult(
                delivered=False,
                error="BREVO_SMS_SENDER is not set.",
            )

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.brevo.com/v3/account",
                    headers={
                        "accept": "application/json",
                        "api-key": settings.BREVO_API_KEY,
                    },
                )

        except httpx.HTTPError as exc:
            return SendResult(
                delivered=False,
                error=f"Could not reach Brevo: {exc}",
            )

        if resp.status_code < 300:
            return SendResult(delivered=True)

        if resp.status_code == 401:
            return SendResult(
                delivered=False,
                error="Brevo rejected BREVO_API_KEY.",
            )

        return SendResult(
            delivered=False,
            error=_api_error(resp),
        )

    # ---------------------------------------------------------
    # Existing Twilio health check
    # ---------------------------------------------------------

    if provider == "twilio":
        if not (
            settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
        ):
            return SendResult(
                delivered=False,
                error=(
                    "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN "
                    "are not set."
                ),
            )

        url = (
            "https://api.twilio.com/2010-04-01/"
            f"Accounts/{settings.TWILIO_ACCOUNT_SID}.json"
        )

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    url,
                    auth=(
                        settings.TWILIO_ACCOUNT_SID,
                        settings.TWILIO_AUTH_TOKEN,
                    ),
                )

        except httpx.HTTPError as exc:
            return SendResult(
                delivered=False,
                error=f"Could not reach Twilio: {exc}",
            )

        if resp.status_code < 300:
            if not settings.TWILIO_FROM_NUMBER:
                return SendResult(
                    delivered=False,
                    error=(
                        "Credentials are valid but "
                        "TWILIO_FROM_NUMBER is not set."
                    ),
                )

            return SendResult(delivered=True)

        if resp.status_code == 401:
            return SendResult(
                delivered=False,
                error=(
                    "Twilio rejected "
                    "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN."
                ),
            )

        return SendResult(
            delivered=False,
            error=_api_error(resp),
        )

    # ---------------------------------------------------------
    # No provider
    # ---------------------------------------------------------

    return SendResult(
        delivered=False,
        logged_only=True,
        error="No SMS provider configured.",
    )
