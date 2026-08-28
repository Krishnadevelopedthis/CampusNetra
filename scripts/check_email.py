#!/usr/bin/env python3
"""Verify SMTP configuration and optionally send a real test email.

    ./scripts/check_email.py                    # check the connection only
    ./scripts/check_email.py you@gmail.com      # also send a test message

Reads backend/.env — no credentials are passed on the command line.
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
VENV_PY = BACKEND / ".venv" / "bin" / "python"

# Re-exec under the backend virtualenv so the dependencies are importable
# however the script was invoked.
#
# Compare sys.prefix rather than the interpreter path: a venv's `python` is a
# symlink to the system binary, so resolving both paths makes them compare equal
# and the re-exec is skipped. sys.prefix is what actually distinguishes them.
VENV_DIR = BACKEND / ".venv"
if VENV_PY.exists() and Path(sys.prefix) != VENV_DIR:
    os.execv(str(VENV_PY), [str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]])

# pydantic-settings resolves env_file relative to the working directory.
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from app.core.config import settings          # noqa: E402
from app.services.email import send_otp, verify_connection  # noqa: E402

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


async def main() -> int:
    print(f"\n{DIM}Reading backend/.env{RESET}")
    print(f"  SMTP_HOST : {settings.SMTP_HOST or '(not set)'}")
    print(f"  SMTP_PORT : {settings.SMTP_PORT}")
    print(f"  SMTP_USER : {settings.SMTP_USER or '(not set)'}")
    print(f"  SMTP_PASS : {'*' * 8 + ' (set)' if settings.SMTP_PASSWORD else '(not set)'}")
    print(f"  SMTP_FROM : {settings.SMTP_FROM}\n")

    if not settings.email_delivers:
        print(f"{YELLOW}SMTP_HOST is not set, so no email can be delivered.{RESET}")
        print("Verification codes will be shown in the app instead (development only).")
        print(f"\nTo enable real email, add to {DIM}backend/.env{RESET}:\n")
        print("  SMTP_HOST=smtp.gmail.com")
        print("  SMTP_PORT=587")
        print("  SMTP_USER=you@gmail.com")
        print("  SMTP_PASSWORD=your-16-char-app-password")
        print('  SMTP_FROM="Campus Netra <you@gmail.com>"\n')
        print(f"{DIM}Gmail needs an App Password (2-Step Verification must be on):{RESET}")
        print(f"{DIM}  https://myaccount.google.com/apppasswords{RESET}\n")
        return 1

    print("Testing connection and login…")
    result = await verify_connection()
    if not result.delivered:
        print(f"{RED}  FAILED{RESET}  {result.error}\n")
        return 1
    print(f"{GREEN}  Connected and authenticated.{RESET}\n")

    if len(sys.argv) > 1:
        to = sys.argv[1]
        print(f"Sending a test code to {to}…")
        sent = await send_otp(to, "there", "123456", "email_verify")
        if sent.delivered:
            print(f"{GREEN}  Sent. Check the inbox (and the spam folder).{RESET}\n")
        else:
            print(f"{RED}  FAILED{RESET}  {sent.error}\n")
            return 1
    else:
        print(f"{DIM}Pass an address to send a real test:{RESET}")
        print(f"{DIM}  ./scripts/check_email.py you@example.com{RESET}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
