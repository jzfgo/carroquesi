from typing import Literal

from pydantic import BaseModel


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
    lines: list[ParsedLine]


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
    price_per: str | None = None
    store: str | None = None
    quantity: str | None = None


class NameMappingCreate(BaseModel):
    store: str
    receipt_name: str
    item_name: str
    item_brand: str | None = None


class NewPurchasedItem(BaseModel):
    name: str
    brand: str | None = None
    ean: str | None = None
    price: float
    price_per: str | None = None
    store: str | None = None
    quantity: str | None = None


class ReceiptPriceBatch(BaseModel):
    scan_id: str | None = None
    receipt_date: str | None = None
    patches: list[PricePatch] = []
    new_items: list[NewPurchasedItem] = []
    mappings: list[NameMappingCreate] = []
