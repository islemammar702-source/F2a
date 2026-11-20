"""Application configuration loaded from environment variables / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    ENV: str = "development"  # development | production | test
    APP_NAME: str = "F2A MANAGER"
    DATABASE_URL: str = "postgresql+psycopg://f2a:f2a_dev_password@localhost:5432/f2a_manager"

    # Security — SECRET_KEY MUST be overridden in production (openssl rand -hex 32)
    SECRET_KEY: str = "dev-insecure-secret-change-me-please-0123456789abcdef"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS_REMEMBER: int = 30
    REFRESH_TOKEN_HOURS_SESSION: int = 12
    COOKIE_SECURE: bool = False  # True in production (HTTPS)
    REFRESH_COOKIE_NAME: str = "f2a_refresh"
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_WINDOW_SECONDS: int = 900

    CORS_ORIGINS: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    STORAGE_DIR: Path = BASE_DIR / "storage"
    MAX_UPLOAD_MB: int = 10

    # Optional AI reading of scanned documents (Claude / Anthropic API). Empty key = attach only, no reading.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5-5"
    SCAN_AI_TIMEOUT: int = 90

    # Optional SMTP (email sending). When SMTP_HOST is empty, emails are not sent.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.ENV != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
