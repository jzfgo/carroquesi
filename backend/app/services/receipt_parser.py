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
    m = re.search(r"(\d{2})/(\w{3})/(\d{2,4})", text)
    if m:
        _MONTHS = {"ene":1,"feb":2,"mar":3,"abr":4,"may":5,"jun":6,
                   "jul":7,"ago":8,"sep":9,"oct":10,"nov":11,"dic":12,
                   "jan":1,"apr":4,"aug":8,"dec":12}
        mon = _MONTHS.get(m.group(2).lower())
        if mon:
            year = int(m.group(3))
            if year < 100:
                year += 2000
            try:
                return date(year, mon, int(m.group(1)))
            except ValueError:
                return None
    return None


def _detect_store(lines: list[str]) -> Optional[str]:
    # Check first 6 lines for most stores; fall back to full scan for stores
    # whose name only appears in a product line (Supeco, Eroski).
    header = " ".join(lines[:6]).upper()
    if "MERCADONA" in header:
        return "Mercadona"
    if "AHORRAMAS" in header:
        return "Ahorramas"
    if "ALCAMPO" in header:
        return "Alcampo"
    if "ALDI" in header:
        return "Aldi"
    if "CAPRABO" in header:
        return "Caprabo"
    if "CARREFOUR" in header:
        return "Carrefour"
    if "CONSUM" in header:
        return "Consum"
    # Dia: "DIA%" or "GRUPO DIA" or header line "DESCRIPCION ARTICULO"
    if re.search(r"\bDIA[%\s]|\bGRUPO DIA\b|DIA SUPERMARKET", header):
        return "Dia"
    if "EL CORTE INGLES" in header or "CORTE INGL" in header:
        return "El Corte Inglés"
    if "EROSKI" in header:
        return "Eroski"
    if "GADIS" in header or "GADISA" in header:
        return "Gadis"
    if "HIPERDINO" in header or "DINOSOL" in header:
        return "HiperDino"
    if "LIDL" in header:
        return "Lidl"
    if "PRIMAPRIX" in header:
        return "Primaprix"
    if "SQRUPS" in header or "RETAIL DE IMPACTO" in header:
        return "Sqrups"
    if "SUPECO" in header:
        return "Supeco"
    # Wide scan for stores whose name only appears deeper in the receipt
    full = " ".join(lines).upper()
    if "EROSKI" in full:
        return "Eroski"
    if "SUPECO" in full:
        return "Supeco"
    return None


# ── Shared helpers ────────────────────────────────────────────────────────────

# Price-only line: digits + optional comma/dot + digits + optional € suffix
_PRICE_RE = re.compile(r"^([\d]+[,\.][\d]+)€?\s*$")
# Tax class line (Ahorramas): 1–4 uppercase tax letters (A/B/C)
_TAX_RE = re.compile(r"^[A-C]{1,4}$")

# Price + optional trailing tax class/number (Alcampo "1,84 C", Dia "0,79 A", Lidl "1,85 B")
_PRICE_WITH_SUFFIX_RE = re.compile(r"^([\d]+[,\.][\d]+)\s*€?\s*[A-Z0-9]?\s*$")
# Price with € and trailing number (Aldi "1,69 € 4")
_PRICE_ALDI_RE = re.compile(r"^([\d]+[,\.][\d]+)\s*€\s*\d?\s*$")


def _first_price(line: str) -> Optional[float]:
    """Extract the first decimal number from a line."""
    m = re.search(r"([\d]+[,\.][\d]+)", line)
    return _parse_price(m.group(1)) if m else None


# ── Mercadona ─────────────────────────────────────────────────────────────────

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
                past_total = True
            continue

        if not in_items:
            continue

        if re.match(r"\s*(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO|P\.\s*Unit|TARJETA\s+BANCARIA)", line, re.IGNORECASE):
            continue

        kg_match = re.match(r"^\s*\d+[,\.]\d+\s*kg\s*[xX×]\s*([\d,\.]+)", line, re.IGNORECASE)
        if kg_match and items:
            unit_price = _parse_price(kg_match.group(1))
            if unit_price is not None:
                items[-1].price = unit_price
                items[-1].price_per = "KILOGRAM"
            continue

        combined = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if combined:
            name = combined.group(1).strip()
            price = _parse_price(combined.group(2))
            if price is not None and not re.match(r"(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO)", name, re.IGNORECASE):
                items.append(ParsedLine(name=name, price=price))
            continue

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

        name = line.strip()
        if len(name) > 2:
            pending_names.append(name)

    return items, receipt_date, receipt_total


