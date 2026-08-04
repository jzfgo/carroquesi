import pytest

from app.services.quantity import parse_quantity_factor


@pytest.mark.parametrize(
    ("quantity", "price_per", "expected"),
    [
        # Non-per-unit: a plain count multiplies the price.
        ("12 ud", None, 12.0),
        ("3", None, 3.0),
        # Non-per-unit: an SI unit is a pack descriptor → ×1.
        ("1 kg", None, 1.0),
        ("500 g", None, 1.0),
        # No / unmatched quantity, non-per-unit → 1.
        (None, None, 1.0),
        ("", None, 1.0),
        ("granel", None, 1.0),
        # Per-kg: convert the quantity to kg.
        ("2 kg", "KILOGRAM", 2.0),
        ("500 g", "KILOGRAM", 0.5),
        ("750 ml", "KILOGRAM", 0.75),
        # Per-kg without a recognised SI unit → None (no computable amount).
        ("1 ud", "KILOGRAM", None),
        (None, "KILOGRAM", None),
        # Comma decimal + trailing-dot unit abbreviation.
        ("1,5 kg.", "KILOGRAM", 1.5),
    ],
)
def test_parse_quantity_factor(quantity, price_per, expected):
    result = parse_quantity_factor(quantity, price_per)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected)
