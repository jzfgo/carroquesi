from datetime import datetime
from pydantic import BaseModel


class InvitePreview(BaseModel):
    id: str
    list_name: str
    list_emoji: str | None = None
    invited_by_name: str | None


class InviteRead(BaseModel):
    id: str
    list_id: str
    invited_email: str | None
    invited_by: str
    created_at: datetime
