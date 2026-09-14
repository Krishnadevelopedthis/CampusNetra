"""Outbound email.

SMTP is blocking, so every send runs in a worker thread — a slow or unreachable
mail server must never stall the API event loop.

When no SMTP host is configured the message is logged instead of sent, and the
caller is told delivery did not happen so it can surface that honestly rather
than claiming an email is on its way.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from typing import Optional

from app.core.config import settings

log = logging.getLogger(__name__)


def _tls_context() -> ssl.SSLContext:
    """TLS context for SMTP.

    Python installed from python.org ships no system CA bundle on macOS, so
    ssl.create_default_context() fails to verify any server certificate. certifi
    provides the bundle; fall back to the platform default where it is absent.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


@dataclass
class SendResult:
    delivered: bool
    error: Optional[str] = None
    # True when SMTP is unconfigured and the message was only logged.
    logged_only: bool = False


def _no_sender_error(var_name: str = "SMTP_FROM") -> str:
    value = getattr(settings, var_name, "")
    return (
        f"{var_name} is not a usable address (got {value!r}). "
        "Set it to either 'you@example.com' or 'Campus Netra <you@example.com>' "
        "— with no surrounding quotes when setting it in a hosting dashboard."
    )


def _sender() -> tuple[str, str]:
    """The display name and address messages are sent from.

    SMTP_FROM is quoted in a .env file — `SMTP_FROM="Campus Netra <a@b.com>"` —
    because a value containing spaces has to be. A hosting dashboard takes the
    value literally, so pasting that same line into one leaves the quotes as
    part of the string, and parseaddr then reads the entire thing as the
    address. SMTP tolerates that; an HTTPS API rejects it, and in production
    the failure is invisible because the fallback code is hidden. Stripping the
    wrapper here means the value works wherever it was copied from.
    """
    raw = (settings.SMTP_FROM or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()

    name, addr = parseaddr(raw)
    # An empty address is reported as such rather than substituted. SMTP_USER
    # looks like a fallback but for Brevo it is a relay login, not a mailbox —
    # sending as it produces an opaque provider rejection instead of the
    # message that says which variable to fix.
    return name or settings.APP_NAME, addr if "@" in addr else ""




def _resend_sender() -> tuple[str, str]:
    """The display name and address Resend sends from — RESEND_FROM, not
    SMTP_FROM. Kept separate from `_sender()` because the two providers are
    commonly configured to send as different addresses (e.g. Brevo for
    forgot-password, Resend for the profile email-change flow)."""
    raw = (settings.RESEND_FROM or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()

    name, addr = parseaddr(raw)
    if "@" not in addr:
        return "", ""
    return name or settings.APP_NAME, addr


def _build(to: str, subject: str, text: str, html: Optional[str]) -> EmailMessage:
    msg = EmailMessage()
    name, addr = _sender()
    msg["From"] = formataddr((name, addr or settings.SMTP_USER))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain="campusnetra.app")
    # Verification codes are transactional; keep them out of bulk-mail folders.
    msg["Auto-Submitted"] = "auto-generated"
    msg["X-Auto-Response-Suppress"] = "All"

    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    return msg


def _auth_hint() -> str:
    """Authentication failures look identical across providers, but the cause and
    the fix differ, so key the guidance off the configured host."""
    host = (settings.SMTP_HOST or "").lower()

    if "brevo" in host or "sendinblue" in host:
        # Brevo returns a bare 535 for all three of these, so list them in the
        # order they actually catch people out.
        return (
            "Brevo rejected the connection (535). Brevo reports all of these as a "
            "generic auth failure: (1) your IP is not on the authorized list — "
            "Brevo blocks unlisted IPs by default, see SMTP & API > 'authorized IP "
            "addresses'; (2) SMTP_USER must be the relay login from that page "
            "(it looks like 9a1b2c001@smtp-brevo.com), not your account email; "
            "(3) a new "
            "account stays under review until activated."
        )
    if "gmail" in host or "google" in host:
        return (
            "Gmail rejected the credentials. Use a 16-character App Password, not "
            "your account password — and 2-Step Verification must be enabled first."
        )
    if "outlook" in host or "office365" in host:
        return (
            "Outlook rejected the credentials. Modern Microsoft accounts usually "
            "require an app password, and SMTP AUTH may be disabled on the tenant."
        )
    return ("SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD match "
            "exactly what your provider's SMTP settings page shows.")


async def _send_resend(to: str, subject: str, text: str, html: Optional[str]) -> SendResult:
    """Resend's HTTPS API. Used where outbound SMTP is blocked."""
    import httpx

    name, addr = _resend_sender()
    if not addr:
        return SendResult(delivered=False, error=_no_sender_error("RESEND_FROM"))
    sender = formataddr((name, addr))

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={"from": sender, "to": [to], "subject": subject,
                      "text": text, **({"html": html} if html else {})},
            )
    except Exception as exc:
        log.error("Resend request failed: %s", exc)
        return SendResult(delivered=False, error=f"Could not reach Resend: {exc}")

    if resp.status_code < 300:
        return SendResult(delivered=True)

    detail = _api_error(resp)
    log.error("Resend rejected the message (%s): %s", resp.status_code, detail)
    # 401 is unambiguous: the key itself was rejected. 403, however, is what
    # Resend also returns for an unverified sending domain — a wrong-looking
    # "API key" message on a 403 that was actually about the *domain* sends
    # someone re-checking (and re-pasting) a key that was correct all along.
    # The domain problem is the common case once a key is confirmed correct,
    # so check the message before assuming which one it is.
    if resp.status_code == 401:
        return SendResult(delivered=False,
                          error="Resend rejected the API key. Check RESEND_API_KEY.")
    if "domain" in detail.lower() or "verify" in detail.lower():
        return SendResult(
            delivered=False,
            error=(f"Resend refused to send from {addr!r}: {detail} Until you verify "
                   "that domain with Resend (Domains tab — add the DNS records it gives "
                   "you), the from address must be onboarding@resend.dev, and mail can "
                   "only go to the address that owns the Resend account."))
    if resp.status_code == 403:
        return SendResult(delivered=False,
                          error="Resend rejected the API key. Check RESEND_API_KEY.")
    return SendResult(delivered=False, error=f"Resend error: {detail}")


