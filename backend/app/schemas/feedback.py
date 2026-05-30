from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class FeedbackCreate(BaseModel):
    message: str
    email: EmailStr | None = None
    source: str = "manual"

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Feedback message cannot be blank")
        return trimmed

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("source")
    @classmethod
    def source_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Feedback source cannot be blank")
        return trimmed


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
