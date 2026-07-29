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
    # The instant the tap happened, which only the client knows. Without it an
    # offline tap drained the next morning is stamped at drain time and files
    # into the wrong trip. Honoured only on the false -> true transition.
    purchased_at: datetime | None = None


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
    purchase_id: str | None = None
    # closed_at ?? tears_off_at, denormalised so itemState() on the client stays
    # a function of one item and one instant comparison. Set as a transient
    # attribute by the router, the same way User.is_admin is.
    purchase_ends_at: datetime | None = None
    # `trip.closed_at is not None` -- whether this item's trip has been filed
    # ("Cerrar compra", or a receipt scan). delete_item's 409 keys on exactly
    # this, and the client cannot derive it from purchase_ends_at alone: a
    # torn-off-but-unfiled trip and a closed one both read as 'bought' via
    # itemState(), yet behave oppositely on DELETE. Cheaper and clearer to
    # expose this bool than to hand the client closed_at raw. Defaults False
    # so add_item's response (which skips _annotate_trips) still validates.
    purchase_filed: bool = False
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
