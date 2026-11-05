from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.db.models import List, ListItem, Purchase, User
from app.services import mailer, monthly_report
from app.services.insights.engine import compute_report
from app.services.insights.schemas import (
    Baseline,
    ByRequester,
    ByStore,
    Cadence,
    CheaperElsewhere,
    Coverage,
    MonthPoint,
    ProductMove,
    ProductMoves,
    ProductSpend,
    RequesterSpend,
    SavingsThresholds,
    SpendReport,
    StoreSpend,
    Suggestion,
    TopProducts,
    Totals,
)
from app.services.report_email import (
    baseline_caption,
    build_report_email,
    coverage_clauses,
    eur,
    headline,
    leader,
    lede,
    month_label,
    pct,
    preheader,
    quantity_label,
    report_view,
)
from app.services.report_opt_out import read_token

MADRID = ZoneInfo("Europe/Madrid")
L = "list-1"
OCT = "2026-10"
FIVE = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_token_secret", "test-secret")
    monkeypatch.setattr(get_settings(), "frontend_url", "https://app.example.com")


def sp(text: str) -> str:
    """Figures keep a non-breaking space before their unit; compare as plain."""
    return text.replace(" ", " ")


# --- builders ----------------------------------------------------------------


def _totals(**fields) -> Totals:
    base = {
        "list_id": L,
        "period": OCT,
        "total": 681.95,
        "approximate": False,
        "trips": 26,
        "trips_confirmed": 26,
        "vs_previous": 0.15,
        "trips_previous": 17,
        "baseline": Baseline(months=FIVE, mean=431.55),
        "vs_average": 0.5802,
        "vs_last_year": None,
        "series": [MonthPoint(month=OCT, total=681.95, approximate=False)],
    }
    return Totals.model_validate(base | fields)


def _product(name: str, amount: float = 1.0, **fields) -> ProductSpend:
    base = {
        "name": name,
        "brand": None,
        "amount": amount,
        "average": None,
        "vs_average": None,
        "new": False,
        "quantity": 1.0,
        "measure": "ud",
        "trips": 1,
    }
    return ProductSpend.model_validate(base | fields)


def _move(name: str, delta: float) -> ProductMove:
    return ProductMove(name=name, brand=None, amount=10.0, average=10.0 - delta, delta=delta)


def _moves(rises=(), falls=()) -> ProductMoves:
    return ProductMoves(list_id=L, period=OCT, rises=list(rises), falls=list(falls))


def _coverage(**fields) -> Coverage:
    base = {
        "lines_total": 202,
        "lines_priced": 199,
        "trips": 26,
        "trips_confirmed": 26,
        "unattributed": 0.03,
        "lines_over": 0.0,
        "trips_lines_over": 0,
        "tripless_lines": 0,
    }
    return Coverage(**(base | fields))


def _report(
    totals: Totals | None = None,
    *,
    moves: ProductMoves | None = None,
    products: list[ProductSpend] | None = None,
    frequent: ProductSpend | None = None,
    requesters: tuple[str, ...] = ("Marina", "Lucía"),
    suggestions: list[Suggestion] | None = None,
) -> SpendReport:
    totals = totals or _totals()
    period = totals.period
    return SpendReport(
        list_id=L,
        period=period,
        tz="Europe/Madrid",
        coverage=_coverage(trips=totals.trips),
        insights=[
            totals,
            ByStore(
                list_id=L,
                period=period,
                stores=[StoreSpend(store_key="m", name="Mercadona", amount=10.0, trips=1)],
            ),
            TopProducts(
                list_id=L,
                period=period,
                products=products or [],
                most_frequent=frequent,
                lines_total=1,
                lines_priced=1,
            ),
            moves or _moves(),
            ByRequester(
                list_id=L,
                period=period,
                lines_total=1,
                lines_priced=1,
                requesters=[
                    RequesterSpend(user_id=n, name=n, amount=1.0, lines=1) for n in requesters
                ],
            ),
            Cadence(list_id=L, period=period, trips=totals.trips, mean_days_between=None),
            CheaperElsewhere(
                list_id=L,
                period=period,
                suggestions=suggestions or [],
                thresholds=SavingsThresholds(),
            ),
        ],
    )


