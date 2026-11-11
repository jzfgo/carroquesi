from pydantic import BaseModel


class ChainRead(BaseModel):
    name: str
    store_keys: list[str]
    own_brands: list[str]
    # Clients offer label scanning only where a decoder can read the label.
    has_label_decoder: bool


class DecodedLabel(BaseModel):
    """What an in-store label's barcode says. A field the format does not
    carry is None: an EAN-13 price label holds no weight."""

    format: str
    article: str
    reduced: bool | None = None
    weight_g: int | None = None
    price_per_kg_cents: int | None = None
    total_cents: int


class LabelRead(DecodedLabel):
    # The chain whose decoder read the label. Without a store hint, this is
    # the only way the caller learns where the label comes from.
    chain: str
