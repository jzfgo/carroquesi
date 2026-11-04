from datetime import date

import pytest

from app.services.insights.data import month_bounds
from app.services.insights.savings import SavingsThresholds, cheaper_elsewhere
from tests.insights_factory import MADRID, line, trip, window

MONTH = "2026-10"
MONTH_END = month_bounds(MONTH, MADRID)[1]


def _bought(
    name: str, price: float, qty: float, days: list[str], store="Mercadona", basis="unit", **kw
):
    """One trip per day at `store`, each buying `qty` of `name` at `price`."""
    trips, lines = [], []
    for day in days:
        t = trip(day, store)
        trips.append(t)
        lines.append(line(t, name, price * qty, unit_price=price, basis=basis, **kw))
    return trips, lines


def _report(*parts, **th):
    trips = [t for p in parts for t in p[0]]
    lines = [x for p in parts for x in p[1]]
    return cheaper_elsewhere(window(trips, lines), MONTH, MONTH_END, SavingsThresholds(**th))


THREE_MONTHS = ["2026-08-10", "2026-09-10", "2026-10-10"]


def test_a_cheaper_price_at_another_chain_is_suggested():
    paid = _bought("Leche", 1.20, 10, THREE_MONTHS)
    seen = _bought("Leche", 1.05, 1, ["2026-10-11"], store="Ahorramas")

    (s,) = _report(paid, seen).suggestions

    assert (s.paid_store, s.cheaper_store) == ("Mercadona", "Ahorramas")
    assert (s.paid_price, s.cheaper_price) == (1.20, 1.05)
    assert s.saving_pct == pytest.approx(0.125)
    assert s.cheaper_seen_at == date(2026, 10, 11)
    # 0,15 € × 31 units in the window × 30 / 90
    assert s.monthly_eur == pytest.approx(1.55)


def test_a_small_percentage_gap_is_not_suggested():
    paid = _bought("Leche", 1.20, 10, THREE_MONTHS)
    seen = _bought("Leche", 1.104, 1, ["2026-10-11"], store="Ahorramas")

    assert _report(paid, seen).suggestions == []


def test_a_small_monthly_saving_is_not_suggested():
    paid = _bought("Leche", 1.20, 1, THREE_MONTHS)
    seen = _bought("Leche", 1.00, 1, ["2026-10-11"], store="Ahorramas")

    assert _report(paid, seen).suggestions == []


def test_per_unit_prices_that_spread_at_the_cheaper_store_are_not_trusted():
    paid = _bought("Filete", 6.00, 3, THREE_MONTHS)
    seen = _bought("Filete", 5.00, 1, ["2026-09-01"], store="Ahorramas")
    seen2 = _bought("Filete", 3.90, 1, ["2026-10-01"], store="Ahorramas")

    assert _report(paid, seen, seen2).suggestions == []


def test_per_kg_prices_may_spread():
    paid = _bought("Solomillo", 15.0, 1, THREE_MONTHS, basis="kg")
    seen = _bought("Solomillo", 13.0, 1, ["2026-09-01"], store="Ahorramas", basis="kg")
    seen2 = _bought("Solomillo", 10.0, 1, ["2026-10-01"], store="Ahorramas", basis="kg")

    (s,) = _report(paid, seen, seen2).suggestions

    assert (s.basis, s.cheaper_price) == ("kg", 10.0)


def test_prices_on_different_bases_are_never_compared():
    paid = _bought("Queso", 6.00, 3, THREE_MONTHS)
    seen = _bought("Queso", 2.00, 1, ["2026-10-11"], store="Ahorramas", basis="kg")

    assert _report(paid, seen).suggestions == []


def test_spelling_variants_of_one_store_are_not_another_chain():
    paid = _bought("Leche", 1.20, 10, THREE_MONTHS, store="Ahorramas")
    seen = _bought("Leche", 0.90, 1, ["2026-10-11"], store="AhorraMas")

    assert _report(paid, seen).suggestions == []


def test_an_observation_outside_the_window_is_ignored():
    paid = _bought("Leche", 1.20, 10, THREE_MONTHS)
    seen = _bought("Leche", 0.90, 1, ["2026-07-20"], store="Ahorramas")

    assert _report(paid, seen).suggestions == []


def test_a_product_not_bought_this_month_is_not_suggested():
    paid = _bought("Leche", 1.20, 10, ["2026-08-10", "2026-09-10"])
    seen = _bought("Leche", 0.90, 1, ["2026-10-11"], store="Ahorramas")

    assert _report(paid, seen).suggestions == []


def test_at_most_five_suggestions_best_saving_first():
    parts = []
    for i in range(7):
        name = f"Producto {i}"
        parts.append(_bought(name, 2.00, 10 + i, THREE_MONTHS))
        parts.append(_bought(name, 1.50, 1, ["2026-10-11"], store="Ahorramas"))

    suggestions = _report(*parts).suggestions

    assert [s.name for s in suggestions] == [f"Producto {i}" for i in (6, 5, 4, 3, 2)]


def test_the_thresholds_are_reported_and_configurable():
    paid = _bought("Leche", 1.20, 20, THREE_MONTHS)
    seen = _bought("Leche", 1.104, 1, ["2026-10-11"], store="Ahorramas")

    report = _report(paid, seen, min_saving_pct=0.05)

    assert len(report.suggestions) == 1
    assert report.thresholds.min_saving_pct == 0.05
