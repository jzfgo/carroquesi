from pydantic import BaseModel, field_validator


class PushTokenBody(BaseModel):
    token: str

    @field_validator("token")
    @classmethod
    def token_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Push token cannot be blank")
        return trimmed
