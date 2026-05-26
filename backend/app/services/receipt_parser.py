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
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
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


# Price-only line: digits + optional comma/dot + digits + optional €
_PRICE_RE = re.compile(r"^([\d]+[,\.][\d]+)€?\s*$")
# Tax class line (Ahorramas): 1–4 uppercase tax letters (A/B/C)
_TAX_RE = re.compile(r"^[A-C]{1,4}$")


def _parse_mercadona(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Handles two Cloud Vision layouts for Mercadona:
    1. Combined: 'ITEM NAME    1,15'  (name + 2+ spaces + price on one line)
    2. Columnar: name lines grouped, then price lines grouped separately
    Uses a FIFO queue to pair names with prices in the columnar case.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    in_items = False
    pending_names: list[str] = []
    past_total = False

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
                pending_names.clear()
            else:
                # "TOTAL (€)" is a column header — keep pending names for upcoming prices
                past_total = True
            continue

        if not in_items:
            continue

        # Skip payment/header lines
        if re.match(r"\s*(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO|P\.\s*Unit|TARJETA\s+BANCARIA)", line, re.IGNORECASE):
            continue

        # Weight/kg modifier — applies to the last parsed item
        kg_match = re.match(r"^\s*\d+[,\.]\d+\s*kg\s*[xX×]\s*([\d,\.]+)", line, re.IGNORECASE)
        if kg_match and items:
            unit_price = _parse_price(kg_match.group(1))
            if unit_price is not None:
                items[-1].price = unit_price
                items[-1].price_per = "KILOGRAM"
            continue

        # Combined name + price line (e.g. "BEBIDA ALMENDRAS 0%      1,15")
        combined = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if combined:
            name = combined.group(1).strip()
            price = _parse_price(combined.group(2))
            if price is not None and not re.match(r"(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO)", name, re.IGNORECASE):
                items.append(ParsedLine(name=name, price=price))
            continue

        # Price-only line (columnar layout); "0,15 0,30" → take rightmost (total for multi-unit)
        prices_m = re.match(r"^([\d,\.]+)(?:\s+([\d,\.]+))?\s*$", line.strip())
        if prices_m:
            price_str = prices_m.group(2) if prices_m.group(2) else prices_m.group(1)
            price = _parse_price(price_str)
            if price is not None:
                if pending_names:
                    items.append(ParsedLine(name=pending_names.pop(0), price=price))
                elif past_total and receipt_total is None:
                    receipt_total = price
            continue

        # Name-only line
        name = line.strip()
        if len(name) > 2:
            pending_names.append(name)

    return items, receipt_date, receipt_total


def _parse_ahorramas(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Ahorramas receipts from Cloud Vision separate name, tax class, and price onto different lines:
        ITEM NAME C          ← name (sometimes with trailing tax letter)
        1,25€                ← price
    or:
        ITEM NAME            ← name
        A                    ← tax class (skipped)
        1,25€                ← price
    Uses a FIFO queue to pair names with prices.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

    # Skip header: find the line containing the date/time stamp
    start_idx = 0
    for i, line in enumerate(lines):
        if re.search(r"\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}", line):
            start_idx = i + 1
            break

    _SKIP_RE = re.compile(
        r"^(TARJETA|EFECTIVO|CAMBIO|IVA|BASE|%|CAJA|TIQUE|TICKET|OPERADOR|"
        r"PASEO|CALLE|C\/|MADRID|S\.A\.|AHORRAMAS|\d+\s*[Uu]n\s*[xX])",
        re.IGNORECASE,
    )

    pending_names: list[str] = []
    past_total = False

    for line in lines[start_idx:]:
        line = line.strip()
        if not line:
            continue

        # Price-only line
        pm = _PRICE_RE.match(line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is None:
                continue
            if past_total and receipt_total is None:
                receipt_total = price
            elif pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # TOTAL line (price may be on same line or the next)
        if re.match(r"TOTAL|SUBTOTAL", line, re.IGNORECASE):
            m = re.search(r"([\d,\.]+)€?\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            pending_names.clear()
            past_total = True
            continue

        # Tax class line — skip
        if _TAX_RE.match(line):
            continue

        # Known non-item line — skip
        if _SKIP_RE.match(line):
            continue

        # Quantity descriptor line (e.g. "4 Un x 2,50€/Un") — skip
        if re.match(r"\d+\s*[Uu]n\s*[xX]", line):
            continue

        # Name line — strip any trailing tax class letter
        name = re.sub(r"\s+[A-C]\s*$", "", line).strip()
        if len(name) > 2:
            pending_names.append(name)

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
