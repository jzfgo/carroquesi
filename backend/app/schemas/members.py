from datetime import datetime

from pydantic import BaseModel


class AddMemberRequest(BaseModel):
    email: str


class MemberRead(BaseModel):
    id: str
    user_id: str
    list_id: str
    created_at: datetime