def _seed(session: Session, user: User) -> List:
    lst = List(name="Casa & <cía>", emoji="🏠", owner_id=user.id)
    session.add(lst)
    session.commit()
    for day, store, price in [
        (datetime(2026, 9, 10, 10, tzinfo=UTC), "Mercadona", 1.20),
        (datetime(2026, 10, 10, 10, tzinfo=UTC), "Mercadona", 1234.5),
    ]:
        trip = Purchase(
            list_id=lst.id, opened_at=day, tears_off_at=day + timedelta(days=1), store=store
        )
        session.add(trip)
        session.commit()
        session.add(
            ListItem(
                list_id=lst.id,
                name="Leche",
                quantity="1 ud",
                price=price,
                added_by=user.id,
                purchase_id=trip.id,
                purchased_at=day,
            )
        )
        session.commit()
    return lst


def _confirmed_months(session: Session, user: User, months: list[tuple[datetime, float]]) -> List:
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    for day, total in months:
        session.add(
            Purchase(
                list_id=lst.id,
                opened_at=day,
                tears_off_at=day + timedelta(days=1),
                closed_at=day,
                total=total,
            )
        )
    session.commit()
    return lst


# --- formatting --------------------------------------------------------------


def test_formats():
    assert sp(eur(1234.5)) == "1.234,50 €"
    assert sp(eur(0.8)) == "0,80 €"
    assert sp(pct(0.65)) == "+65 %"
    assert sp(pct(-0.2)) == "−20 %"
    assert month_label("2026-10") == "octubre de 2026"


def test_a_figure_never_wraps_apart_from_its_unit():
    assert eur(1.0) == "1,00 €"
    assert pct(0.1) == "+10 %"


@pytest.mark.parametrize(
    ("quantity", "measure", "label"),
    [
        (9, "ud", "9 uds"),
        (1, "ud", "1 ud"),
        (1.5, "ud", "1,5 uds"),
        (1.4, "kg", "1,4 kg"),
        (0.636, "kg", "0,64 kg"),
        (None, "kg", None),
    ],
)
def test_quantity_labels(quantity, measure, label):
    assert quantity_label(_product("x", quantity=quantity, measure=measure)) == label


def test_a_leader_cuts_the_name_and_keeps_the_suffix():
    line = leader("Hamburguesa de vaca madurada", "27,90 €", ", 10 uds")

    assert line.endswith("…, 10 uds ... 27,90 €")
    assert len(line) == 46


def test_a_short_leader_ends_at_the_same_column():
    assert leader("Gasto", "681,95 €") == "  Gasto ............................. 681,95 €"


# --- headline, preheader, lede -------------------------------------------------


def test_the_headline_names_a_rise_against_the_baseline():
    assert sp(headline(_totals(), OCT)) == (
        "Octubre costó 250 € más que tu media de los últimos 5 meses"
    )


def test_the_headline_names_a_fall():
    t = _totals(total=300.0, vs_average=-0.3)

    assert sp(headline(t, OCT)) == "Octubre costó 132 € menos que tu media de los últimos 5 meses"


def test_a_month_within_five_percent_reads_in_line():
    t = _totals(total=440.0, vs_average=0.0196)

    assert sp(headline(t, OCT)) == "Octubre: 440,00 €, en línea con tu media de los últimos 5 meses"


def test_a_one_month_baseline_is_named_by_its_month():
    t = _totals(baseline=Baseline(months=["2026-09"], mean=400.0), vs_average=0.7)

    assert sp(headline(t, OCT)).endswith("más que septiembre")


def test_a_one_month_baseline_from_another_year_names_the_year():
    t = _totals(period="2026-01", baseline=Baseline(months=["2025-12"], mean=400.0), vs_average=0.7)

    assert sp(headline(t, "2026-01")).endswith("más que diciembre de 2025")


