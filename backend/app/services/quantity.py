"""How much of a line one price covers — the backend twin of the frontend's
`parseQuantityFactor` (frontend/src/lib/itemCost.ts).

A line's displayed amount is `price * factor`, so a provisional trip total (the
stack's «≈ total» on an unclosed proto-ticket) must sum `price * factor`, not
raw prices, or the folded figure would disagree with the expanded rows. This
logic is kept byte-for-byte equivalent to the frontend so the two never drift;
`test_quantity.py` pins the shared cases.
"""

import re
from typing import Literal

# SI units → kg equivalent (volume treated as water: 1 L = 1 kg).
UNIT_TO_KG: dict[str, float] = {
    "g": 0.001,
    "kg": 1.0,
    "ml": 0.001,
    "cl": 0.01,
    "dl": 0.1,
    "l": 1.0,
}

# A leading decimal number (comma or dot separator) then an optional unit token
# (letters, optional trailing dot as an abbreviation marker). Prefix match, the
# same shape as the JS QTY_RE.
_QTY_RE = re.compile(r"^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+\.?)?", re.IGNORECASE)


def parse_quantity_factor(quantity: str | None, price_per: str | None) -> float | None:
    """The factor to multiply a line's `price` by, or None when it can't apply.

    - price_per == "KILOGRAM": needs a recognised SI unit to convert to kg; no
      unit or an unrecognised one → None (the line has no computable amount).
    - price_per is None: an SI unit is a pack-size descriptor → ×1; a plain
      number or unrecognised unit text → the numeric count.
    Empty/unmatched quantity → None if per-kg, else 1.
    """
    is_per_kg = price_per == "KILOGRAM"

    if not quantity:
        return None if is_per_kg else 1.0

    m = _QTY_RE.match(quantity.strip())
    if not m:
        return None if is_per_kg else 1.0

    value = float(m.group(1).replace(",", "."))
    raw_unit = m.group(2)
    if raw_unit is not None:
        raw_unit = re.sub(r"\.$", "", raw_unit).lower()
    kg_factor = UNIT_TO_KG.get(raw_unit) if raw_unit is not None else None

    if is_per_kg:
        return value * kg_factor if kg_factor is not None else None

    # Non-per-unit: an SI unit is a pack descriptor (×1), otherwise the count.
    return 1.0 if kg_factor is not None else value


def effective_quantity(quantity: str | None, purchased_quantity: str | None) -> str | None:
    """What was bought wins over what was asked for. `is not None`, not
    truthiness: the frontend row makes the same test."""
    return purchased_quantity if purchased_quantity is not None else quantity


def line_amount(
    price: float | None,
    quantity: str | None,
    purchased_quantity: str | None,
    price_per: str | None,
) -> float | None:
    """The money a line is, or None when it is unpriced or the price cannot
    apply. What was bought wins over what was asked for: a tray asked as
    «1 kg» and weighed at 0,636 kg costs the 0,636 kg."""
    if price is None:
        return None
    factor = parse_quantity_factor(effective_quantity(quantity, purchased_quantity), price_per)
    return None if factor is None else price * factor


def unit_price(
    price: float, quantity: str | None, price_per: str | None
) -> tuple[float, Literal["kg", "unit"]]:
    """A line's price on a scale that compares across purchases: €/kg when
    the line is weighed or names its weight, otherwise €/unit.

    A pack that names its content («500 g» at 1,20) becomes 2,40 €/kg, the
    same step the price history chart takes. Callers compare two prices only
    when their bases match.
    """
    if price_per == "KILOGRAM":
        return price, "kg"
    kg_factor = parse_quantity_factor(quantity, "KILOGRAM")
    if kg_factor:
        return price / kg_factor, "kg"
    return price, "unit"
