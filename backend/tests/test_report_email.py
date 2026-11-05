from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.db.models import List, ListItem, Purchase, User
from app.services import mailer, monthly_report
from app.services.insights.engine import compute_report
from app.services.insights.schemas import Baseline
from app.services.report_email import baseline_label, build_report_email, eur, month_label, pct
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
