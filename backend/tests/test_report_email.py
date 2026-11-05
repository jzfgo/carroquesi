from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.db.models import List, ListItem, Purchase, User
from app.services import mailer, monthly_report
from app.services.insights.engine import compute_report
from app.services.insights.schemas import Baseline, Coverage
from app.services.report_email import (
    baseline_label,
    build_report_email,
    coverage_clauses,
    eur,
    month_label,
    pct,
)
from app.services.report_opt_out import read_token

MADRID = ZoneInfo("Europe/Madrid")


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_token_secret", "test-secret")
    monkeypatch.setattr(get_settings(), "frontend_url", "https://app.example.com")


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


def test_formats():
    assert eur(1234.5) == "1.234,50 €"
    assert eur(0.8) == "0,80 €"
    assert pct(0.65) == "+65 %"
    assert pct(-0.2) == "−20 %"
    assert month_label("2026-10") == "octubre de 2026"


def test_the_email_carries_the_month_and_a_working_unsubscribe(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-10", MADRID)

    email = build_report_email(report, lst, user)

    assert email.to == user.email
    assert email.subject == "🏠 Casa & <cía>: tu gasto de octubre de 2026"
    assert "1.234,50 €" in email.text and "1.234,50 €" in email.html
    assert "Mercadona" in email.text
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
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    for day, total in [
        (datetime(2025, 10, 10, 10, tzinfo=UTC), 100.0),
        (datetime(2026, 8, 10, 10, tzinfo=UTC), 100.0),
        (datetime(2026, 9, 10, 10, tzinfo=UTC), 100.0),
        (datetime(2026, 10, 10, 10, tzinfo=UTC), 150.0),
    ]:
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

    email = build_report_email(compute_report(session, lst.id, "2026-10", MADRID), lst, user)

    assert "+50 % frente a tu media de 3 meses." in email.text
    assert "+50 % frente a octubre de 2025." in email.text
    assert "frente a octubre de 2025." in email.html


@pytest.mark.parametrize(
    ("months", "label"),
    [
        (["2026-09"], "septiembre de 2026"),
        (["2026-05", "2026-06", "2026-07"], "tu media de mayo a julio de 2026"),
        (["2025-11", "2025-12", "2026-01"], "tu media de noviembre de 2025 a enero de 2026"),
        # A gap: a range would claim June, so only the count is given.
        (["2026-05", "2026-07"], "tu media de 2 meses"),
    ],
)
def test_the_baseline_is_named_by_its_months(months: list[str], label: str):
    assert baseline_label(Baseline(months=months, mean=10.0)) == label


def test_a_baseline_another_line_already_states_is_not_repeated(session: Session, user: User):
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    for day, total in [
        (datetime(2026, 9, 10, 10, tzinfo=UTC), 100.0),
        (datetime(2026, 10, 10, 10, tzinfo=UTC), 150.0),
    ]:
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

    email = build_report_email(compute_report(session, lst.id, "2026-10", MADRID), lst, user)

    assert "+50 % frente al mes anterior." in email.text
    assert "septiembre de 2026" not in email.text


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


def test_the_coverage_footer_names_the_unattributed_spend():
    assert coverage_clauses(_coverage()) == [
        "199 de 202 productos con precio",
        "26 de 26 tickets con total confirmado",
        "0,03 € del total sin asignar a un producto",
    ]


def test_the_coverage_footer_says_zero_when_every_ticket_matches():
    (*_, last) = coverage_clauses(_coverage(unattributed=0.0))

    assert last == "0,00 € del total sin asignar a un producto"


def test_the_coverage_footer_explains_lines_that_exceed_the_ticket():
    clauses = coverage_clauses(
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
    (*_, last) = coverage_clauses(_coverage(unattributed=0.0, lines_over=1.0, trips_lines_over=2))

    assert last.endswith(
        "más que los tickets, seguramente por descuentos que los tickets no detallan"
    )


def test_the_coverage_footer_shows_both_gaps_when_tickets_differ():
    # One ticket falls short, another runs over: a net figure would read 0 €.
    (*_, short, over) = coverage_clauses(
        _coverage(unattributed=5.0, lines_over=5.0, trips_lines_over=1)
    )

    assert short == "5,00 € del total sin asignar a un producto"
    assert over == (
        "en otro ticket los productos suman 5,00 € más que el ticket, "
        "seguramente por descuentos que el ticket no detalla"
    )


def test_the_coverage_footer_says_other_tickets_in_the_plural():
    (*_, over) = coverage_clauses(_coverage(unattributed=5.0, lines_over=2.0, trips_lines_over=3))

    assert over.startswith("en otros tickets los productos suman 2,00 € más que los tickets")


def test_the_coverage_footer_skips_what_says_nothing():
    assert coverage_clauses(_coverage(trips=0, trips_confirmed=0, lines_total=0)) == []
    # A ticket with a total and no lines: "0 de 0 productos" would say nothing.
    assert coverage_clauses(_coverage(lines_total=0, lines_priced=0))[0].startswith("26 de 26")


def test_the_email_prints_the_coverage_footer(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-10", MADRID)

    email = build_report_email(report, lst, user)

    # No confirmed total: the footer cannot say how much is unattributed,
    # so it says nothing rather than "0,00 €".
    assert "1 de 1 producto con precio · 0 de 1 ticket con total confirmado." in email.html
    assert (
        "1 de 1 producto con precio. 0 de 1 ticket con total confirmado.\n\nRecibes"
    ) in email.text
    assert "sin asignar" not in email.text and "sin asignar" not in email.html


def test_a_month_without_purchases_has_no_coverage_footer(session: Session, user: User):
    lst = _seed(session, user)
    report = compute_report(session, lst.id, "2026-11", MADRID)

    email = build_report_email(report, lst, user)

    assert "con precio" not in email.text and "con precio" not in email.html