# ── Ahorramas ─────────────────────────────────────────────────────────────────

def _parse_ahorramas(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Ahorramas: name / optional tax class / price€ on separate lines.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

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

        if re.match(r"TOTAL|SUBTOTAL", line, re.IGNORECASE):
            m = re.search(r"([\d,\.]+)€?\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            pending_names.clear()
            past_total = True
            continue

        if _TAX_RE.match(line):
            continue

        if _SKIP_RE.match(line):
            continue

        if re.match(r"\d+\s*[Uu]n\s*[xX]", line):
            continue

        name = re.sub(r"\s+[A-C]\s*$", "", line).strip()
        if len(name) > 2:
            pending_names.append(name)

    return items, receipt_date, receipt_total


# ── Alcampo ───────────────────────────────────────────────────────────────────

def _parse_alcampo(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Alcampo: 'NAME\n1,84 C' — price line has trailing tax letter.
    Multi-unit: 'N x UNIT_PRICE' before item, then 'TOTAL TAX' after.
    Total: 'TOT\n11,43' or 'TOT  11,43'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_total = False

    _SKIP_RE = re.compile(
        r"^(ALCAMPO|FACTURA|TARJETA|EFECTIVO|CAMBIO|IVA|BASE|CUOTA|NUM\.|"
        r"ESTABLECIMIENTO|LOCALIDAD|FECHA|NUMERO|TIPO|IMPORTE|AID|ETIQUETA|"
        r"VERIFICACION|ENTIDAD|REDSYS|VENTA|FIRMA|PARA EL CLIENTE|"
        r"SALDO|PUNTOS|GRACIAS|PLANET|A TU COMPRA|SELLOS)",
        re.IGNORECASE,
    )
    # Price line: "1,84 C" or "7,50 E" or ".90 A" or "17,64"
    _PRICE_LINE_RE = re.compile(r"^([\d]*[,\.][\d]+)\s*[A-Z]?\s*$")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Total
        if re.match(r"^TOT\b", line, re.IGNORECASE):
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if _SKIP_RE.match(line):
            continue

        # Skip multi-unit descriptor "N x UNIT_PRICE" — just a modifier
        if re.match(r"^\d+\s*[xX×]\s*[\d,\.]+", line):
            continue

        # Price line
        pm = _PRICE_LINE_RE.match(line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Name line — must be long enough to be an item name
        if len(line) > 2 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Aldi ──────────────────────────────────────────────────────────────────────

def _parse_aldi(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Aldi: 'NAME\n1,69 € 4' — price with € and trailing tax digit.
    Weight items: 'N,NNN kg x N,NN €/kg' before or after the price line.
    Multi-unit: 'N x N,NN €\nNAME\nTOTAL € TAX'.
    Total: 'A PAGAR\nNNN,NN €'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_total = False

    _SKIP_RE = re.compile(
        r"^(ALDI|Avda\.|Carrer|Horario|Lu-Sa|Do:|Calle|C/|CC |"
        r"OPERACION|COMERCIO|TPV|Aut|Op |VENTA|Visa|MASTERCARD|"
        r"BARCELONA|MAJADAHONDA|210001)",
        re.IGNORECASE,
    )
    # Price line: "1,69 € 4" or "1,69 €" or "60,97 €"
    _PRICE_LINE_RE = re.compile(r"^([\d]+[,\.][\d]+)\s*€\s*\d?\s*$")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Total: "A PAGAR\n108,44 €" — total is on the NEXT line
        if re.match(r"^A PAGAR\s*$", line, re.IGNORECASE):
            past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if _SKIP_RE.match(line):
            continue

        # Weight modifier — update last item (allow space before /kg)
        kg_m = re.match(r"^([\d,\.]+)\s*kg\s*[xX×]\s*([\d,\.]+)\s*€\s*/kg", line)
        if kg_m and items:
            items[-1].price = _parse_price(kg_m.group(2)) or items[-1].price
            items[-1].price_per = "KILOGRAM"
            continue

        # Multi-unit prefix "N x N,NN €" — skip, total price follows
        if re.match(r"^\d+\s*[xX]\s*[\d,\.]+\s*€", line):
            continue

        # Price line
        pm = _PRICE_LINE_RE.match(line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Name line
        if len(line) > 3 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Caprabo ───────────────────────────────────────────────────────────────────

def _parse_caprabo(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Caprabo (modern): tabular columns Uni / €/UN / €TOT / € T.Club.
    The first item name can appear BEFORE the column-header row; subsequent
    name+price pairs follow the header.
    Total: 'TOTALS\nN,NN' or 'TOTAL A PAGAR\nN,NN€'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    header_seen = False
    past_total = False

    _SKIP_RE = re.compile(
        r"^(CAPRABO|CIF|DIAGONAL|C:\d|Uni$|€/UN|ETOT|€TOT|€ T\.Club|T\.Club|"
        r"PAGAMENT|CONTACTLESS|HAS |GRASAS|RASAS|kJ|kcal|SUBTOTAL|"
        r"ARTIC\.|de referencia|%|<)",
        re.IGNORECASE,
    )
    # Lines before the C:XXXX timestamp are OCR noise from adjacent labels
    _PRE_HEADER_RE = re.compile(r"^C:\d{4}\s")

    pre_header_done = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # The "C:XXXX date" line marks end of store header noise
        if _PRE_HEADER_RE.match(line):
            pre_header_done = True
            continue

        if not pre_header_done:
            continue

        # Column-header row
        if re.search(r"€/UN|ETOT|€TOT", line, re.IGNORECASE):
            header_seen = True
            continue

        # Total
        if re.match(r"TOTALS?\b", line, re.IGNORECASE):
            # price might be on same line or next line
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                v = _parse_price(m.group(1))
                # avoid picking up e.g. "0,2" from nutritional info
                if v and v > 0.5:
                    receipt_total = v
            else:
                past_total = True
            pending_names.clear()
            continue

        if re.match(r"TOTAL A PAGAR", line, re.IGNORECASE):
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            past_total = False
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"^([\d]+[,\.][\d]+)€?", line)
            if m:
                v = _parse_price(m.group(1))
                if v and v > 0.5:
                    receipt_total = v
                    past_total = False
                    continue

        if _SKIP_RE.match(line):
            continue

        # Price line: bare number or number with €
        pm = re.match(r"^([\d]+[,\.][\d]+)€?\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 2:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Carrefour ─────────────────────────────────────────────────────────────────

def _parse_carrefour(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Carrefour Spain: 'NAME\nPRICE' pairs.
    Total: 'N ART. TOTAL A PAGAR : N,NN' or on two lines.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    _SKIP_RE = re.compile(
        r"^(\*+|←|Centros Comerciales|CIF|Telf|Teléfono|TIPO|BASE|CUOTA|"
        r"VENTA|VENTAJAS|ACUMULADO|SOCIO|Saldo|días|DEVOLVER|COMPARTIR|"
        r"IMPORTE|AID|DEBIT|MASTERCARD|CONTACTLESS|OP\.|Todos|CAMBIO|"
        r"FECHA|San Juan|Alicante|TARJETA|EFECTIVO|Destacar|^\d{2}:\d{2}$)",
        re.IGNORECASE,
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # First "***" store header line marks start of items section
        if re.match(r"^\*+", line):
            in_items = True
            continue

        if past_total and receipt_total is None:
            m = re.search(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        # Total line: "14 ART. TOTAL A PAGAR : 35,10" or just the label
        total_m = re.search(r"TOTAL A PAGAR\s*[:\s]*([\d,\.]+)?", line, re.IGNORECASE)
        if total_m:
            if total_m.group(1):
                receipt_total = _parse_price(total_m.group(1))
            else:
                past_total = True
            in_items = False
            pending_names.clear()
            continue

        if not in_items:
            continue

        if _SKIP_RE.match(line):
            continue

        # Price-only line
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 2:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Consum ────────────────────────────────────────────────────────────────────

def _parse_consum(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Consum: 'CANT ARTICULO' header, then '1 NAME\nPRICE' or '2 NAME UNIT_PRICE\nTOTAL'.
    Total: 'Total factura:\nNN,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Column header marks start of items
        if re.search(r"CANT\s+ARTICULO|PVP\s+TOTAL", line, re.IGNORECASE):
            in_items = True
            continue

        if re.match(r"Total\s+factura|TOTAL\s+A\s+PAGAR|IMPORTE\s+A\s+ABONAR", line, re.IGNORECASE):
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if not in_items:
            continue

        if re.match(r"^(Tarj\.|EFECTIVO|CAMBIO|IVA|DNI|Socio|S-C)", line, re.IGNORECASE):
            continue

        # Price-only line
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # "2 NAME UNIT_PRICE\nTOTAL" — combined with qty × unit shown inline
        # Match lines like "2 NEGRO 72 S/A CONSUM 1,69" (qty + name + unit price, total follows)
        qty_item = re.match(r"^(\d+)\s+(.+?)\s+([\d,\.]+)\s*$", line)
        if qty_item:
            name = f"{qty_item.group(1)} {qty_item.group(2).strip()}"
            pending_names.append(name)
            continue

        # "1 NAME" — qty prefix
        qty_simple = re.match(r"^(\d+)\s+(.+)$", line)
        if qty_simple:
            name = f"{qty_simple.group(1)} {qty_simple.group(2).strip()}"
            pending_names.append(name)
            continue

        if len(line) > 2:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Dia ───────────────────────────────────────────────────────────────────────

def _parse_dia(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Dia (modern): 'NAME\nPRICE TAX_LETTER' or weight items.
    Discounts appear in an OFERTAS/CUPONES section — skip them.
    Total: 'TOTAL COMPRA GRUPO DIA\nNN,NN' or inline.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_offers = False  # once we hit OFERTAS, stop adding items

    _SKIP_RE = re.compile(
        r"^(DESCRIPCI|CANTIDAD|IMPORTE|PVP/UNIT|DIA%|CL\.|FACTURA|"
        r"N\.FACT|N\.CAJA|TARJETA|EFECTIVO|CAMBIO|IVA|Ahorro|ClubDia|"
        r"DISTRIBUIDORA|CIF|Resumen|Total sin|Forma de pago|Productos|"
        r"DESCRIPCIÓN|BOLSA\s+50%)",
        re.IGNORECASE,
    )
    # Price line: "0,79 A" or "1,30 C" or "5,60 B" or bare "1,20 B"
    _PRICE_LINE_RE = re.compile(r"^([\d]+[,\.][\d]+)\s*[A-Z]?\s*$")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"OFERTAS|CUPONES", line, re.IGNORECASE):
            past_offers = True
            pending_names.clear()
            continue

        total_m = re.search(r"TOTAL\s+(?:A\s+PAGAR|COMPRA\s+GRUPO\s+DIA|COMPRA)\s*[:\s]*([\d,\.]+)?", line, re.IGNORECASE)
        if total_m:
            if total_m.group(1):
                receipt_total = _parse_price(total_m.group(1))
            else:
                past_offers = True  # total is on next line
            pending_names.clear()
            continue

        # Two-line total: label on one line, value on the next
        if past_offers and receipt_total is None:
            m = re.match(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                continue

        if past_offers:
            # Still look for total line after the offers section
            continue

        if _SKIP_RE.match(line):
            continue

        # Weight descriptor "N,NNN kg\nN,NN €/kg" — skip kg line, take price line
        if re.match(r"^\d+[,\.]\d+\s*kg\s*$", line):
            continue
        if re.match(r"^\d+[,\.]\d+\s*€/kg\s*$", line):
            continue

        # Combined weight+price "0,380 kg\n1,11 €/kg\n0,42 A"
        # (handled: kg line skipped, price line follows)

        # Price line
        pm = _PRICE_LINE_RE.match(line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Old-format or single-unit: "1x 0,99 B" — qty×price; pop name, use unit price
        qty_price = re.match(r"^\d+[xX]\s*([\d,\.]+)\s*[A-Z]?\s*$", line)
        if qty_price:
            price = _parse_price(qty_price.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Skip measurement lines like "1 ud" or "5 ud"
        if re.match(r"^\d+\s*ud\s*$", line, re.IGNORECASE):
            continue

        # Skip unit-price lines "0,23 €/ud"
        if re.search(r"€/ud|€/kg", line, re.IGNORECASE):
            continue

        if len(line) > 2 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── El Corte Inglés ───────────────────────────────────────────────────────────

def _parse_eci(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    ECI: 'Descripción / Cantidad / Importe' columns.
    Items: 'NAME\nN TAX\nPRICE' or 'NAME N TAX\nPrecio unitario N,NN\n...TOTAL'.
    Subtotal line: 'SUBTOTAL\nNN,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    _SKIP_RE = re.compile(
        r"^(EL CORTE|N\.I\.F|Dom\.|Inscrita|Tomo|Vendedor|CÓDIGO|"
        r"Cantidad|Importe|Detalle|Base|Cuota|Total|VISA|454|434|ARC|AID|FUC|Tipo|"
        r"TOTAL COMPRA|IVA INCLUIDO|LE ATENDIÓ|Puntos|No se|Conserv|Consulte|"
        r"el corte|Nou|rollo|folhas|25 m)",
        re.IGNORECASE,
    )
    # Quantity + tax class line: "1 B" or "2 C" or "2 B"
    _QTY_TAX_RE = re.compile(r"^\d+\s+[A-F]\s*$")
    # "Precio unitario N,NN"
    _UNIT_PRICE_RE = re.compile(r"^Precio\s+unitario\s+([\d,\.]+)", re.IGNORECASE)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.search(r"Descripci[oó]n", line, re.IGNORECASE):
            in_items = True
            continue

        if re.match(r"SUBTOTAL", line, re.IGNORECASE):
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if not in_items:
            continue

        if _SKIP_RE.match(line):
            continue

        # "Precio unitario N,NN" — skip (unit, not total)
        if _UNIT_PRICE_RE.match(line):
            continue

        # Quantity + tax: "1 B" — skip
        if _QTY_TAX_RE.match(line):
            continue

        # Price-only line
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # "NAME N TAX" inline — strip qty+tax suffix
        inline = re.match(r"^(.+?)\s+\d+\s+[A-F]\s*$", line)
        if inline:
            pending_names.append(inline.group(1).strip())
            continue

        if len(line) > 2:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Eroski ────────────────────────────────────────────────────────────────────

def _parse_eroski(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Eroski (modern): 'NAME\nN,NN€'.
    Total: 'TOTAL A PAGAR\nN,NN' or 'A pagar\nNN,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_total = False

    _SKIP_RE = re.compile(
        r"^(EROSKI|ALCOY|CTRA\.|CIF|CECOSA|FACTURA|IVA|TARJETA|EFECTIVO|"
        r"CAMBIO|FRESCOS|ALIMENTACION|PERFUMERIA|HOGAR)",
        re.IGNORECASE,
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"TOTAL A PAGAR|A pagar", line, re.IGNORECASE):
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if _SKIP_RE.match(line):
            continue

        # Price line: "2,02€" or "0,90€" or "3,19"
        pm = re.match(r"^([\d]+[,\.][\d]+)€?\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Multi-unit: "2 X 0,81" — skip, total follows
        if re.match(r"^\d+\s*[xX]\s*[\d,\.]+", line):
            continue

        if len(line) > 2 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Gadis ─────────────────────────────────────────────────────────────────────

def _parse_gadis(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Gadis: 'NAME\n[0]\nPRICE' — tax code [0] between name and price.
    Total: 'TOTAL......:\nN,NN' (two lines).
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    _SKIP_RE = re.compile(
        r"^(GADIS|PZ\.|PONTEVICUS|CIF|Tlf|ENDA|"
        r"TARJETAS|EFECTIVO|CAMBIO|IVA)",
        re.IGNORECASE,
    )
    # Header lines look like "453 CAJ:04 N.FRA:T15558" or "04/2021 11:30 CJR:001978"
    _HEADER_LINE_RE = re.compile(r"CAJ:|CJR:|N\.FRA:|NúM\.|TIQUE")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Total label (price may be inline or on next line)
        total_m = re.match(r"TOTAL[.\s]+:", line, re.IGNORECASE)
        if total_m:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.match(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if _SKIP_RE.match(line) or _HEADER_LINE_RE.search(line):
            continue

        # Tax code line [0] or [1] — skip
        if re.match(r"^\[\d\]\s*", line):
            continue

        # "GALLITO\n[0] 2.49" — inline [0] prefix + price
        inline_tax = re.match(r"^\[\d\]\s+([\d,\.]+)\s*$", line)
        if inline_tax:
            price = _parse_price(inline_tax.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # Price line: "5.08" or "1.29"
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 2:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── HiperDino ─────────────────────────────────────────────────────────────────

def _parse_hiperdino(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    HiperDino: 'ARTÍCULO\nIMPORTE' header, then 'NAME\nPRICE' pairs.
    Promotions: '-1 X 3,05 €' (skip).
    Total: 'TOTAL COMPRA:\nNN,NN' (two lines).
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # "ARTÍCULO" column header marks start of item section
        if re.match(r"^ARTÍCULO\s*$", line, re.IGNORECASE):
            in_items = True
            continue

        # Total (value may be on same or next line)
        total_m = re.match(r"TOTAL COMPRA\s*[:\s]*([\d,\.]+)?", line, re.IGNORECASE)
        if total_m:
            if total_m.group(1):
                receipt_total = _parse_price(total_m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.match(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if not in_items:
            continue

        if re.match(r"^(IMPORTE|Total Artículos|TARJETA|EFECTIVO|CAMBIO)", line, re.IGNORECASE):
            continue

        # Promotion/discount line: "-1 X 3,05 €" — skip
        if re.match(r"^-?\d+\s*[xX]\s*[\d,\.]+\s*€?", line):
            continue

        # Combined "NAME... PRICE" on one line (truncated names like "ISLE OF MAN QUESO... 3,55")
        combined = re.match(r"^(.{10,}?)\s+([\d,\.]+)\s*$", line)
        if combined:
            name = combined.group(1).strip().rstrip(".")
            price = _parse_price(combined.group(2))
            if price is not None:
                items.append(ParsedLine(name=name, price=price))
                pending_names.clear()
            continue

        # Price line
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 3:
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Lidl ──────────────────────────────────────────────────────────────────────

def _parse_lidl(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Lidl: several sub-formats from Cloud Vision:
    - Simple:   'NAME\nPRICE TAX'      → e.g. 'MAGNESIO\n1,85 B'
    - Multi:    'NAME\nUNIT_PRICEx\nQTY\nTOTAL TAX'
    - Discount: 'Desc.\n-N,NN' or 'Descuento N%\n-N,NN' or 'PROMO LIDL PLUS\n-N,NN'
    - Weight:   'NAME\nPRICE TAX\nN,NNN kg x N,NN EUR/kg'
    Total: 'Total\nNN,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_total = False
    skip_next = False  # set when a discount/promo line is seen

    _SKIP_RE = re.compile(
        r"^(LIDL|C/\.|Avda\.|NIF|EUR$|ENTREGA|Tarjeta|Lidl Pay|"
        r"IVA|PN|PVP|Suma|Desc\. total|Registrate|Devolucions|"
        r"RECIBO|perjudici|Ateni|PANO|ECCIO|tiquet|termini)",
        re.IGNORECASE,
    )
    # Price line: "1,85 B" or "8,97 B" or "0,15 C"
    _PRICE_WITH_TAX_RE = re.compile(r"^([\d]+[,\.][\d]+)\s*[A-Z]\s*$")
    # Discount line
    _DISCOUNT_RE = re.compile(r"^(Desc\.|Descuento|PROMO)", re.IGNORECASE)
    # Multi-unit price fragment "2,99x" (price followed by 'x')
    _UNIT_PRICE_X_RE = re.compile(r"^([\d,\.]+)x\s*$")
    # Quantity-only line (a bare integer)
    _QTY_RE = re.compile(r"^\d+\s*$")

    pending_unit_price: Optional[float] = None
    pending_qty: Optional[int] = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Total
        if re.match(r"^Total\s*$", line, re.IGNORECASE):
            past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if _SKIP_RE.match(line):
            continue

        # Discount/promo lines — skip the line AND the following negative amount
        if _DISCOUNT_RE.match(line):
            skip_next = True
            continue
        if skip_next:
            skip_next = False
            continue

        # Weight line: "N,NNN kg x N,NN EUR/kg"
        kg_m = re.match(r"^([\d,\.]+)\s*kg\s*[xX×]\s*([\d,\.]+)\s*EUR/kg", line)
        if kg_m and items:
            items[-1].price = _parse_price(kg_m.group(2)) or items[-1].price
            items[-1].price_per = "KILOGRAM"
            continue

        # Multi-unit: price fragment "2,99x"
        ux = _UNIT_PRICE_X_RE.match(line)
        if ux:
            pending_unit_price = _parse_price(ux.group(1))
            continue

        # Quantity integer (follows unit price fragment)
        if _QTY_RE.match(line) and pending_unit_price is not None:
            pending_qty = int(line.strip())
            continue

        # Price with tax class (simple or total of multi-unit)
        pm = _PRICE_WITH_TAX_RE.match(line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                item = ParsedLine(name=pending_names.pop(0), price=price)
                items.append(item)
            pending_unit_price = None
            pending_qty = None
            continue

        # Reset multi-unit state if we see something else
        if pending_unit_price is not None and not _QTY_RE.match(line):
            pending_unit_price = None
            pending_qty = None

        if len(line) > 2 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Primaprix ─────────────────────────────────────────────────────────────────

def _parse_primaprix(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Primaprix: 'ARTICULO CANT PVP TOTAL' columns.
    Items: 'NAME\nQTY\nUNIT_PRICE TOTAL_PRICE' or 'NAME  QTY  UNIT  TOTAL'.
    Total: 'Total\nN,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False
    past_total = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"ARTICULO\b|CANT\b|PVP\s+TOTAL", line, re.IGNORECASE):
            in_items = True
            continue

        if re.match(r"^Total\s*$", line, re.IGNORECASE):
            past_total = True
            pending_names.clear()
            continue

        if past_total and receipt_total is None:
            m = re.search(r"([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        if not in_items:
            continue

        if re.match(r"^(PRIMAPRIX|CIF|FACTURA|Pinpad|TARJETA|TITULAR|AID|ARC|"
                    r"AUTORIZACI|COMERCIO|TERMINAL|REFERENCIA|TOTAL|Tasa|Neto|"
                    r"Impuesto|Bruto|Le na|NO\. OPERACION|BBVA|MasterCard)", line, re.IGNORECASE):
            continue

        # "NAME  QTY  UNIT  TOTAL" combined
        combined = re.match(r"^(.+?)\s{2,}(\d+)\s+([\d,\.]+)\s+([\d,\.]+)\s*$", line)
        if combined:
            price = _parse_price(combined.group(4))
            if price is not None:
                items.append(ParsedLine(name=combined.group(1).strip(), price=price))
            continue

        # Quantity line (bare int or "N,NN N,NN" — unit price then total)
        two_prices = re.match(r"^(\d+)\s+([\d,\.]+)\s+([\d,\.]+)\s*$", line)
        if two_prices and pending_names:
            price = _parse_price(two_prices.group(3))
            if price is not None:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # "UNIT_PRICE TOTAL_PRICE" on same line (e.g. "0,35 0,70")
        unit_total = re.match(r"^([\d,\.]+)\s+([\d,\.]+)\s*$", line)
        if unit_total and pending_names:
            price = _parse_price(unit_total.group(2))
            if price is not None:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 2 and not re.match(r"^\d+\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Sqrups ────────────────────────────────────────────────────────────────────

def _parse_sqrups(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Sqrups: 'ARTICULO PUP CTD Total' header.
    Items: 'NAME\nUNIT_PRICE QTY TOTAL' or '(A) NAME\nUNIT CTD TOTAL'.
    Total: 'Su PAGO TARJETA\nEntreg.: N,NN'.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    in_items = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"ARTICULO\s+PUP|PUP\s+CTD", line, re.IGNORECASE):
            in_items = True
            continue

        # Total: "Entreg.: 1,95 Pagado: 1,95"
        total_m = re.search(r"Entreg\.\s*:\s*([\d,\.]+)", line, re.IGNORECASE)
        if total_m:
            receipt_total = _parse_price(total_m.group(1))
            pending_names.clear()
            continue

        if not in_items:
            continue

        if re.match(r"^(RETAIL|Avda\.|CIF|Fct|PROMOCIONES|TOTAL|Su PAGO|"
                    r"CAMBIO|Para consultas|Consulte|nor)", line, re.IGNORECASE):
            continue

        # Discount line starting with "-"
        if line.startswith("-"):
            continue

        # "UNIT_PRICE QTY TOTAL" line: "0,25 6 1,50"
        price_line = re.match(r"^([\d,\.]+)\s+(\d+)\s+([\d,\.]+)\s*$", line)
        if price_line and pending_names:
            price = _parse_price(price_line.group(3))
            if price is not None:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        # "NAME  UNIT QTY TOTAL" combined (with or without leading "(A) ")
        combined = re.match(r"^(?:\([A-Z]\)\s+)?(.+?)\s+([\d,\.]+)\s+(\d+)\s+([\d,\.]+)\s*$", line)
        if combined:
            price = _parse_price(combined.group(4))
            if price is not None:
                items.append(ParsedLine(name=combined.group(1).strip(), price=price))
            continue

        # Name line (may start with "(A) ")
        name = re.sub(r"^\([A-Z]\)\s+", "", line).strip()
        if len(name) > 2:
            pending_names.append(name)

    return items, receipt_date, receipt_total


# ── Supeco ────────────────────────────────────────────────────────────────────

def _parse_supeco(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    """
    Supeco: 'NAME\nN x ( PRICE )\nTOTAL' for multi-unit or 'NAME\nPRICE' single.
    Total: 'N ART, TOTAL A PAGAR :' on one line, price on the next.
    """
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []
    pending_names: list[str] = []
    past_total = False

    _SKIP_RE = re.compile(
        r"^(SUPECO|TARJETA|EFECTIVO|CAMBIO|IVA|BASE|CUOTA|TIPO|VENTA)",
        re.IGNORECASE,
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if _SKIP_RE.match(line):
            continue

        if past_total and receipt_total is None:
            m = re.match(r"^([\d]+[,\.][\d]+)", line)
            if m:
                receipt_total = _parse_price(m.group(1))
                past_total = False
                continue

        # Total: "21 ART, TOTAL A PAGAR : 48,05" or label only (price on next line)
        total_m = re.search(r"TOTAL A PAGAR\s*[:\s]*([\d,\.]+)?", line, re.IGNORECASE)
        if total_m:
            if total_m.group(1):
                receipt_total = _parse_price(total_m.group(1))
            else:
                past_total = True
            pending_names.clear()
            continue

        # Multi-unit descriptor "2 x ( 2,00 )" — skip, total follows
        if re.match(r"^\d+\s*[xX]\s*\(", line):
            continue

        # Price-only line
        pm = re.match(r"^([\d]+[,\.][\d]+)\s*$", line)
        if pm:
            price = _parse_price(pm.group(1))
            if price is not None and pending_names:
                items.append(ParsedLine(name=pending_names.pop(0), price=price))
            continue

        if len(line) > 2 and not re.match(r"^\d+[,\.]?\d*\s*$", line):
            pending_names.append(line)

    return items, receipt_date, receipt_total


# ── Generic fallback ──────────────────────────────────────────────────────────

def _parse_generic(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"\s*(TOTAL|Total|IVA|Tarjeta|EFECTIVO)", line):
            m = re.search(r"([\d,\.]+)\s*$", line)
            if re.match(r"\s*(TOTAL|Total)\b", line) and m:
                receipt_total = _parse_price(m.group(1))
            continue

        m = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None and len(name) > 1:
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


# ── Public entry point ────────────────────────────────────────────────────────

def parse_receipt(ocr_text: str) -> ParsedReceipt:
    lines = ocr_text.splitlines()
    store = _detect_store(lines)

    _DISPATCH: dict[str, object] = {
        "Mercadona": _parse_mercadona,
        "Ahorramas": _parse_ahorramas,
        "Alcampo": _parse_alcampo,
        "Aldi": _parse_aldi,
        "Caprabo": _parse_caprabo,
        "Carrefour": _parse_carrefour,
        "Consum": _parse_consum,
        "Dia": _parse_dia,
        "El Corte Inglés": _parse_eci,
        "Eroski": _parse_eroski,
        "Gadis": _parse_gadis,
        "HiperDino": _parse_hiperdino,
        "Lidl": _parse_lidl,
        "Primaprix": _parse_primaprix,
        "Sqrups": _parse_sqrups,
        "Supeco": _parse_supeco,
    }

    parser = _DISPATCH.get(store or "", _parse_generic)
    items, receipt_date, receipt_total = parser(lines)

    return ParsedReceipt(
        store=store,
        receipt_date=receipt_date,
        receipt_total=receipt_total,
        lines=items,
    )
