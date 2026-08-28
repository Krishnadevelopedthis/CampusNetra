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
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://campusnetra:campusnetra@localhost:55432/campusnetra"
    )
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

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Campus Netra <no-reply@campusnetra.app>"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        # Accept both a JSON array and a plain comma-separated string.
        if isinstance(v, str) and not v.startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _reject_default_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.SECRET_KEY.startswith("dev-only-"):
            raise ValueError(
                "SECRET_KEY is still the development default. Generate one with:\n"
                '  python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return self

    @property
    def ai_available(self) -> bool:
        """AI calls only go out when a key is present; otherwise heuristics run."""
        return self.AI_ENABLED and bool(self.ANTHROPIC_API_KEY)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
