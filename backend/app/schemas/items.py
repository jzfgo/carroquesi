from datetime import datetime

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    store: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    store: str | None = None
    purchased: bool | None = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    brand: str | None
    variety: str | None
    store: str | None
    purchased: bool
    added_by: str
    created_at: datetime
    updated_at: datetime
