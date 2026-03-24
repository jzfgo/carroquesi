from datetime import datetime
from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str


class ListUpdate(BaseModel):
    name: str


class ListRead(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    purchased_count: int = 0
