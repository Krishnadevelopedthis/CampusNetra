"""Application settings, loaded from environment / .env."""
from functools import lru_cache
from typing import List, Literal

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
    BACKEND_CORS_ORIGINS: List[str] = []

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

    # AI
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-sonnet-5"
    AI_ENABLED: bool = True

    # Storage
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

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
    # Brevo's HTTP API, usable with the same account as their SMTP relay.
    BREVO_API_KEY: str = ""

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        # Accept both a JSON array and a plain comma-separated string.
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            # If it looks like JSON array, try to parse it
            if v.startswith("["):
                try:
                    import json
                    return json.loads(v)
                except (json.JSONDecodeError, ValueError):
                    # Fall through to comma-split
                    pass
            # Otherwise treat as comma-separated
            return [o.strip() for o in v.split(",") if o.strip()]
        return v if v else []

    @model_validator(mode="after")
    def _reject_default_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.SECRET_KEY.startswith("dev-only-"):
            raise ValueError(
                "SECRET_KEY is still the development default. Generate one with:\n"
                '  python -c "import secrets; print(secrets.token_urlsafe(64))"'
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
        """AI calls only go out when a key is present; otherwise heuristics run."""
        return self.AI_ENABLED and bool(self.ANTHROPIC_API_KEY)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
