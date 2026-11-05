import pytest

from app.services.insights.descriptive import (
    by_requester,
    by_store,
    cadence,
    coverage,
    product_moves,
    top_products,
    totals,
)
from tests.insights_factory import line, trip, window


def test_coverage_counts_priced_lines_confirmed_trips_and_unattributed_spend():
    confirmed = trip("2026-10-05", total=50.0)
    open_ = trip("2026-10-12")
    other_month = trip("2026-09-05", total=99.0)
    w = window(
        [confirmed, open_, other_month],
        [
            line(confirmed, amount=40.0),
            line(confirmed, amount=None),
            line(open_, amount=10.0),
            line(other_month, amount=1.0),
        ],
    )

    c = coverage(w, "2026-10", tripless_lines=2)

    assert (c.lines_priced, c.lines_total) == (2, 3)
    assert (c.trips_confirmed, c.trips) == (1, 2)
    # Measured on the confirmed trip only: the open one has no total to
    # measure its lines against.
    assert (c.unattributed, c.lines_over, c.trips_lines_over) == (10.0, 0.0, 0)
    assert c.tripless_lines == 2


def test_coverage_cannot_tell_the_gaps_without_a_confirmed_total():
    t = trip("2026-10-05")
    w = window([t], [line(t, amount=5.0), line(t, amount=None)])

    c = coverage(w, "2026-10", tripless_lines=0)

    assert (c.unattributed, c.lines_over) == (None, None)


def test_coverage_counts_lines_that_exceed_the_ticket_apart():
    t = trip("2026-10-05", total=20.0)
    w = window([t], [line(t, amount=15.0), line(t, amount=9.96)])

    c = coverage(w, "2026-10", tripless_lines=0)

    assert (c.unattributed, c.lines_over, c.trips_lines_over) == (0.0, 4.96, 1)


def test_coverage_keeps_gaps_on_different_trips_from_cancelling():
    short = trip("2026-10-05", total=20.0)  # 5 € of unpriced lines
    over = trip("2026-10-12", total=10.0)  # 5 € of discounts the receipt hides
    w = window(
        [short, over],
        [line(short, amount=15.0), line(short, amount=None), line(over, amount=15.0)],
    )

    c = coverage(w, "2026-10", tripless_lines=0)

    assert (c.unattributed, c.lines_over, c.trips_lines_over) == (5.0, 5.0, 1)


def test_coverage_ignores_float_noise_on_a_trip_that_matches():
    t = trip("2026-10-05", total=0.3)
    w = window([t], [line(t, amount=0.1), line(t, amount=0.2)])

    c = coverage(w, "2026-10", tripless_lines=0)

    assert (c.unattributed, c.lines_over, c.trips_lines_over) == (0.0, 0.0, 0)
    assert str(c.lines_over) == "0.0"


def test_totals_prefer_the_confirmed_total_and_flag_line_sums():
    confirmed = trip("2026-10-05", total=50.0)
    open_ = trip("2026-10-12")
    w = window(
        [confirmed, open_],
        [line(confirmed, amount=40.0), line(open_, amount=10.0), line(open_, amount=5.0)],
    )

    t = totals(w, "2026-10")

    assert t.total == 65.0
    assert t.approximate is True
    assert (t.trips, t.trips_confirmed) == (2, 1)


def test_totals_compare_with_previous_month_and_the_baseline():
    trips = [
        trip("2026-07-10", total=30.0),
        trip("2026-08-10", total=60.0),
        trip("2026-09-10", total=90.0),
        trip("2026-10-10", total=99.0),
    ]
    t = totals(window(trips, []), "2026-10")

    assert t.vs_previous == pytest.approx(0.10)
    assert t.baseline is not None
    assert t.baseline.months == ["2026-07", "2026-08", "2026-09"]
    assert t.baseline.mean == 60.0
    assert t.vs_average == pytest.approx(0.65)
    assert [p.month for p in t.series] == ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
    assert [p.total for p in t.series] == [0.0, 30.0, 60.0, 90.0, 99.0]


