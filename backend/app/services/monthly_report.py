"""The monthly spend report: who gets one, for which month, and exactly once.

A trigger calls run_monthly_reports. It may fire daily, hourly, or twice by
mistake: the report_runs ledger turns every repeat into a no-op. Each list's
month is cut in its owner's timezone, so one trigger can be "the 1st" for one
owner and still the 31st for another. The second one gets theirs on a later
trigger. See ADR-018.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, tzinfo

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.db.models import List, ReportRun, User
from app.services.client_day import parse_timezone
from app.services.feature_flags import is_enabled
from app.services.insights.data import local_month, month_bounds, shift_month
from app.services.insights.engine import SpendReport, compute_report

logger = logging.getLogger(__name__)

FLAG = "monthly_report"
# Cloud Run ends a request after an hour at most, so a run still "running"
# after that has died. It is reported, never retried on its own.
STUCK_AFTER = timedelta(hours=1)


def mailer_ready() -> bool:
    """Can this deployment send email? Not yet: email sending comes next.

    While it cannot, a trigger claims nothing. A month is then sent late,
    once email works, instead of being marked done without a send.
    """
    return False


def deliver(report: SpendReport, lst: List, owner: User) -> None:
    """Send one report to the list's owner."""
    raise NotImplementedError


@dataclass
class RunSummary:
    sent: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    already_done: list[str] = field(default_factory=list)
    stuck: list[str] = field(default_factory=list)


def owner_timezone(owner: User) -> tzinfo:
    return (
        parse_timezone(owner.timezone)
        or parse_timezone(get_settings().report_default_timezone)
        or UTC
    )


def report_period(now: datetime, tz: tzinfo) -> str:
    """The month before the one `now` falls in, seen from `tz`."""
    return shift_month(local_month(now, tz), -1)


def run_monthly_reports(session: Session, now: datetime) -> RunSummary:
    """`now` is an aware UTC instant, like every stored timestamp."""
    summary = RunSummary()
    summary.stuck = _stuck_runs(session, now)
    if not mailer_ready():
        return summary
    rows = session.exec(select(List, User).join(User, col(List.owner_id) == User.id)).all()
    for lst, owner in rows:
        if not is_enabled(owner.id, FLAG, session):
            continue
        tz = owner_timezone(owner)
        period = report_period(now, tz)
        _, period_end = month_bounds(period, tz)
        # A list made after the month ended has nothing to report on.
        if lst.created_at >= period_end:
            continue
        run = _claim(session, lst.id, period, tz, now)
        if run is None:
            summary.already_done.append(lst.id)
            continue
        _run_one(session, run, lst, owner, tz, summary)
    return summary


def _run_one(
    session: Session,
    run: ReportRun,
    lst: List,
    owner: User,
    tz: tzinfo,
    summary: RunSummary,
) -> None:
    try:
        report = compute_report(session, lst.id, run.period, tz)
        deliver(report, lst, owner)
    except Exception as exc:
        # One broken list must not stop the others. The row stays "failed",
        # so the next trigger tries it again.
        logger.exception("Monthly report failed for list %s, %s", lst.id, run.period)
        session.rollback()
        _finish(session, run, "failed", repr(exc))
        summary.failed.append(lst.id)
    else:
        _finish(session, run, "sent", None)
        summary.sent.append(lst.id)


def _claim(
    session: Session, list_id: str, period: str, tz: tzinfo, now: datetime
) -> ReportRun | None:
    """Take this (list, period) for this run, or None if it is not ours.

    A new period inserts its row; a "failed" one is taken back by a
    conditional update. Both are atomic in the database, so of two triggers
    racing for the same row exactly one wins.
    """
    existing = _find(session, list_id, period)
    if existing is None:
        run = ReportRun(
            list_id=list_id, period=period, timezone=str(tz), status="running", started_at=now
        )
        try:
            with session.begin_nested():
                session.add(run)
                session.flush()
        except IntegrityError:
            # Another trigger inserted it between our read and our write.
            return None
        session.commit()
        return run
    if existing.status != "failed":
        return None
    claimed = session.exec(
        update(ReportRun)
        .where(col(ReportRun.id) == existing.id, col(ReportRun.status) == "failed")
        .values(
            status="running",
            attempts=ReportRun.attempts + 1,
            started_at=now,
            error=None,
            finished_at=None,
        )
    )
    session.commit()
    if claimed.rowcount == 0:
        return None
    session.refresh(existing)
    return existing


def _stuck_runs(session: Session, now: datetime) -> list[str]:
    """Runs that died mid-send. They may have sent, so only a person can
    tell; setting the row back to "failed" lets the next trigger retry it."""
    stuck = session.exec(
        select(ReportRun).where(
            ReportRun.status == "running", col(ReportRun.started_at) < now - STUCK_AFTER
        )
    ).all()
    for run in stuck:
        logger.error("Monthly report stuck: run %s (list %s, %s)", run.id, run.list_id, run.period)
    return [run.id for run in stuck]


def _find(session: Session, list_id: str, period: str) -> ReportRun | None:
    return session.exec(
        select(ReportRun).where(ReportRun.list_id == list_id, ReportRun.period == period)
    ).first()


def _finish(session: Session, run: ReportRun, status: str, error: str | None) -> None:
    run.status = status
    run.error = error
    run.finished_at = datetime.now(UTC)
    session.add(run)
    session.commit()
