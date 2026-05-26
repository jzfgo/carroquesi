import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class ParsedLine:
    name: str
    price: float
    price_per: Optional[str] = None
    quantity: Optional[str] = None


@dataclass
class ParsedReceipt:
    store: Optional[str]
    receipt_date: Optional[date]
    receipt_total: Optional[float]
    lines: list[ParsedLine] = field(default_factory=list)


def _parse_price(text: str) -> Optional[float]:
    text = text.strip().replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(text: str) -> Optional[date]:
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def _detect_store(lines: list[str]) -> Optional[str]:
    header = " ".join(lines[:4]).upper()
    if "MERCADONA" in header:
        return "Mercadona"
    if "AHORRAMAS" in header:
        return "Ahorramas"
    return None


def _parse_mercadona(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    in_items = False

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.search(r"Descripci", line, re.IGNORECASE):
            in_items = True
            continue

        if re.match(r"\s*TOTAL\b", line, re.IGNORECASE):
            m = re.search(r"(\d+[,\.]\d+)\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            in_items = False
            continue

        if not in_items:
            continue

        # Weight line: "   2,3 kg x 2,30 EUR/kg" — modifies the previous item
        kg_match = re.match(r"^\s*\d+[,\.]\d+\s*kg\s*[xX×]\s*([\d,\.]+)", line, re.IGNORECASE)
        if kg_match and items:
            unit_price = _parse_price(kg_match.group(1))
            if unit_price is not None:
                items[-1].price = unit_price
                items[-1].price_per = "KILOGRAM"
            continue

        # Standard item line: "ITEM NAME    price"
        m = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None and not re.match(r"(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO)", name, re.IGNORECASE):
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def _parse_ahorramas(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"\s*TOTAL\b", line, re.IGNORECASE):
            m = re.search(r"([\d,\.]+)\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            continue

        # Ahorramas item: "ITEM NAME    [A|B|C]  price"
        m = re.match(r"^(.+?)\s+[ABC]\s+([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None:
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def _parse_generic(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Skip obvious non-item lines
        if re.match(r"\s*(TOTAL|Total|IVA|Tarjeta|EFECTIVO)", line):
            m = re.search(r"([\d,\.]+)\s*$", line)
            if re.match(r"\s*(TOTAL|Total)\b", line) and m:
                receipt_total = _parse_price(m.group(1))
            continue

        # Generic: line ending with whitespace then a decimal number
        m = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None and len(name) > 1:
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def parse_receipt(ocr_text: str) -> ParsedReceipt:
    lines = ocr_text.splitlines()
    store = _detect_store(lines)

    if store == "Mercadona":
        items, receipt_date, receipt_total = _parse_mercadona(lines)
    elif store == "Ahorramas":
        items, receipt_date, receipt_total = _parse_ahorramas(lines)
    else:
        items, receipt_date, receipt_total = _parse_generic(lines)

    return ParsedReceipt(
        store=store,
        receipt_date=receipt_date,
        receipt_total=receipt_total,
        lines=items,
    )
