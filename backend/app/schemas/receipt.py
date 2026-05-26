from typing import Optional
from pydantic import BaseModel


class MatchedLine(BaseModel):
    receipt_name: str
    item_id: str
    item_name: str
    price: float
    price_per: Optional[str] = None


class UnmatchedLine(BaseModel):
    receipt_name: str
    price: float
    price_per: Optional[str] = None


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
