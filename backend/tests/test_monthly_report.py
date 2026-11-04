from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.models import List, ReportRun, User, UserFeature
from app.db.session import get_session
from app.routers import internal
from app.services import monthly_report
from app.services.monthly_report import report_period, run_monthly_reports
from tests.insights_factory import MADRID

# 1 Nov 2026, 00:30 in Madrid — still 31 Oct in UTC and in New York.
NOV_1_MADRID = datetime(2026, 10, 31, 23, 30)


@pytest.fixture(name="sent")
def sent_fixture(monkeypatch) -> list[tuple[str, str]]:
    """Turn the mailer on and record each delivery as (list_id, period)."""
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(monthly_report, "mailer_ready", lambda: True)
    monkeypatch.setattr(
        monthly_report, "deliver", lambda report, lst, owner: sent.append((lst.id, report.period))
    )
    return sent


def _list(session: Session, owner: User, *, flag: bool = True, created: datetime | None = None):
    lst = List(name="Casa", owner_id=owner.id, created_at=created or datetime(2026, 1, 1))
    session.add(lst)
    if flag:
        session.add(UserFeature(user_id=owner.id, feature="monthly_report", granted_by="test"))
    session.commit()
    return lst


def _run(session: Session, lst: List) -> ReportRun:
    return session.exec(select(ReportRun).where(ReportRun.list_id == lst.id)).one()


def test_period_is_the_previous_month_in_the_owners_zone():
    assert report_period(NOV_1_MADRID, MADRID) == "2026-10"
    assert report_period(NOV_1_MADRID, ZoneInfo("America/New_York")) == "2026-09"


def test_sends_once_and_a_second_trigger_is_a_no_op(session, user, sent):
    user.timezone = "Europe/Madrid"
    lst = _list(session, user)

    first = run_monthly_reports(session, NOV_1_MADRID)
    second = run_monthly_reports(session, NOV_1_MADRID + timedelta(hours=5))

    assert sent == [(lst.id, "2026-10")]
    assert first.sent == [lst.id]
    assert second.already_done == [lst.id]
    run = _run(session, lst)
    assert (run.status, run.timezone, run.attempts) == ("sent", "Europe/Madrid", 1)
    assert run.finished_at is not None


def test_owner_without_a_zone_uses_the_deployment_default(session, user, sent, monkeypatch):
    monkeypatch.setattr(get_settings(), "report_default_timezone", "Europe/Madrid")
    lst = _list(session, user)

    run_monthly_reports(session, NOV_1_MADRID)

    assert sent == [(lst.id, "2026-10")]


def test_without_a_default_the_zone_is_utc(session, user, sent):
    lst = _list(session, user)

    run_monthly_reports(session, NOV_1_MADRID)

    # Still 31 Oct in UTC: last month is September.
    assert sent == [(lst.id, "2026-09")]


def test_only_owners_with_the_flag_get_a_report(session, user, other_user, sent):
    _list(session, user, flag=False)
    flagged = _list(session, other_user)

    run_monthly_reports(session, NOV_1_MADRID)

    assert [list_id for list_id, _ in sent] == [flagged.id]


def test_a_list_made_after_the_month_has_no_report(session, user, sent):
    user.timezone = "Europe/Madrid"
    _list(session, user, created=datetime(2026, 10, 31, 23, 10))

    run_monthly_reports(session, NOV_1_MADRID)

    assert sent == []


def test_a_failure_is_recorded_and_retried_next_time(session, user, sent, monkeypatch):
    user.timezone = "Europe/Madrid"
    lst = _list(session, user)

    def boom(report, lst, owner):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(monthly_report, "deliver", boom)
    first = run_monthly_reports(session, NOV_1_MADRID)
    run = _run(session, lst)
    assert first.failed == [lst.id]
    assert run.status == "failed"
    assert run.error is not None and "smtp down" in run.error

    monkeypatch.setattr(
        monthly_report, "deliver", lambda report, lst, owner: sent.append((lst.id, report.period))
    )
    second = run_monthly_reports(session, NOV_1_MADRID + timedelta(days=1))

    assert second.sent == [lst.id]
    session.refresh(run)
    assert (run.status, run.attempts, run.error) == ("sent", 2, None)


def test_one_failing_list_does_not_stop_the_others(session, user, other_user, sent, monkeypatch):
    bad = _list(session, user)
    good = _list(session, other_user)

    def deliver(report, lst, owner):
        if lst.id == bad.id:
            raise RuntimeError("bad address")
        sent.append((lst.id, report.period))

    monkeypatch.setattr(monthly_report, "deliver", deliver)
    summary = run_monthly_reports(session, NOV_1_MADRID)

    assert summary.failed == [bad.id]
    assert summary.sent == [good.id]


def test_a_running_row_is_never_sent_again_and_is_reported_once_stale(session, user, sent):
    user.timezone = "Europe/Madrid"
    lst = _list(session, user)
    session.add(
        ReportRun(
            list_id=lst.id,
            period="2026-10",
            timezone="Europe/Madrid",
            status="running",
            started_at=NOV_1_MADRID - timedelta(minutes=10),
        )
    )
    session.commit()

    fresh = run_monthly_reports(session, NOV_1_MADRID)
    stale = run_monthly_reports(session, NOV_1_MADRID + timedelta(hours=2))

    assert sent == []
    assert fresh.already_done == [lst.id] and fresh.stuck == []
    assert stale.stuck == [_run(session, lst).id]


def test_without_a_mailer_nothing_is_claimed(session, user):
    _list(session, user)

    summary = run_monthly_reports(session, NOV_1_MADRID)

    assert summary.sent == [] and summary.already_done == []
    assert session.exec(select(ReportRun)).all() == []


# --- the endpoint ---------------------------------------------------------


@pytest.fixture(name="trigger")
def trigger_fixture(session: Session):
    app = FastAPI()
    app.include_router(internal.router)

    def _get_session():
        yield session

    app.dependency_overrides[get_session] = _get_session
    with TestClient(app) as client:
        yield client


def test_endpoint_is_off_without_a_configured_token(trigger, monkeypatch):
    monkeypatch.setattr(get_settings(), "report_trigger_token", "")
    resp = trigger.post("/internal/reports/monthly", headers={"X-Trigger-Token": ""})
    assert resp.status_code == 404


def test_endpoint_rejects_a_wrong_or_missing_token(trigger, monkeypatch):
    monkeypatch.setattr(get_settings(), "report_trigger_token", "s3cret")
    assert trigger.post("/internal/reports/monthly").status_code == 401
    wrong = trigger.post("/internal/reports/monthly", headers={"X-Trigger-Token": "nope"})
    assert wrong.status_code == 401


def test_endpoint_runs_with_the_right_token(trigger, session, user, sent, monkeypatch):
    monkeypatch.setattr(get_settings(), "report_trigger_token", "s3cret")
    lst = _list(session, user)

    resp = trigger.post("/internal/reports/monthly", headers={"X-Trigger-Token": "s3cret"})

    assert resp.status_code == 200
    assert resp.json() == {"sent": [lst.id], "failed": [], "already_done": [], "stuck": []}
