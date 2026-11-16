"""How much money a line is, and its price on a comparable scale — the
backend twin of the frontend's `parseQuantityFactor` and `unitPrice`
(frontend/src/lib/itemCost.ts).

A line's displayed amount is `price * factor`, so a provisional trip total (the
stack's «≈ total» on an unclosed proto-ticket) and every spend insight must sum
`price * factor`, not raw prices, or the figures would disagree with the rows.
Both sides assert frontend/src/lib/quantityVectors.json, so neither can drift.
"""

import re
from typing import Literal

# What people type → the unit it means. Only these spellings price a line.
UNIT_ALIASES: dict[str, str] = {
    "g": "g",
    "gr": "g",
    "gramo": "g",
    "gramos": "g",
    "kg": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "ml": "ml",
    "cl": "cl",
    "dl": "dl",
    "l": "l",
    "litro": "l",
    "litros": "l",
}

Basis = Literal["kg", "l", "ud", "unit"]

# A unit → how many of its basis (kilos or litres) it holds.
UNIT_TO_BASE: dict[str, tuple[float, Literal["kg", "l"]]] = {
    "g": (0.001, "kg"),
    "kg": (1.0, "kg"),
    "ml": (0.001, "l"),
    "cl": (0.01, "l"),
    "dl": (0.1, "l"),
    "l": (1.0, "l"),
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
    unit = _unit(m.group(2))
    # A weighed line sold by volume counts its litres as kilos, as before.
    kg_factor = UNIT_TO_BASE[unit][0] if unit is not None else None

    if is_per_kg:
        return value * kg_factor if kg_factor is not None else None

    # Non-per-unit: an SI unit is a pack descriptor (×1), otherwise the count.
    return 1.0 if kg_factor is not None else value


def _unit(raw: str | None) -> str | None:
    """The unit a typed token means, or None when it is not one we price."""
    if raw is None:
        return None
    return UNIT_ALIASES.get(re.sub(r"\.$", "", raw).lower())


def _measure(quantity: str | None) -> tuple[float, Literal["kg", "l"]] | None:
    """A quantity that names a weight or volume, in kilos or litres."""
    if not quantity:
        return None
    m = _QTY_RE.match(quantity.strip())
    if not m:
        return None
    unit = _unit(m.group(2))
    if unit is None:
        return None
    factor, basis = UNIT_TO_BASE[unit]
    return float(m.group(1).replace(",", ".")) * factor, basis


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
    price: float,
    quantity: str | None,
    price_per: str | None,
    pack_count: int | None = None,
    pack_content: float | None = None,
    pack_content_unit: str | None = None,
) -> tuple[float, Basis]:
    """A line's price on a scale that compares across purchases, like a
    shelf label: €/kg, €/L, €/ud of a pack, or €/unit bought.

    - A weighed line is already €/kg; its format does not matter.
    - A pack format wins: 6 × 1,5 L at 3,48 is 0,39 €/L; a pack of 12 with
      no content at 3,60 is 0,30 €/ud.
    - With no format, a quantity that names a size is read as the package
      size («500 g» at 1,20 → 2,40 €/kg). Lines from before formats existed
      keep their place in the history this way.
    - Otherwise the price is per unit bought.

    `price` is per pack bought, never the line total. Callers compare two
    prices only when their bases match.
    """
    if price_per == "KILOGRAM":
        return price, "kg"
    count = pack_count or 1
    if pack_content and pack_content_unit in UNIT_TO_BASE:
        factor, basis = UNIT_TO_BASE[pack_content_unit]
        return price / (count * pack_content * factor), basis
    if count > 1:
        return price / count, "ud"
    measure = _measure(quantity)
    if measure and measure[0]:
        return price / measure[0], measure[1]
    return price, "unit"
