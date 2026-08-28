"""Outbound email. Falls back to console output when SMTP is unconfigured,
so OTP flows are fully testable in development."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger(__name__)


async def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.SMTP_HOST:
        # Development: print it where the developer can actually see it.
        log.info(
            "\n%s\n  EMAIL (not sent — SMTP unconfigured)\n  To: %s\n  Subject: %s\n\n%s\n%s",
            "=" * 68, to, subject, body, "=" * 68,
        )
        return True

    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as s:
            s.starttls()
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception as exc:
        log.error("Failed to send email to %s: %s", to, exc)
        return False


async def send_otp(to: str, name: str, code: str, purpose: str) -> bool:
    what = "verify your email address" if purpose == "email_verify" else "reset your password"
    return await send_email(
        to,
        f"Campus Netra — your verification code is {code}",
        f"Hello {name},\n\n"
        f"Use this code to {what}:\n\n"
        f"    {code}\n\n"
        f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes. "
        f"If you did not request this, you can ignore this email.\n\n"
        f"— Campus Netra",
    )