def test_without_a_baseline_the_headline_states_the_month():
    t = _totals(total=30.99, trips=1, baseline=None, vs_average=None, trips_previous=None)

    assert sp(headline(t, "2026-06")) == "Junio: 30,99 € en 1 compra"


def test_an_approximate_total_is_marked():
    t = _totals(total=30.99, trips=2, approximate=True, baseline=None, vs_average=None)

    assert sp(headline(t, OCT)) == "Octubre: ≈ 30,99 € en 2 compras"


def test_a_month_without_purchases_says_so():
    t = _totals(total=0.0, trips=0, trips_confirmed=0, vs_average=-1.0)

    assert headline(t, OCT) == "Octubre: sin compras"
    assert lede(t, _moves(), OCT) == "Este mes no se registró ninguna compra en esta lista."


def test_the_preheader_follows_the_headline():
    assert sp(preheader(_totals(), OCT, "Casa")) == (
        "Octubre: 681,95 € en 26 compras, un 58 % más que tu media de los últimos 5 meses."
    )
    in_line = _totals(total=440.0, vs_average=0.02)
    assert sp(preheader(in_line, OCT, "Casa")).endswith(
        ", en línea con tu media de los últimos 5 meses."
    )
    first = _totals(total=30.99, trips=1, baseline=None, vs_average=None)
    assert sp(preheader(first, OCT, "Casa")) == "Octubre: 30,99 € en 1 compra."


def test_the_lede_compares_trips_and_sums_the_movers():
    moves = _moves(rises=[_move(f"P{k}", 23.58) for k in range(5)])

    assert sp(lede(_totals(), moves, OCT)) == (
        "26 compras, 9 más que en septiembre. "
        "Los cinco productos que más subieron suman 117,90 € de la diferencia."
    )


def test_the_lede_counts_the_movers_it_has():
    falls = _moves(falls=[_move("Vino", -15.0)])
    t = _totals(total=300.0, vs_average=-0.3, trips=17)

    assert sp(lede(t, falls, OCT)) == (
        "17 compras, las mismas que en septiembre. "
        "El producto que más bajó suma 15,00 € de la diferencia."
    )
    two = _moves(rises=[_move("A", 2.0), _move("B", 1.0)])
    assert sp(lede(_totals(trips=10), two, OCT)).endswith(
        "7 menos que en septiembre. Los dos productos que más subieron suman 3,00 € de la diferencia."
    )


def test_movers_that_outweigh_the_difference_are_not_said_to_be_part_of_it():
    # 90 € over the mean, but the top rises add up to 180 €: other products
    # fell, or the lines run over the tickets. "Suman 180 € de la diferencia"
    # would be false.
    t = _totals(total=190.0, baseline=Baseline(months=FIVE, mean=100.0), vs_average=0.9)
    moves = _moves(rises=[_move("A", 120.0), _move("B", 60.0)])

    assert lede(t, moves, OCT) == "26 compras, 9 más que en septiembre."


def test_a_small_difference_keeps_its_cents():
    t = _totals(total=8.40, baseline=Baseline(months=FIVE, mean=8.0), vs_average=0.05)

    assert sp(headline(t, OCT)) == "Octubre costó 0,40 € más que tu media de los últimos 5 meses"


def test_the_caption_explains_only_marks_the_chart_shows():
    # The approximate month is a leading empty one, so the chart drops it.
    series = [
        MonthPoint(month="2026-09", total=0.0, approximate=True),
        MonthPoint(month=OCT, total=400.0, approximate=False),
    ]

    view = report_view(_report(_totals(series=series)), "Casa")

    assert [b.label for b in view["chart"]] == ["oct"]
    assert view["chart_caption"].startswith("Euros de tickets confirmados.")


def test_an_in_line_month_explains_nothing():
    moves = _moves(rises=[_move("A", 2.0)])

    assert lede(_totals(vs_average=0.01), moves, OCT) == "26 compras, 9 más que en septiembre."


