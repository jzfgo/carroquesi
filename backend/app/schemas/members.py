from datetime import datetime

from pydantic import BaseModel, EmailStr


class AddMemberRequest(BaseModel):
    email: EmailStr


class MemberRead(BaseModel):
    id: str
    user_id: str
    list_id: str
    created_at: datetime
