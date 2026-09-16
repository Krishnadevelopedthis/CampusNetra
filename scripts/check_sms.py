#!/usr/bin/env python3
"""Verify SMS configuration (Brevo or Twilio) and optionally send a real test.

    ./scripts/check_sms.py                 # check the credentials only
    ./scripts/check_sms.py 9876543210      # also send a test text

Reads backend/.env — no credentials are passed on the command line. The
phone number can be a bare 10-digit local number (SMS_DEFAULT_COUNTRY_CODE
is prepended) or already in E.164 form.
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
VENV_PY = BACKEND / ".venv" / "bin" / "python"

# Re-exec under the backend virtualenv so the dependencies are importable
# however the script was invoked. See check_email.py for why sys.prefix,
# not the interpreter path, is what has to be compared here.
VENV_DIR = BACKEND / ".venv"
if VENV_PY.exists() and Path(sys.prefix) != VENV_DIR:
    os.execv(str(VENV_PY), [str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]])

# pydantic-settings resolves env_file relative to the working directory.
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from app.core.config import settings              # noqa: E402
from app.services.sms import send_otp_sms, to_e164, verify_sms_connection  # noqa: E402

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


async def main() -> int:
    print(f"\n{DIM}Reading backend/.env{RESET}")
    print(f"  provider      : {settings.SMS_PROVIDER}")

    if settings.SMS_PROVIDER == "none":
        print(f"\n{YELLOW}No SMS provider is configured, so no SMS can be delivered.{RESET}")
        print("Verification codes will be shown in the app instead (development only).")
        print(f"\nTo enable real SMS, add to {DIM}backend/.env{RESET} — either:\n")
        print("  SMS_PROVIDER=brevo")
        print("  BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxx")
        print("  BREVO_SMS_SENDER=CampusNetra")
        print(f"\n{DIM}or{RESET}\n")
        print("  SMS_PROVIDER=twilio")
        print("  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        print("  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        print("  TWILIO_FROM_NUMBER=+15017122661\n")
        print(f"{DIM}See EMAIL_AND_SMS_SETUP.md at the repo root for the full walkthrough.{RESET}\n")
        return 1

    if settings.SMS_PROVIDER == "brevo":
        key = settings.BREVO_API_KEY
        print(f"  API key       : {key[:8]}{'*' * max(0, len(key) - 8)} ({len(key)} chars)" if key else "  API key       : (not set)")
        print(f"  Sender ID     : {settings.BREVO_SMS_SENDER or '(not set)'}")
    else:
        sid = settings.TWILIO_ACCOUNT_SID
        print(f"  Account SID   : {sid[:6]}{'*' * max(0, len(sid) - 6)} ({len(sid)} chars)" if sid else "  Account SID   : (not set)")
        print(f"  Auth token    : {'*' * 8 + ' (set)' if settings.TWILIO_AUTH_TOKEN else '(not set)'}")
        print(f"  From number   : {settings.TWILIO_FROM_NUMBER or '(not set)'}")
    print(f"  Country code  : {settings.SMS_DEFAULT_COUNTRY_CODE}\n")

    print("Verifying the credentials…")
    result = await verify_sms_connection()
    if not result.delivered:
        print(f"{RED}  FAILED{RESET}  {result.error}\n")
        return 1
    print(f"{GREEN}  Credentials accepted.{RESET}")
    print(f"{DIM}  (This confirms the provider will accept the API call — not that a carrier\n"
          f"   will deliver it. See the note about India/DLT below.){RESET}\n")

    if len(sys.argv) > 1:
        to = sys.argv[1]
        print(f"Sending a test code to {to_e164(to)}…")
        sent = await send_otp_sms(to, "123456", "phone_verify")
        if sent.delivered:
            print(f"{GREEN}  Provider accepted it. Check the phone.{RESET}")
            print(f"{DIM}  If it never arrives despite this, and the number is in India, that is\n"
                  f"  almost always DLT (TRAI) sender/template registration, not a credentials\n"
                  f"  or code problem — see 'What if the API says success but nothing arrives?'\n"
                  f"  in EMAIL_AND_SMS_SETUP.md.{RESET}\n")
        else:
            print(f"{RED}  FAILED{RESET}  {sent.error}\n")
            if "trial" in (sent.error or "").lower():
                print(f"{DIM}On a Twilio trial account, verify this number first:{RESET}")
                print(f"{DIM}  https://console.twilio.com — Phone Numbers → Manage → Verified Caller IDs{RESET}\n")
            return 1
    else:
        print(f"{DIM}Pass a number to send a real test:{RESET}")
        print(f"{DIM}  ./scripts/check_sms.py 9876543210{RESET}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