async def _send_brevo_api(to: str, subject: str, text: str, html: Optional[str]) -> SendResult:
    """Brevo's HTTPS API — same account as their SMTP relay, different transport."""
    import httpx

    name, addr = _sender()
    if not addr:
        return SendResult(delivered=False, error=_no_sender_error())

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.BREVO_API_KEY,
                         "content-type": "application/json"},
                json={
                    "sender": {"email": addr, "name": name},
                    "to": [{"email": to}],
                    "subject": subject,
                    "textContent": text,
                    **({"htmlContent": html} if html else {}),
                },
            )
    except Exception as exc:
        log.error("Brevo API request failed: %s", exc)
        return SendResult(delivered=False, error=f"Could not reach Brevo: {exc}")

    if resp.status_code < 300:
        return SendResult(delivered=True)

    detail = _api_error(resp)
    log.error("Brevo API rejected the message (%s): %s", resp.status_code, detail)
    if resp.status_code == 401:
        return SendResult(
            delivered=False,
            error=("Brevo rejected the API key. Note this is the API key from "
                   "'API keys & MCP', which starts xkeysib- — not the SMTP key."))
    return SendResult(delivered=False, error=f"Brevo error: {detail}")


def _api_error(resp) -> str:
    """Pull a usable message out of a provider's error body."""
    try:
        body = resp.json()
    except Exception:
        return resp.text[:200]
    for key in ("message", "error", "detail"):
        if isinstance(body.get(key), str):
            return body[key]
    return str(body)[:200]


def _send_blocking(msg: EmailMessage) -> SendResult:
    """Runs on a worker thread. Never raises — returns the failure instead."""
    host, port = settings.SMTP_HOST, settings.SMTP_PORT
    context = _tls_context()

    try:
        # Port 465 is implicit TLS; everything else starts plaintext and upgrades.
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=20, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=20)

        with server:
            server.ehlo()
            if port != 465 and server.has_extn("starttls"):
                server.starttls(context=context)
                server.ehlo()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        return SendResult(delivered=True)

    except smtplib.SMTPAuthenticationError as exc:
        log.error("SMTP authentication failed for %s: %s", settings.SMTP_USER, exc)
        return SendResult(delivered=False, error=_auth_hint())
    except smtplib.SMTPRecipientsRefused:
        return SendResult(delivered=False, error="The recipient address was rejected.")
    except ssl.SSLCertVerificationError as exc:
        log.error("SMTP TLS verification failed for %s: %s", host, exc)
        return SendResult(
            delivered=False,
            error=("Could not verify the mail server's TLS certificate. "
                   "Install certifi in the backend virtualenv: "
                   "backend/.venv/bin/pip install certifi"),
        )
    except (smtplib.SMTPException, OSError) as exc:
        log.error("SMTP send failed via %s:%s — %s", host, port, exc)
        return SendResult(delivered=False, error=f"Could not reach the mail server: {exc}")