def test_the_baseline_reaches_back_twelve_months_and_no_further():
    trips = [trip(f"{m}-10", total=10.0) for m in ["2025-09", "2025-10", "2026-03", "2026-09"]]
    trips.append(trip("2026-10-10", total=20.0))

    t = totals(window(trips, []), "2026-10")

    assert t.baseline is not None
    assert t.baseline.months == ["2025-10", "2026-03", "2026-09"]
    assert t.vs_average == pytest.approx(1.0)


def test_the_baseline_skips_empty_months_and_months_with_an_unconfirmed_trip():
    trips = [
        trip("2026-05-10", total=100.0),
        # June has one trip with no confirmed total: its line sum would read low.
        trip("2026-06-03", total=80.0),
        trip("2026-06-20"),
        # July and August are empty: a summer away is not a normal month.
        trip("2026-09-10", total=50.0),
        trip("2026-10-10", total=150.0),
    ]

    t = totals(window(trips, []), "2026-10")

    assert t.baseline is not None
    assert t.baseline.months == ["2026-05", "2026-09"]
    assert t.baseline.mean == 75.0
    assert t.vs_average == pytest.approx(1.0)


def test_a_first_month_has_no_baseline():
    t = totals(window([trip("2026-10-10", total=50.0)], []), "2026-10")

    assert t.baseline is None
    assert t.vs_average is None
    assert t.vs_last_year is None


def test_totals_compare_with_the_same_month_last_year_when_complete():
    trips = [trip("2025-10-10", total=80.0), trip("2026-10-10", total=100.0)]

    t = totals(window(trips, []), "2026-10")

    assert t.vs_last_year == pytest.approx(0.25)


def test_an_incomplete_month_last_year_is_not_compared():
    trips = [
        trip("2025-10-10", total=80.0),
        trip("2025-10-20"),
        trip("2026-10-10", total=100.0),
    ]

    assert totals(window(trips, []), "2026-10").vs_last_year is None


def test_by_store_groups_spelling_variants_under_one_key():
    trips = [
        trip("2026-10-01", "Ahorramas", total=10.0),
        trip("2026-10-02", "AhorraMas", total=20.0),
        trip("2026-10-03", "AHORRAMAS", total=30.0),
        trip("2026-10-04", None, total=5.0),
    ]
    w = window(trips, [], store_names={trips[0].store_key: "Ahorramas"})

    stores = by_store(w, "2026-10").stores

    assert [(s.name, s.amount, s.trips) for s in stores] == [
        ("Ahorramas", 60.0, 3),
        ("Sin tienda", 5.0, 1),
    ]


def test_top_products_flag_new_ones_and_compare_with_their_baseline():
    aug, sep, oct_ = (
        trip("2026-08-10", total=5.0),
        trip("2026-09-10", total=6.0),
        trip("2026-10-10"),
    )
    w = window(
        [aug, sep, oct_],
        [
            line(sep, "Leche", 6.0),
            line(oct_, "Leche", 9.0),
            line(oct_, "Solomillo", 20.0, brand="Hacendado"),
        ],
    )

    products = {p.name: p for p in top_products(w, "2026-10").products}

    assert products["Solomillo"].new is True
    assert products["Solomillo"].brand == "Hacendado"
    assert products["Leche"].new is False
    # Leche averaged (0 + 6) / 2 over Aug–Sep; 9 is +200 %.
    assert products["Leche"].vs_average == pytest.approx(2.0)
    assert [p.name for p in top_products(w, "2026-10").products] == ["Solomillo", "Leche"]