def test_the_first_month_has_its_own_lede():
    t = _totals(trips=1, trips_previous=None, baseline=None, vs_average=None)

    assert lede(t, _moves(), OCT) == (
        "Es el primer mes con compras en esta lista, así que todavía no hay con qué compararlo."
    )


def test_a_list_with_history_but_no_complete_month_says_why():
    t = _totals(baseline=None, vs_average=None)

    assert lede(t, _moves(), OCT).startswith(
        "26 compras, 9 más que en septiembre. Todavía no hay un mes completo"
    )


# --- sections ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("months", "caption"),
    [
        (["2026-09"], "Media de septiembre, el único mes completo disponible: 10,00 €."),
        (FIVE, "Media de mayo a septiembre, los meses completos disponibles: 10,00 €."),
        (
            ["2025-11", "2025-12", "2026-01"],
            "Media de noviembre de 2025 a enero de 2026, los meses completos disponibles: 10,00 €.",
        ),
        # A gap: a range would claim June.
        (["2026-05", "2026-07"], "Media de los 2 meses completos disponibles: 10,00 €."),
    ],
)
def test_the_chart_caption_names_the_baseline_months(months, caption):
    assert sp(baseline_caption(Baseline(months=months, mean=10.0))) == caption


def test_a_compared_month_shows_every_section():
    report = _report(
        moves=_moves(rises=[_move("Salmón", 30.67)]),
        products=[_product("Salmón", 100.83, quantity=9)],
        frequent=_product("Salmón", 100.83, quantity=9, trips=5),
    )

    view = report_view(report, "Casa")

    assert [sp(v) for _, v in view["tiles"]] == ["681,95 €", "+58 %", "26"]
    assert view["chart_title"] is None  # one point only: no trend to draw
    assert view["explain"].title == "Qué explica la subida"
    assert view["stores"] and view["people"]
    assert sp(view["habit"]) == (
        "Salmón aparece en 5 de las 26 compras: 9 uds y 100,83 €, el 15 % del gasto de la lista."
    )


def test_a_fall_is_explained_by_the_falls():
    report = _report(
        _totals(total=300.0, vs_average=-0.3),
        moves=_moves(rises=[_move("A", 1.0)], falls=[_move("Vino", -15.0)]),
    )

    explain = report_view(report, "Casa")["explain"]

    assert explain.title == "Qué explica la bajada"
    assert [(r.name, sp(r.value)) for r in explain.rows] == [("Vino", "−15,00 €")]


def test_without_a_baseline_only_the_month_itself_shows():
    report = _report(
        _totals(total=30.99, trips=1, trips_previous=None, baseline=None, vs_average=None),
        products=[_product("Bacon", 5.58, brand="Monells", quantity=2)],
        frequent=_product("Bacon", 5.58, trips=3),
    )

    view = report_view(report, "Pamplona")

    assert not view["tiles"] and not view["chart"] and not view["stores"] and not view["people"]
    assert view["explain"] is None and view["habit"] is None
    assert [r.detail for r in view["top"]] == ["Monells · 2 uds"]


def test_one_requester_hides_who_asked():
    assert report_view(_report(requesters=("Marina",)), "Casa")["people"] == []


def test_a_single_unit_prints_no_quantity():
    report = _report(products=[_product("Mini hamburguesa, pack de 6", 5.95, quantity=1)])

    assert report_view(report, "Casa")["top"][0].detail is None


def test_a_habit_needs_three_trips():
    report = _report(frequent=_product("Pan", 3.0, trips=2))

    assert report_view(report, "Casa")["habit"] is None


def test_a_habit_without_a_price_still_counts_trips():
    report = _report(frequent=_product("Pan", 0.0, quantity=None, trips=4))

    assert report_view(report, "Casa")["habit"] == "Pan aparece en 4 de las 26 compras."


