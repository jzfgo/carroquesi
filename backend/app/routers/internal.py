"""Endpoints for machines, not people: scheduled jobs.

Guarded by a shared token rather than a user: Cloud Scheduler and a plain
cron both send one header, and no user account stands behind a job. Kept
out of the OpenAPI schema because no client of the app calls them.
"""

import hmac
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.dependencies import CurrentSession
from app.services.monthly_report import run_monthly_reports

router = APIRouter(prefix="/internal", include_in_schema=False)


class MonthlyReportRun(BaseModel):
    sent: list[str]
    failed: list[str]
    already_done: list[str]
    # Run ids, not list ids: these rows need a person.
    stuck: list[str]


def _require_trigger_token(token: str | None) -> None:
    expected = get_settings().report_trigger_token
    # An unset token turns the endpoint off. A 404 says nothing about it.
    if not expected:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if token is None or not hmac.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@router.post("/reports/monthly")
def trigger_monthly_reports(
    session: CurrentSession,
    x_trigger_token: Annotated[str | None, Header()] = None,
) -> MonthlyReportRun:
    _require_trigger_token(x_trigger_token)
    summary = run_monthly_reports(session, datetime.now(UTC).replace(tzinfo=None))
    return MonthlyReportRun(
        sent=summary.sent,
        failed=summary.failed,
        already_done=summary.already_done,
        stuck=summary.stuck,
    )
