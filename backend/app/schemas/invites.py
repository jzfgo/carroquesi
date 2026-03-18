from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class InvitePreview(BaseModel):
    id: str
    list_name: str
    invited_by_name: str | None


class InviteRead(BaseModel):
    id: str
    list_id: str
    invited_email: Optional[str]
    invited_by: str
    created_at: datetime
