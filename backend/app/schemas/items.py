from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] = Field(default_factory=list)
    ean: str | None = None
    price: float | None = Field(default=None, ge=0)
    price_per: Literal["KILOGRAM"] | None = None
    price_store: str | None = None

    @model_validator(mode="after")
    def price_per_requires_price(self) -> "ItemCreate":
        if self.price_per is not None and self.price is None:
            raise ValueError("price_per requires price to be set")
        return self


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None
    purchased_quantity: str | None = None  # None = don't touch


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    purchased_quantity: str | None
    brand: str | None
    stores: list[str]
    ean: str | None
    price: float | None
    price_per: Literal["KILOGRAM"] | None
    price_store: str | None
    purchased_at: datetime | None
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
