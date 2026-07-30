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
    index: int
    receipt_name: str
    item_id: str
    item_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: float | None = None
    line_total: float
    # True when a person already confirmed this receipt name for this shop.
    # False when the matcher only guessed, from a fuzzy score, and the
    # household has not confirmed it yet.
    confirmed: bool


class UnmatchedLine(BaseModel):
    index: int
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
