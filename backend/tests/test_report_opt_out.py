from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.models import List, ReportOptOut, ReportRun, User, UserFeature
from app.db.session import get_session
from app.routers import report_opt_out as router
from app.services import monthly_report
from app.services.monthly_report import run_monthly_reports
from app.services.report_opt_out import (
    is_opted_out,
    make_token,
    opt_out,
    opt_out_url,
    read_token,
)

NOV_2 = datetime(2026, 11, 2, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_token_secret", "test-secret")
    monkeypatch.setattr(get_settings(), "frontend_url", "https://app.example.com")


@pytest.fixture(name="lst")
def list_fixture(session: Session, user: User) -> List:
    lst = List(name="Casa <b>", owner_id=user.id, created_at=datetime(2026, 1, 1, tzinfo=UTC))
    session.add(lst)
    session.commit()
    return lst


@pytest.fixture(name="client")
def client_fixture(session: Session):
    app = FastAPI()
    app.include_router(router.router)

    def _get_session():
        yield session

    app.dependency_overrides[get_session] = _get_session
    with TestClient(app) as client:
        yield client


# --- the token ------------------------------------------------------------


def test_a_token_names_the_user_and_the_list():
    assert read_token(make_token("user-1", "list-1")) == ("user-1", "list-1")


def test_the_url_points_at_the_frontend_domain():
    url = opt_out_url("user-1", "list-1")
    assert url.startswith("https://app.example.com/u/")
    assert read_token(url.removeprefix("https://app.example.com/u/")) == ("user-1", "list-1")


def test_a_tampered_token_is_refused():
    token = make_token("user-1", "list-1")
    other_payload = make_token("user-2", "list-1").split(".")[0]
    forged = f"{other_payload}.{token.split('.')[1]}"
    assert read_token(forged) is None


@pytest.mark.parametrize("token", ["", "abc", "a.b.c", "!!!.???", "YQ.YQ"])
def test_garbage_is_refused(token):
    assert read_token(token) is None


def test_a_token_signed_with_another_secret_is_refused(monkeypatch):
    token = make_token("user-1", "list-1")
    monkeypatch.setattr(get_settings(), "email_token_secret", "rotated")
    assert read_token(token) is None


def test_without_a_secret_no_token_is_made_or_accepted(monkeypatch):
    token = make_token("user-1", "list-1")
    monkeypatch.setattr(get_settings(), "email_token_secret", "")
    assert read_token(token) is None
    with pytest.raises(RuntimeError):
        make_token("user-1", "list-1")


# --- the page -------------------------------------------------------------


def test_opening_the_link_only_asks(client, session, user, lst):
    resp = client.get(f"/u/{make_token(user.id, lst.id)}")

    assert resp.status_code == 200
    assert '<form method="post">' in resp.text
    # The list name is user input, shown on a page.
    assert "Casa &lt;b&gt;" in resp.text
    assert not is_opted_out(session, user.id, lst.id)


def test_posting_opts_out_and_a_second_post_changes_nothing(client, session, user, lst):
    token = make_token(user.id, lst.id)

    first = client.post(f"/u/{token}", data={"List-Unsubscribe": "One-Click"})
    second = client.post(f"/u/{token}")

    assert first.status_code == second.status_code == 200
    assert "Ya no recibirás" in first.text
    rows = session.exec(select(ReportOptOut)).all()
    assert [(r.user_id, r.list_id) for r in rows] == [(user.id, lst.id)]


def test_a_bad_link_is_a_404_and_records_nothing(client, session):
    assert client.get("/u/nope").status_code == 404
    assert client.post("/u/nope").status_code == 404
    assert session.exec(select(ReportOptOut)).all() == []


def test_a_link_for_a_deleted_list_records_nothing(client, session, user):
    resp = client.post(f"/u/{make_token(user.id, 'gone')}")

    assert resp.status_code == 200
    assert session.exec(select(ReportOptOut)).all() == []


# --- the trigger ----------------------------------------------------------


@pytest.fixture(name="sent")
def sent_fixture(monkeypatch) -> list[str]:
    sent: list[str] = []
    monkeypatch.setattr(monthly_report, "mailer_ready", lambda: True)
    monkeypatch.setattr(monthly_report, "deliver", lambda report, lst, owner: sent.append(lst.id))
    return sent


def test_an_opted_out_owner_gets_no_report_and_nothing_is_claimed(session, user, lst, sent):
    session.add(UserFeature(user_id=user.id, feature="monthly_report", granted_by="test"))
    session.commit()
    opt_out(session, user.id, lst.id)

    run_monthly_reports(session, NOV_2)

    assert sent == []
    assert session.exec(select(ReportRun)).all() == []


def test_a_new_owner_is_not_bound_by_the_last_owners_opt_out(session, user, other_user, lst, sent):
    session.add(UserFeature(user_id=other_user.id, feature="monthly_report", granted_by="test"))
    session.commit()
    opt_out(session, user.id, lst.id)
    lst.owner_id = other_user.id
    session.add(lst)
    session.commit()

    run_monthly_reports(session, NOV_2)

    assert sent == [lst.id]


def test_mailer_ready_needs_smtp_and_a_token_secret(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "email_from", "informes@example.com")
    assert monthly_report.mailer_ready() is True
    monkeypatch.setattr(settings, "email_token_secret", "")
    assert monthly_report.mailer_ready() is False
