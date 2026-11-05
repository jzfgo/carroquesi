from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.db.models import List, ListItem, Purchase, User
from app.services import mailer, monthly_report
from app.services.insights.engine import compute_report
from app.services.report_email import build_report_email, eur, month_label, pct
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