def test_a_product_uses_the_same_baseline_months_as_the_total():
    # September has an unconfirmed trip, so it is not in the baseline: the
    # Leche bought there neither counts in its average nor makes it new.
    aug, sep, oct_ = trip("2026-08-10", total=4.0), trip("2026-09-10"), trip("2026-10-10")
    w = window(
        [aug, sep, oct_],
        [line(aug, "Leche", 4.0), line(sep, "Leche", 50.0), line(oct_, "Leche", 6.0)],
    )

    leche = top_products(w, "2026-10").products[0]

    assert leche.vs_average == pytest.approx(0.5)
    assert leche.new is False


def test_a_first_month_marks_nothing_new():
    t = trip("2026-10-10")
    products = top_products(window([t], [line(t, "Leche")]), "2026-10").products

    assert products[0].new is False
    assert products[0].vs_average is None


def test_by_requester_sums_line_money_and_reports_coverage():
    t = trip("2026-10-10")
    w = window(
        [t],
        [
            line(t, "Leche", 3.0, added_by="u-alice"),
            line(t, "Pan", 2.0, added_by="u-bob"),
            line(t, "Huevos", 4.0, added_by="u-bob"),
            line(t, "Fruta", None, added_by="u-alice"),
        ],
    )

    r = by_requester(w, "2026-10")

    assert [(x.name, x.amount) for x in r.requesters] == [("Bob", 6.0), ("Alice", 3.0)]
    # Lines count priced or not: the unpriced Fruta is still Alice's.
    assert [x.lines for x in r.requesters] == [2, 2]
    assert (r.lines_priced, r.lines_total) == (3, 4)


def test_a_requester_with_only_unpriced_lines_is_listed():
    t = trip("2026-10-10")
    w = window([t], [line(t, "Fruta", None, added_by="u-bob")])

    (bob,) = by_requester(w, "2026-10").requesters

    assert (bob.name, bob.amount, bob.lines) == ("Bob", 0.0, 1)


def test_cadence_is_the_mean_gap_between_trip_days():
    w = window([trip("2026-10-01"), trip("2026-10-08"), trip("2026-10-22")], [])

    c = cadence(w, "2026-10")

    assert c.trips == 3
    assert c.mean_days_between == pytest.approx(10.5)


def test_one_trip_has_no_cadence():
    assert cadence(window([trip("2026-10-01")], []), "2026-10").mean_days_between is None


def test_top_products_add_up_what_was_bought_and_in_how_many_trips():
    a, b = trip("2026-10-03"), trip("2026-10-17")
    w = window(
        [a, b],
        [
            line(a, "Salmón", 10.0, quantity=2),
            line(b, "Salmón", 16.0, quantity=3),
            line(a, "Plátano", 2.0, quantity=0.8, measure="kg"),
            line(b, "Plátano", 1.5, quantity=0.6, measure="kg"),
            line(a, "Queso", 4.0, quantity=None, measure="kg"),
        ],
    )

    products = {p.name: p for p in top_products(w, "2026-10").products}

    assert (products["Salmón"].quantity, products["Salmón"].measure) == (5, "ud")
    assert products["Salmón"].trips == 2
    assert products["Plátano"].quantity == pytest.approx(1.4)
    assert products["Plátano"].measure == "kg"
    # A weighed line with no weight cannot say how much was bought.
    assert products["Queso"].quantity is None


def test_a_product_bought_by_weight_and_by_unit_has_no_quantity():
    t = trip("2026-10-03")
    w = window(
        [t],
        [line(t, "Pollo", 5.0, quantity=1), line(t, "Pollo", 4.0, quantity=0.5, measure="kg")],
    )

    (pollo,) = top_products(w, "2026-10").products

    assert pollo.quantity is None


def test_the_most_frequent_product_counts_trips_priced_or_not():
    a, b, c = trip("2026-10-03"), trip("2026-10-10"), trip("2026-10-17")
    w = window(
        [a, b, c],
        [
            line(a, "Pan", None),
            line(b, "Pan", None),
            line(c, "Pan", None),
            line(a, "Solomillo", 30.0),
            line(b, "Leche", 1.0),
            line(c, "Leche", 1.0),
        ],
    )

    top = top_products(w, "2026-10")

    assert top.most_frequent is not None
    assert (top.most_frequent.name, top.most_frequent.trips) == ("Pan", 3)
    # A product with no price stays out of the ranking by money.
    assert "Pan" not in {p.name for p in top.products}


