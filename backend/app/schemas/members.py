from datetime import datetime

from pydantic import BaseModel, EmailStr


class AddMemberRequest(BaseModel):
    email: EmailStr


class MemberRead(BaseModel):
    id: str
    user_id: str
    list_id: str
    display_name: str
    photo_url: str | None
    created_at: datetime
