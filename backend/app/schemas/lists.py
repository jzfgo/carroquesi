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
