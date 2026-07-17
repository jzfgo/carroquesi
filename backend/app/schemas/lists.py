from datetime import datetime

from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str
    emoji: str | None = None


class ListUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None


class ListRead(BaseModel):
    id: str
    name: str
    emoji: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    purchased_count: int = 0
    # Whether this list is the requesting user's default (Siri target).
    is_default: bool = False
