from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ParsedLine(BaseModel):
    name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: float | None = None
    line_total: float


class ReceiptScanRequest(BaseModel):
    store: str | None = None
    receipt_date: str | None = None
    receipt_total: float | None = None
    # Which model produced the parse ("on_device" or "in_cloud"). Audit-only,
    # so a plain str: a value the SDK invents later must be recorded, not
    # rejected with a 422.
    inference_source: str | None = None
    lines: list[ParsedLine]
    # Targeted attach: match against the named settled purchase's own lines
    # instead of the in-play pool. None is the ordinary scan-closes-a-trip flow.
    purchase_id: str | None = None


class MatchedLine(BaseModel):
    receipt_name: str
    item_id: str
    item_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: float | None = None
    line_total: float


class UnmatchedLine(BaseModel):
    receipt_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: float | None = None
    line_total: float


class ReceiptScanResult(BaseModel):
    scan_id: str
    store: str | None = None
    receipt_date: str | None = None
    receipt_total: float | None = None
    matched: list[MatchedLine]
    unmatched: list[UnmatchedLine]


class PricePatch(BaseModel):
    item_id: str
    price: float
    price_per: Literal["KILOGRAM"] | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None
    quantity: str | None = None


class NameMappingCreate(BaseModel):
    store: str
    receipt_name: str
    item_name: str
    item_brand: str | None = None


class NewPurchasedItem(BaseModel):
    name: str = Field(min_length=1)
    brand: str | None = None
    ean: str | None = None
    price: float
    price_per: Literal["KILOGRAM"] | None = None
    store: str | None = None
    quantity: str | None = None


class ReceiptPriceBatch(BaseModel):
    scan_id: str | None = None
    receipt_date: str | None = None
    # Store and paper total close the trip this apply settles its lines onto,
    # the same way manual close carries them. Store is required by the review
    # UI; total may be absent when the receipt's own total was unreadable.
    store: str | None = None
    receipt_total: float | None = None
    patches: list[PricePatch] = []
    new_items: list[NewPurchasedItem] = []
    mappings: list[NameMappingCreate] = []
    # Targeted attach: file prices, new lines, and the paper onto this settled
    # purchase instead of closing a trip. None is the ordinary flow.
    purchase_id: str | None = None


class ReceiptPriceApplyResult(BaseModel):
    items_updated: int
    items_created: int


class ReceiptUploadUrlRequest(BaseModel):
    # A plain str, not a Literal of the allowed types: the allowed set lives
    # in the storage service, and the endpoint answers an unknown type with
    # 415 rather than a 422 that hides which types exist.
    content_type: str
    # PDF page count as the client counted it. Optional and unverifiable —
    # the server never sees the bytes.
    pages: int | None = Field(default=None, ge=1)


class ReceiptUploadUrlResult(BaseModel):
    upload_url: str
    # Seconds the signed PUT stays valid, so the client can warn before a
    # slow upload would outlive its signature.
    expires_in: int


class ReceiptFileUrlResult(BaseModel):
    url: str
    content_type: str
    pages: int | None


class ReceiptScanSummary(BaseModel):
    """One scan of a trip, as the purchase page's thumbnails need it."""

    id: str
    store: str | None
    receipt_at: datetime | None
    receipt_total: float | None
    # Whether an upload URL was ever minted for this scan — the closest the
    # backend can get to "a file exists" without a GCS round-trip.
    has_file: bool
    file_pages: int | None
    created_at: datetime
