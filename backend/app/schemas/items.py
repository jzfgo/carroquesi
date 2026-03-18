from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    brand: Optional[str] = None
    variety: Optional[str] = None
    store: Optional[str] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[str] = None
    brand: Optional[str] = None
    variety: Optional[str] = None
    store: Optional[str] = None
    purchased: Optional[bool] = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: Optional[str]
    brand: Optional[str]
    variety: Optional[str]
    store: Optional[str]
    purchased: bool
    added_by: str
    created_at: datetime
    updated_at: datetime
