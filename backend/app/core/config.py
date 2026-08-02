from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql://postgres:postgres@localhost:5432/carroquesi"
    firebase_credentials_path: str = "firebase-credentials.json"
    # Set to true in local .env only — never in production
    dev_auth_bypass: bool = False
    frontend_url: str = "http://localhost:5173"
    # GCS bucket for receipt images; empty means receipt storage is disabled
    receipt_storage_bucket: str = ""
    waitlist_enabled: bool = False

    model_config = {"env_file": ".env"}


settings = Settings()
