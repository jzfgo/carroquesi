from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/carroquesi"


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = DEFAULT_DATABASE_URL
    firebase_credentials_path: str = "firebase-credentials.json"
    # Set to true in local .env only — never in production
    dev_auth_bypass: bool = False
    frontend_url: str = "http://localhost:5173"
    # GCS bucket for receipt images; empty means receipt storage is disabled
    receipt_storage_bucket: str = ""
    waitlist_enabled: bool = False
    # Shared secret for the monthly report trigger (X-Trigger-Token).
    # Empty means the trigger endpoint is off.
    report_trigger_token: str = ""
    # The zone for an owner whose browser never declared one.
    report_default_timezone: str = "UTC"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
