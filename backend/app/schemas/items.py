from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator

# The units a pack's content is stored in; the client maps long spellings
# («gramos», «litros») onto these.
ContentUnit = Literal["g", "kg", "ml", "cl", "dl", "l"]


class PackFormat(BaseModel):
    """A line's pack format: 6 × 1,5 L, 108 g, or a pack of 12.

    The content is sent as a figure and a unit; the client reads what was
    typed («1,5 L», «108 gramos»). A format with count 1 and no content says
    nothing, so it is refused: send null to remove a format.
    """

    # Bounded so a normalised price stays a finite figure: a near-zero content
    # would divide into infinity, which no JSON response can carry.
    count: int = Field(default=1, ge=1, le=1000)
    content: float | None = Field(default=None, ge=0.001, le=100_000, allow_inf_nan=False)
    unit: ContentUnit | None = None

    @model_validator(mode="after")
    def content_and_unit_together(self) -> PackFormat:
        if (self.content is None) != (self.unit is None):
            raise ValueError("content and unit go together")
        if self.content is None and self.count == 1:
            raise ValueError("an empty format is null, not count 1")
        return self


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
    def price_per_requires_price(self) -> ItemCreate:
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
    # Absent = don't touch; null = remove the format. Changing it clears the
    # EAN unless this request sets one: that EAN named the old format.
    pack: PackFormat | None = None
    ean: str | None = None


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
    # What a reduced price cost before, in the basis of `price`, when known.
    # Whether a price was reduced is not sent here: only a known old price
    # shows on a row.
    price_before: float | None = None
    pack: PackFormat | None = None
    purchased_at: datetime | None
    # The trip this item was bought on. None while unpurchased.
    purchase_id: str | None = None
    # When this item's trip stops taking items — closed by hand, or torn off
    # at its stamped local midnight. None while unpurchased. Clients read it
    # to mirror the trip-open guards without re-deriving the boundary.
    purchase_ends_at: datetime | None = None
    # Whether a receipt scan is attached to this item's trip. A ticketed trip
    # is settled paper, so its lines leave the receipt-linking pool even if
    # the boundary is still ahead. False while unpurchased.
    purchase_has_receipt: bool = False
    # The store of this item's trip. A price entered on a bought line belongs
    # to that shop, so clients use it as the price form's default store.
    # None while unpurchased, or when the trip names no store.
    purchase_store: str | None = None
    # Whether this list has priced the same product per kg before. Only the
    # list's items feed computes it; other responses keep the default.
    bought_by_weight: bool = False
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