def test_the_chart_drops_months_before_the_list_and_marks_estimates():
    series = [
        MonthPoint(month="2026-06", total=0.0, approximate=False),
        MonthPoint(month="2026-07", total=0.0, approximate=False),
        MonthPoint(month="2026-08", total=200.0, approximate=True),
        MonthPoint(month="2026-09", total=100.0, approximate=False),
        MonthPoint(month=OCT, total=400.0, approximate=False),
    ]
    view = report_view(_report(_totals(series=series)), "Casa")

    assert [(b.label, sp(b.value), b.height, b.current) for b in view["chart"]] == [
        ("ago", "≈ 200", 55, False),
        ("sep", "100", 28, False),
        ("oct", "400", 110, True),
    ]
    assert view["chart_title"] == "Últimos tres meses"
    assert view["chart_caption"].startswith("Euros de tickets; ≈ marca un mes")


def test_the_same_month_last_year_joins_the_caption():
    series = [MonthPoint(month=m, total=1.0, approximate=False) for m in ["2026-09", OCT]]
    view = report_view(_report(_totals(series=series, vs_last_year=0.12)), "Casa")

    assert sp(view["chart_caption"]).endswith("Frente a octubre de 2025: +12 %.")


def test_a_suggestion_names_the_day_of_the_cheaper_price():
    s = Suggestion(
        name="Plátano",
        brand=None,
        basis="kg",
        paid_store_key="m",
        paid_store="Mercadona",
        paid_price=2.80,
        cheaper_store_key="l",
        cheaper_store="Lidl",
        cheaper_price=2.25,
        cheaper_seen_at=date(2026, 9, 10),
        saving_pct=0.2,
        monthly_eur=1.03,
    )

    view = report_view(_report(suggestions=[s]), "Casa")

    (saving,) = view["savings"]
    assert sp(saving.monthly) == "1,03 €/mes"
    assert sp(saving.text) == (
        "Pagaste 2,80 €/kg en Mercadona. En Lidl pagaste 2,25 €/kg el 10/09."
    )
    assert sp(view["savings_rule"]) == (
        "Solo mostramos ahorros de al menos un 10 % y 1 € al mes, "
        "con precios que ya has pagado en los últimos 90 días."
    )


# --- the email ---------------------------------------------------------------


