from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class WaitlistSignupCreate(BaseModel):
    email: EmailStr
    invite_token: str | None = None


class WaitlistSignupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    created_at: datetime
    allowed_at: datetime | None = None
    invite_token: str | None = None

