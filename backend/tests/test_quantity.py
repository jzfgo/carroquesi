import json
from pathlib import Path

import pytest

from app.services.quantity import parse_quantity_factor, unit_price

VECTORS_PATH = (
    Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "quantityVectors.json"
)
VECTORS = json.loads(VECTORS_PATH.read_text())


@pytest.mark.parametrize(
    "vector", VECTORS["factor"], ids=lambda v: f"{v['quantity']}-{v['price_per']}"
)
def test_parse_quantity_factor_matches_shared_vectors(vector):
    """The frontend asserts the same file; either side drifting fails its suite."""
    result = parse_quantity_factor(vector["quantity"], vector["price_per"])
    if vector["expected"] is None:
        assert result is None
    else:
        assert result == pytest.approx(vector["expected"])


@pytest.mark.parametrize(
    "vector", VECTORS["unit_price"], ids=lambda v: f"{v['price']}-{v['quantity']}-{v['price_per']}"
)
def test_unit_price_matches_shared_vectors(vector):
    value, basis = unit_price(vector["price"], vector["quantity"], vector["price_per"])
    assert value == pytest.approx(vector["value"])
    assert basis == vector["basis"]
