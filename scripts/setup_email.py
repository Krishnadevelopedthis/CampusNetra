#!/usr/bin/env python3
"""Interactive SMTP setup.

Prompts for credentials, writes them to backend/.env, verifies the connection
and offers to send a test message.

The SMTP key is read with getpass so it is never echoed to the terminal and
never appears in shell history.

    ./scripts/setup_email.py
"""
import asyncio
import getpass
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
VENV_PY = BACKEND / ".venv" / "bin" / "python"
ENV_FILE = BACKEND / ".env"

VENV_DIR = BACKEND / ".venv"
if VENV_PY.exists() and Path(sys.prefix) != VENV_DIR:
    os.execv(str(VENV_PY), [str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]])

BOLD, GREEN, RED, YELLOW, DIM, CYAN, RESET = (
    "\033[1m", "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[36m", "\033[0m"
)

PROVIDERS = {
    "1": ("Brevo",   "smtp-relay.brevo.com",    587,
          "Dashboard > SMTP & API > SMTP tab. Free tier: 300 emails/day."),
    "2": ("Gmail",   "smtp.gmail.com",          587,
          "Requires 2-Step Verification, then an App Password."),
    "3": ("Outlook", "smtp-mail.outlook.com",   587, ""),
    "4": ("Mailtrap (testing only)", "sandbox.smtp.mailtrap.io", 2525,
          "Captures mail in a web inbox; nothing is delivered to real addresses."),
}


def write_env(values: dict[str, str]) -> None:
    """Update keys in place, preserving comments, ordering and other settings."""
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text().splitlines()
    else:
        example = BACKEND / ".env.example"
        lines = example.read_text().splitlines() if example.exists() else []

    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        m = re.match(r"^\s*([A-Z_]+)\s*=", line)
        key = m.group(1) if m else None
        if key in values:
            out.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            out.append(line)

    missing = [k for k in values if k not in seen]
    if missing:
        out.append("")
        out.append("# ---------- Email ----------")
        out.extend(f"{k}={values[k]}" for k in missing)

    ENV_FILE.write_text("\n".join(out) + "\n")
    ENV_FILE.chmod(0o600)   # credentials — owner-readable only


def main() -> int:
    print(f"\n{BOLD}Campus Netra — email setup{RESET}")
    print(f"{DIM}Credentials are written to backend/.env, which is gitignored.{RESET}\n")

    for key, (name, host, port, note) in PROVIDERS.items():
        print(f"  {CYAN}{key}{RESET}  {name:<26} {DIM}{host}:{port}{RESET}")
        if note:
            print(f"     {DIM}{note}{RESET}")
    print()

    choice = input(f"Provider [{BOLD}1{RESET}]: ").strip() or "1"
    if choice not in PROVIDERS:
        print(f"{RED}Unknown option.{RESET}")
        return 1

    name, host, port, _ = PROVIDERS[choice]
    print(f"\n{BOLD}{name}{RESET}  ({host}:{port})\n")

    if name == "Brevo":
        print(f"{DIM}Find these at https://app.brevo.com > SMTP & API > SMTP tab.")
        print(f"The login is usually your account email; the key starts with 'xsmtpsib-'.{RESET}\n")

    user = input("SMTP login / username: ").strip()
    if not user:
        print(f"{RED}A username is required.{RESET}")
        return 1

    password = getpass.getpass("SMTP key / password (hidden): ").strip()
    if not password:
        print(f"{RED}A password is required.{RESET}")
        return 1

    default_from = user if "@" in user else "no-reply@campusnetra.app"
    sender = input(f"From address [{default_from}]: ").strip() or default_from

    write_env({
        "SMTP_HOST": host,
        "SMTP_PORT": str(port),
        "SMTP_USER": user,
        "SMTP_PASSWORD": password,
        "SMTP_FROM": f'"Campus Netra <{sender}>"',
    })
    print(f"\n{GREEN}Saved to backend/.env{RESET} {DIM}(permissions set to 600){RESET}")

    # Import only now, so the freshly written .env is the one that gets read.
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    from app.core.config import get_settings
    get_settings.cache_clear()
    from app.services.email import send_otp, verify_connection

    print("\nVerifying connection and login…")
    result = asyncio.run(verify_connection())
    if not result.delivered:
        print(f"{RED}  FAILED{RESET}  {result.error}\n")
        print(f"{DIM}Re-run this script to correct the details.{RESET}\n")
        return 1
    print(f"{GREEN}  Connected and authenticated.{RESET}")

    to = input("\nSend a test email to (blank to skip): ").strip()
    if to:
        print(f"Sending to {to}…")
        sent = asyncio.run(send_otp(to, "there", "123456", "email_verify"))
        if sent.delivered:
            print(f"{GREEN}  Sent — check the inbox, and the spam folder.{RESET}")
        else:
            print(f"{RED}  FAILED{RESET}  {sent.error}")
            return 1

    print(f"\n{GREEN}Email is configured.{RESET}")
    print(f"{DIM}Restart the app so the backend picks it up:{RESET}")
    print("  ./scripts/start.sh\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(130)
    except EOFError:
        # Non-interactive stdin: nothing to prompt with.
        print("\nThis script needs an interactive terminal. Run it directly:")
        print("  ./scripts/setup_email.py")
        raise SystemExit(1)