def test_the_email_carries_the_month_and_a_working_unsubscribe(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-10", MADRID)

    email = build_report_email(report, lst, user)

    assert email.to == user.email
    assert email.subject == "🏠 Casa & <cía>: tu gasto de octubre de 2026"
    assert "1.234,50 €" in sp(email.text) and "1.234,50 €" in sp(email.html)
    # The list name is user input: escaped in HTML, left alone in text.
    assert "Casa &amp; &lt;cía&gt;" in email.html
    assert "Casa & <cía>" in email.text
    link = email.headers["List-Unsubscribe"].strip("<>")
    assert link in email.text and link in email.html
    assert read_token(link.removeprefix("https://app.example.com/u/")) == (user.id, lst.id)
    assert email.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_a_failed_send_fails_the_delivery(session: Session, user: User, monkeypatch):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-10", MADRID)
    monkeypatch.setattr(mailer, "send", lambda email: False)

    with pytest.raises(RuntimeError):
        monthly_report.deliver(report, lst, user)


def test_a_line_break_in_the_list_name_stays_out_of_the_subject(session: Session, user: User):
    lst = _seed(session, user)
    lst.name = "Casa\r\nBcc: x@example.com"
    report = compute_report(session, lst.id, "2026-10", MADRID)

    email = build_report_email(report, lst, user)

    assert "\n" not in email.subject and "\r" not in email.subject


def test_the_email_names_the_baseline_and_the_same_month_last_year(session: Session, user: User):
    lst = _confirmed_months(
        session,
        user,
        [
            (datetime(2025, 10, 10, 10, tzinfo=UTC), 100.0),
            (datetime(2026, 8, 10, 10, tzinfo=UTC), 100.0),
            (datetime(2026, 9, 10, 10, tzinfo=UTC), 100.0),
            (datetime(2026, 10, 10, 10, tzinfo=UTC), 150.0),
        ],
    )

    email = build_report_email(compute_report(session, lst.id, "2026-10", MADRID), lst, user)

    text, html = sp(email.text), sp(email.html)
    assert "Octubre costó 50 € más que tu media de los últimos 3 meses." in text
    assert "Media de los 3 meses completos disponibles: 100,00 €." in " ".join(text.split())
    assert "Frente a octubre de 2025: +50 %." in " ".join(text.split())
    assert "Frente a octubre de 2025: +50 %." in html


def test_a_month_without_purchases_sends_only_the_footer(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-11", MADRID)

    email = build_report_email(report, lst, user)

    assert "Noviembre: sin compras" in email.html
    assert "Para ahorrar" not in email.text and "Para ahorrar" not in email.html
    assert "con precio" not in email.text and "con precio" not in email.html
    assert "Dejar de recibirlo" in email.html


def test_the_email_prints_the_coverage_footer(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-10", MADRID)

    email = build_report_email(report, lst, user)

    # No confirmed total: the footer cannot say how much is unattributed,
    # so it says nothing rather than "0,00 €".
    assert "1 de 1 producto con precio · 0 de 1 ticket con total confirmado." in email.html
    text = " ".join(email.text.split())
    assert "1 de 1 producto con precio. 0 de 1 ticket con total confirmado." in text
    assert "sin asignar" not in email.text and "sin asignar" not in email.html


# --- coverage footer ---------------------------------------------------------


def _clauses(cov: Coverage) -> list[str]:
    return [sp(c) for c in coverage_clauses(cov)]


def test_the_coverage_footer_names_the_unattributed_spend():
    assert _clauses(_coverage()) == [
        "199 de 202 productos con precio",
        "26 de 26 tickets con total confirmado",
        "0,03 € del total sin asignar a un producto",
    ]


def test_the_coverage_footer_says_zero_when_every_ticket_matches():
    (*_, last) = _clauses(_coverage(unattributed=0.0))

    assert last == "0,00 € del total sin asignar a un producto"


def test_the_coverage_footer_explains_lines_that_exceed_the_ticket():
    clauses = _clauses(
        _coverage(
            lines_total=9,
            lines_priced=9,
            trips=1,
            trips_confirmed=1,
            unattributed=0.0,
            lines_over=4.96,
            trips_lines_over=1,
        )
    )

    assert clauses == [
        "9 de 9 productos con precio",
        "1 de 1 ticket con total confirmado",
        "los productos suman 4,96 € más que el ticket, "
        "seguramente por descuentos que el ticket no detalla",
    ]


def test_the_coverage_footer_names_the_tickets_that_run_over_in_the_plural():
    (*_, last) = _clauses(_coverage(unattributed=0.0, lines_over=1.0, trips_lines_over=2))

    assert last.endswith(
        "más que los tickets, seguramente por descuentos que los tickets no detallan"
    )


def test_the_coverage_footer_shows_both_gaps_when_tickets_differ():
    # One ticket falls short, another runs over: a net figure would read 0 €.
    (*_, short, over) = _clauses(_coverage(unattributed=5.0, lines_over=5.0, trips_lines_over=1))

    assert short == "5,00 € del total sin asignar a un producto"
    assert over == (
        "en otro ticket los productos suman 5,00 € más que el ticket, "
        "seguramente por descuentos que el ticket no detalla"
    )


def test_the_coverage_footer_says_other_tickets_in_the_plural():
    (*_, over) = _clauses(_coverage(unattributed=5.0, lines_over=2.0, trips_lines_over=3))

    assert over.startswith("en otros tickets los productos suman 2,00 € más que los tickets")


def test_the_coverage_footer_skips_what_says_nothing():
    assert coverage_clauses(_coverage(trips=0, trips_confirmed=0, lines_total=0)) == []
    # A ticket with a total and no lines: "0 de 0 productos" would say nothing.
    assert coverage_clauses(_coverage(lines_total=0, lines_priced=0))[0].startswith("26 de 26")
