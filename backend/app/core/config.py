from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env"}


settings = Settings()
