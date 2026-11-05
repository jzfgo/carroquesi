import pytest

from app.services.insights.descriptive import by_requester, by_store, cadence, top_products, totals
from tests.insights_factory import line, trip, window


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
    assert (r.lines_priced, r.lines_total) == (3, 4)


def test_cadence_is_the_mean_gap_between_trip_days():
    w = window([trip("2026-10-01"), trip("2026-10-08"), trip("2026-10-22")], [])

    c = cadence(w, "2026-10")

    assert c.trips == 3
    assert c.mean_days_between == pytest.approx(10.5)


def test_one_trip_has_no_cadence():
    assert cadence(window([trip("2026-10-01")], []), "2026-10").mean_days_between is None
