from datetime import datetime

from pydantic import BaseModel, Field, computed_field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] = Field(default_factory=list)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    brand: str | None
    stores: list[str]
    purchased_at: datetime | None
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
