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


def _build(to: str, subject: str, text: str, html: Optional[str]) -> EmailMessage:
    msg = EmailMessage()
    name, addr = parseaddr(settings.SMTP_FROM)
    msg["From"] = formataddr((name or settings.APP_NAME, addr or settings.SMTP_USER))
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

    name, addr = parseaddr(settings.SMTP_FROM)
    sender = formataddr((name or settings.APP_NAME, addr)) if addr else settings.SMTP_FROM

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
    if resp.status_code in (401, 403):
        return SendResult(delivered=False,
                          error="Resend rejected the API key. Check RESEND_API_KEY.")
    if resp.status_code == 403 or "domain" in detail.lower():
        return SendResult(
            delivered=False,
            error=("Resend refused the sender address. Until you verify your own "
                   "domain, the from address must be onboarding@resend.dev, and "
                   "you can only send to the address that owns the account."))
    return SendResult(delivered=False, error=f"Resend error: {detail}")


async def _send_brevo_api(to: str, subject: str, text: str, html: Optional[str]) -> SendResult:
    """Brevo's HTTPS API — same account as their SMTP relay, different transport."""
    import httpx

    name, addr = parseaddr(settings.SMTP_FROM)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.BREVO_API_KEY,
                         "content-type": "application/json"},
                json={
                    "sender": {"email": addr or settings.SMTP_USER,
                               "name": name or settings.APP_NAME},
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
    to: str, subject: str, text: str, html: Optional[str] = None
) -> SendResult:
    provider = settings.email_provider

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
def _otp_html(name: str, code: str, purpose: str) -> str:
    action = ("verify your email address" if purpose == "email_verify"
              else "reset your password")
    heading = ("Verify your email" if purpose == "email_verify"
               else "Reset your password")

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


async def send_otp(to: str, name: str, code: str, purpose: str) -> SendResult:
    action = ("verify your email address" if purpose == "email_verify"
              else "reset your password")
    subject = f"{code} is your Campus Netra verification code"

    text = (
        f"Hello {name},\n\n"
        f"Use this code to {action}:\n\n"
        f"    {code}\n\n"
        f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes. "
        f"If you did not request this, you can ignore this email.\n\n"
        f"— Campus Netra"
    )
    return await send_email(to, subject, text, _otp_html(name, code, purpose))


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
