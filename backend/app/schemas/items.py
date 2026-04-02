from datetime import datetime

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    stores: list[str] = []


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    brand: str | None
    variety: str | None
    stores: list[str]
    purchased: bool
    added_by: str
    created_at: datetime
    updated_at: datetime
