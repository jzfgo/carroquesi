from app.services.insights.markdowns import markdowns
from tests.insights_factory import line, trip, window


def test_the_saving_is_the_difference_of_the_rounded_figures():
    t = trip("2026-10-05")
    w = window([t], [line(t, "Contramuslo", 2.006, reduced=True, amount_before=3.014)])

    m = markdowns(w, "2026-10")

    # 3,01 − 2,01 reads as 1,00 €, not the 1,01 € the raw sums would round to.
    assert (m.paid, m.before, m.saved) == (2.01, 3.01, 1.0)


def test_a_reduced_line_without_an_old_price_is_left_out():
    t = trip("2026-10-05")
    w = window([t], [line(t, "Contramuslo", 3.05, reduced=True)])

    assert markdowns(w, "2026-10").lines == 0
