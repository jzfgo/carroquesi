from typing import Literal, Optional
from pydantic import BaseModel


class ParsedLine(BaseModel):
    name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class ReceiptScanRequest(BaseModel):
    store: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_total: Optional[float] = None
    lines: list[ParsedLine]


class MatchedLine(BaseModel):
    receipt_name: str
    item_id: str
    item_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class UnmatchedLine(BaseModel):
    receipt_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class ReceiptScanResult(BaseModel):
    scan_id: str
    store: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_total: Optional[float] = None
    matched: list[MatchedLine]
    unmatched: list[UnmatchedLine]


class PricePatch(BaseModel):
    item_id: str
    price: float
    price_per: Optional[str] = None
    store: Optional[str] = None


class NameMappingCreate(BaseModel):
    store: str
    receipt_name: str
    item_name: str
    item_brand: Optional[str] = None


class ReceiptPriceBatch(BaseModel):
    scan_id: Optional[str] = None
    patches: list[PricePatch]
    mappings: list[NameMappingCreate]
