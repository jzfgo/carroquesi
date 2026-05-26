from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql://postgres:postgres@localhost:5432/carroquesi"
    firebase_credentials_path: str = "firebase-credentials.json"
    # Set to true in local .env only — never in production
    dev_auth_bypass: bool = False
    frontend_url: str = "https://carroquesi.web.app"
    receipt_storage_bucket: str = "carroquesi.firebasestorage.app"

    model_config = {"env_file": ".env"}


settings = Settings()