async def send_email(
    to: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
    provider: Optional[str] = None,
) -> SendResult:
    provider = provider or settings.email_provider

    if provider == "none":
        log.info(
            "\n%s\n  EMAIL NOT SENT — no email provider configured\n  To: %s\n  Subject: %s\n\n%s\n%s",
            "=" * 70, to, subject, text, "=" * 70,
        )
        return SendResult(delivered=False, logged_only=True,
                          error="Email delivery is not configured on this server.")

    if provider == "resend":
        return await _send_resend(to, subject, text, html)
    if provider == "brevo":
        return await _send_brevo_api(to, subject, text, html)

    # SMTP is blocking, so it runs on a worker thread.
    msg = _build(to, subject, text, html)
    return await asyncio.to_thread(_send_blocking, msg)


# ---------------------------------------------------------------- templates
# What each code is for, as (sentence fragment, heading). Anything unlisted gets
# neutral wording: telling someone a code resets their password when it does
# something else teaches them to distrust these emails.
_OTP_COPY = {
    "email_verify": ("verify your email address", "Verify your email"),
    "password_reset": ("reset your password", "Reset your password"),
    "email_change":   ("confirm this as your new email address",
    "Verify your new email address",),
}
_OTP_DEFAULT = ("confirm this request", "Your verification code")


def _otp_html(name: str, code: str, purpose: str) -> str:
    action, heading = _OTP_COPY.get(purpose, _OTP_DEFAULT)

    # Inlined styles and a table layout — email clients strip <style> blocks and
    # have no reliable flexbox support.
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;
               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">

          <tr><td style="background:#1e1b4b;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">
              Campus Netra
            </span>
          </td></tr>

          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0b1c30;">{heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#47464f;">
              Hello {name}, use this code to {action}.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f0f7ff;border:1px solid #dbeafe;border-radius:8px;">
              <tr><td align="center" style="padding:20px;">
                <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;
                             font-weight:700;letter-spacing:9px;color:#1e1b4b;">{code}</span>
              </td></tr>
            </table>

            <p style="margin:20px 0 0;font-size:14px;line-height:21px;color:#64748b;">
              This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.
              If you didn't request it, you can safely ignore this email.
            </p>
          </td></tr>

          <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              Campus Netra — AI-powered campus facility management.
              This is an automated message; please don't reply.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>"""


async def send_otp(to: str, name: str, code: str, purpose: str, provider: Optional[str] = None,) -> SendResult:
    action, _ = _OTP_COPY.get(purpose, _OTP_DEFAULT)
    subject = "Your Campus Netra verification code"
    text = (
        f"Campus Netra\n\n"
        f"Verify your new email address\n\n"
        f"Hello {name},\n\n"
        f"You requested to change the email address associated with your Campus Netra account.\n\n"
        f"Your verification code is:\n\n"
        f"{code}\n\n"
        f"Use this code to {action}:\n\n"
        f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n\n"
        f"If you did not request this change, you can safely ignore this email.\n\n"
        f"Campus Netra\n"
        f"campusnetra.dpdns.org"
    )
    return await send_email(to, subject, text, _otp_html(name, code, purpose),provider=provider,)


async def verify_connection() -> SendResult:
    """Check the SMTP settings without sending anything, for the /health probe
    and the check-email script."""
    provider = settings.email_provider
    if provider == "none":
        return SendResult(delivered=False, logged_only=True,
                          error="No email provider configured.")

    if provider in ("resend", "brevo"):
        # There is no cheap "connect only" for an HTTP API, so confirm the key
        # is accepted by calling a read-only endpoint rather than sending.
        import httpx
        url, headers = (
            ("https://api.resend.com/domains",
             {"Authorization": f"Bearer {settings.RESEND_API_KEY}"})
            if provider == "resend" else
            ("https://api.brevo.com/v3/account", {"api-key": settings.BREVO_API_KEY})
        )
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=headers)
        except Exception as exc:
            return SendResult(delivered=False, error=f"Could not reach {provider}: {exc}")
        if resp.status_code < 300:
            return SendResult(delivered=True)
        if resp.status_code in (401, 403):
            var = "RESEND_API_KEY" if provider == "resend" else "BREVO_API_KEY"
            return SendResult(delivered=False,
                              error=f"{provider.title()} rejected the key in {var}.")
        return SendResult(delivered=False, error=_api_error(resp))

    def probe() -> SendResult:
        try:
            context = _tls_context()
            if settings.SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT,
                                          timeout=15, context=context)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            with server:
                server.ehlo()
                if settings.SMTP_PORT != 465 and server.has_extn("starttls"):
                    server.starttls(context=context)
                    server.ehlo()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            return SendResult(delivered=True)
        except smtplib.SMTPAuthenticationError:
            return SendResult(delivered=False, error=_auth_hint())
        except Exception as exc:
            return SendResult(delivered=False, error=str(exc))

    return await asyncio.to_thread(probe)