def test_the_most_frequent_tie_goes_to_the_one_that_cost_more():
    a, b = trip("2026-10-03"), trip("2026-10-10")
    w = window(
        [a, b],
        [line(a, "Pan", 1.0), line(b, "Pan", 1.0), line(a, "Vino", 9.0), line(b, "Vino", 9.0)],
    )

    top = top_products(w, "2026-10")

    assert top.most_frequent is not None and top.most_frequent.name == "Vino"


def test_a_month_with_no_lines_has_no_most_frequent_product():
    t = trip("2026-10-03", total=5.0)

    assert top_products(window([t], []), "2026-10").most_frequent is None


def test_product_averages_count_missing_months_as_zero():
    aug, sep, oct_ = (
        trip("2026-08-10", total=6.0),
        trip("2026-09-10", total=1.0),
        trip("2026-10-10"),
    )
    w = window(
        [aug, sep, oct_],
        [line(aug, "Leche", 6.0), line(sep, "Pan", 1.0), line(oct_, "Leche", 9.0)],
    )

    products = {p.name: p for p in top_products(w, "2026-10").products}

    assert products["Leche"].average == 3.0


def test_product_moves_rank_rises_and_falls_against_the_baseline_mean():
    aug, sep, oct_ = (
        trip("2026-08-10", total=30.0),
        trip("2026-09-10", total=30.0),
        trip("2026-10-10"),
    )
    w = window(
        [aug, sep, oct_],
        [
            line(aug, "Salmón", 10.0),
            line(sep, "Salmón", 10.0),
            line(oct_, "Salmón", 40.0),
            line(aug, "Vino", 20.0),
            line(sep, "Vino", 20.0),
            line(oct_, "Vino", 5.0),
            # Bought only before: falls by its whole mean.
            line(aug, "Turrón", 4.0),
            # New this month: rises by all of it.
            line(oct_, "Cordero", 12.0),
            # Unchanged: not a move.
            line(sep, "Pan", 2.0),
            line(aug, "Pan", 2.0),
            line(oct_, "Pan", 2.0),
        ],
    )

    moves = product_moves(w, "2026-10")

    assert [(m.name, m.delta) for m in moves.rises] == [("Salmón", 30.0), ("Cordero", 12.0)]
    assert [(m.name, m.delta) for m in moves.falls] == [("Vino", -15.0), ("Turrón", -2.0)]
    assert (moves.rises[0].amount, moves.rises[0].average) == (40.0, 10.0)


def test_product_moves_keep_the_five_largest_each_way():
    sep, oct_ = trip("2026-09-10", total=1.0), trip("2026-10-10")
    w = window([sep, oct_], [line(oct_, f"P{k}", float(k)) for k in range(1, 8)])

    rises = product_moves(w, "2026-10").rises

    assert [m.name for m in rises] == ["P7", "P6", "P5", "P4", "P3"]


def test_product_moves_need_a_baseline():
    t = trip("2026-10-10")
    moves = product_moves(window([t], [line(t, "Leche", 3.0)]), "2026-10")

    assert (moves.rises, moves.falls) == ([], [])


def test_totals_carry_last_months_trip_count():
    sep, oct_a, oct_b = trip("2026-09-10"), trip("2026-10-03"), trip("2026-10-10")

    t = totals(window([sep, oct_a, oct_b], []), "2026-10")

    assert (t.trips, t.trips_previous) == (2, 1)


def test_a_first_month_has_no_previous_trip_count():
    t = trip("2026-10-10")

    assert totals(window([t], []), "2026-10").trips_previous is None
