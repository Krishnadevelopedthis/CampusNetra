"""Application settings, loaded from environment / .env."""
from functools import lru_cache
from typing import Any, List, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Application
    APP_NAME: str = "Campus Netra"
    ENVIRONMENT: Literal["development", "staging", "production"] = "production"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Any = []
    # Already used verbatim on the public Support marketing page — centralised
    # here rather than hardcoded a second time (the AI Agent's "I don't have
    # enough verified information" fallback points here too), so the two
    # can't drift apart if this is ever changed.
    SUPPORT_EMAIL: str = "support@campusnetra.dpdns.org"

    # Database
    DATABASE_URL: str = ""
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # Security
    # 64 chars so HS256 is keyed at full strength even before the operator
    # supplies their own. Production refuses to boot on this value (see below).
    SECRET_KEY: str = "dev-only-insecure-key-do-not-use-in-production-0123456789abcdef"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    OTP_EXPIRE_MINUTES: int = 10
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15

    # Captcha (login + forgot-password). Stateless JWT-backed image challenge —
    # no DB table, no third-party service, reuses SECRET_KEY.
    CAPTCHA_EXPIRE_MINUTES: int = 5

    # SMS. Two providers are wired in (see services/sms.py): Brevo (default)
    # and Twilio — pick one with SMS_PROVIDER. Both need Indian numbers to
    # go through DLT (TRAI) sender/template registration before a carrier
    # will actually deliver anything; see EMAIL_AND_SMS_SETUP.md before
    # assuming a delivery failure is a credentials or code problem.
    SMS_PROVIDER: Literal[
    "none",
    "brevo",
    "twilio",
    "self_hosted",
    "smshorizon",
    ] = "smshorizon"
    
    # Brevo SMS — same BREVO_API_KEY as the email section below; SMS credits
    # are purchased separately from email credits in Brevo's dashboard.
    BREVO_SMS_SENDER: str = "CampusNetra"
    # Self-hosted Android SMS Gateway
    SELF_HOSTED_SMS_URL: str = ""
    SELF_HOSTED_SMS_API_KEY: str = ""

    # Twilio — TWILIO_FROM_NUMBER must be a number Twilio gave you (bought or
    # trial), in E.164 form, e.g. "+15017122661", not a personal number.
    # Trial accounts can only text numbers verified in the Twilio console
    # (Phone Numbers → Verified Caller IDs) until upgraded.
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Phone numbers are stored as a bare local number (see
    # RequestPhoneChangeRequest's normalisation in schemas/auth.py), so this
    # is prepended to build the E.164 address either provider requires.
    # "+91" (India) matches this deployment; change it if your users are
    # elsewhere.
    SMS_DEFAULT_COUNTRY_CODE: str = "+91"

    # Identity verification (name-change ID upload). The fraction of the
    # claimed name's tokens that must appear in the OCR'd ID text for the
    # change to auto-apply; below this it is queued for admin review instead
    # of being rejected outright, since OCR on a photographed card is noisy.
    NAME_MATCH_THRESHOLD: float = 0.6

    # AI
    # AI
    AI_ENABLED: bool = True

    AI_PROVIDER: Literal["anthropic", "openrouter"] = "openrouter"

    AI_MODEL: str = "openrouter/free"

    ANTHROPIC_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # Storage
    # "local" writes to UPLOAD_DIR on the server's own disk — fine for local
    # development, but most PaaS free/standard tiers (Render, Railway, Fly,
    # Heroku-style dynos) wipe local disk on every redeploy or restart. That
    # silently deletes every issue/lost-and-found photo ever uploaded, which
    # is why they can appear to "vanish" over time. Set STORAGE_BACKEND=s3
    # and the S3_* values below to point at any S3-compatible bucket
    # (Cloudflare R2 and Backblaze B2 both have workable free tiers) for
    # uploads that actually survive a redeploy.
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

    S3_BUCKET: str = ""
    S3_REGION: str = "auto"
    # Leave blank for real AWS S3; set for R2 / B2 / MinIO / DigitalOcean Spaces.
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    # Where a public object's URL points once uploaded — the bucket's own
    # public endpoint, or a CDN/custom domain in front of it.
    S3_PUBLIC_BASE_URL: str = ""

    # Email — SMTP for local development, an HTTP API for hosted environments.
    #
    # Most PaaS free tiers (Render, Railway, Fly, Heroku) block outbound SMTP
    # ports to curb spam, so a correctly configured SMTP setup still sends
    # nothing once deployed. Providing an API key switches to HTTPS, which is
    # never blocked.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Campus Netra <no-reply@campusnetra.app>"

    RESEND_API_KEY: str = ""
    RESEND_FROM: str = "Campus Netra <noreply@campusnetra.dpdns.org>"
    # Brevo's HTTP API, usable with the same account as their SMTP relay.
    BREVO_API_KEY: str = ""
    BREVO_FROM: str = "techcareit.in@gmail.com"
    BREVO_FROM_NAME: str = "Techcare"

    SMSHORIZON_USER: str = ""
    SMSHORIZON_API_KEY: str = ""
    SMSHORIZON_SENDER_ID: str = ""
    SMSHORIZON_TEMPLATE_ID: str = ""
    
  
    # Which transport handles each kind of outgoing mail. "auto" (the
    # default) uses whichever of RESEND_API_KEY / BREVO_API_KEY / SMTP_HOST
    # is configured, in that order — fine for a single-provider setup. Pin a
    # purpose to a specific value if you run two providers side by side (e.g.
    # Brevo for the flows that go to your own users at sign-up/reset, Resend
    # for the profile email-change flow that sends to an address that isn't
    # a Campus Netra user yet) — set one to "resend" and the other to
    # "brevo" so they stop sharing the "auto" pick, which always resolves to
    # the same provider for both. If the pinned provider has no key
    # configured, this falls back to "auto" rather than failing every send.
    EMAIL_PROVIDER_EMAIL_VERIFY: Literal["auto", "resend", "brevo", "smtp"] = "brevo"
    EMAIL_PROVIDER_PASSWORD_RESET: Literal["auto", "resend", "brevo", "smtp"] = "brevo"
    EMAIL_PROVIDER_EMAIL_CHANGE: Literal["auto", "resend", "brevo", "smtp"] = "brevo"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        # Accept both a JSON array and a plain comma-separated string.
        if not v:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            # Remove brackets if they exist
            v = v.strip("[]").strip()
            if not v:
                return []
            # Split by comma
            return [o.strip().strip('"').strip("'") for o in v.split(",") if o.strip()]
        return []

    @model_validator(mode="after")
    def _reject_default_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.SECRET_KEY.startswith("dev-only-"):
            raise ValueError(
                "SECRET_KEY is still the development default. Generate one with:\n"
                '  python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return self

    @model_validator(mode="after")
    def _require_s3_config_when_selected(self) -> "Settings":
        if self.STORAGE_BACKEND == "s3" and not (
            self.S3_BUCKET and self.S3_ACCESS_KEY_ID and self.S3_SECRET_ACCESS_KEY
        ):
            raise ValueError(
                "STORAGE_BACKEND=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and "
                "S3_SECRET_ACCESS_KEY to be set."
            )
        return self

    @property
    def email_provider(self) -> str:
        """Which transport to use. HTTP APIs win because they work everywhere."""
        if self.RESEND_API_KEY:
            return "resend"
        if self.BREVO_API_KEY:
            return "brevo"
        if self.SMTP_HOST:
            return "smtp"
        return "none"

    def _email_provider_configured(self, name: str) -> bool:
        return {
            "resend": bool(self.RESEND_API_KEY),
            "brevo": bool(self.BREVO_API_KEY),
            "smtp": bool(self.SMTP_HOST),
        }.get(name, False)

    def resolve_email_provider(self, purpose: str) -> str:
        """The transport a given OTP purpose actually sends through.

        Looks up the EMAIL_PROVIDER_* pin for this purpose; "auto", an unknown
        purpose, or a pin naming a provider with no key configured all fall
        back to the single-provider default (email_provider) instead of
        failing every send.
        """
        pinned = {
            "email_verify": self.EMAIL_PROVIDER_EMAIL_VERIFY,
            "password_reset": self.EMAIL_PROVIDER_PASSWORD_RESET,
            "email_change": self.EMAIL_PROVIDER_EMAIL_CHANGE,
        }.get(purpose, "auto")
        if pinned != "auto" and self._email_provider_configured(pinned):
            return pinned
        return self.email_provider

    @property
    def email_delivers(self) -> bool:
        """True when some transport is configured and mail can actually arrive."""
        return self.email_provider != "none"

    @property
    def expose_dev_codes(self) -> bool:
        """Whether OTPs may be returned in API responses.

        Only outside production AND only when email cannot be delivered — with no
        SMTP host the code reaches nothing but the server console, which makes
        signup impossible to complete from a browser. Both conditions are required,
        so configuring SMTP or setting ENVIRONMENT=production closes this off.
        """
        return self.ENVIRONMENT != "production" and not self.email_delivers

    @property
    def ai_available(self) -> bool:
        if not self.AI_ENABLED:
            return False

        if self.AI_PROVIDER == "anthropic":
            return bool(self.ANTHROPIC_API_KEY)

        if self.AI_PROVIDER == "openrouter":
            return bool(self.OPENROUTER_API_KEY)

        return False

    @property
    def sms_delivers(self) -> bool:
        """True when the configured SMS provider has usable credentials."""

        if self.SMS_PROVIDER == "self_hosted":
            return bool(
                self.SELF_HOSTED_SMS_URL
                and self.SELF_HOSTED_SMS_API_KEY
            )

        if self.SMS_PROVIDER == "brevo":
            return bool(
                self.BREVO_API_KEY
                and self.BREVO_SMS_SENDER
            )

        if self.SMS_PROVIDER == "twilio":
            return bool(
                self.TWILIO_ACCOUNT_SID
                and self.TWILIO_AUTH_TOKEN
                and self.TWILIO_FROM_NUMBER
            )
        if self.SMS_PROVIDER == "smshorizon":
            return bool(
                self.SMSHORIZON_USER
                and self.SMSHORIZON_API_KEY
                and self.SMSHORIZON_SENDER_ID
                and self.SMSHORIZON_TEMPLATE_ID
            )

        return False

    @property
    def expose_dev_phone_codes(self) -> bool:
        """Mirrors expose_dev_codes for the phone-change OTP.

        With no SMS provider, a code that only reaches the server console makes
        the flow impossible to complete from a device — so outside production
        the code is returned in the response instead.
        """
        return self.ENVIRONMENT != "production" and not self.sms_delivers


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
