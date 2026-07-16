from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql://postgres:postgres@localhost:5432/carroquesi"
    firebase_credentials_path: str = "firebase-credentials.json"
    # Set to true in local .env only — never in production
    dev_auth_bypass: bool = False
    frontend_url: str = "http://localhost:5173"
    # Base URL this API is publicly reachable at — embedded in generated
    # .shortcut files so Shortcut actions know where to send requests.
    # Must be set to the deployed Cloud Run URL in production.
    api_base_url: str = "http://localhost:8000"
    # Symmetric key (Fernet) used to encrypt ApiKey.key_ciphertext at rest.
    # This dev default is fine for local/test use only — generate a real
    # secret for production with: python -c "from cryptography.fernet import
    # Fernet; print(Fernet.generate_key().decode())"
    api_key_encryption_secret: str = "kxIFFtErQMWecfu4kn1E6HKk6rRKYVDHm0Rx5GZaF1E="
    waitlist_enabled: bool = False

    model_config = {"env_file": ".env"}


settings = Settings()
