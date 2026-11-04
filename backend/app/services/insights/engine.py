"""The one entry point: a list's spend report for one month.

Computed live from what the list holds now, so a receipt scanned late
changes last month's report. Reads only.
"""

from datetime import timedelta, tzinfo

from sqlmodel import Session

from app.services.insights.data import count_tripless, load_window, month_bounds, shift_month
from app.services.insights.descriptive import (
    SERIES_MONTHS,
    by_requester,
    by_store,
    cadence,
    top_products,
    totals,
)
from app.services.insights.savings import cheaper_elsewhere
from app.services.insights.schemas import DEFAULT_THRESHOLDS, SavingsThresholds, SpendReport

__all__ = ["SpendReport", "compute_report"]


def compute_report(
    session: Session,
    list_id: str,
    month: str,
    tz: tzinfo,
    th: SavingsThresholds = DEFAULT_THRESHOLDS,
) -> SpendReport:
    """`month` is "YYYY-MM", cut at local midnights in `tz` (the caller
    decides whose zone: the owner's for an email, the viewer's in the app)."""
    month_start, end = month_bounds(month, tz)
    series_start, _ = month_bounds(shift_month(month, -(SERIES_MONTHS - 1)), tz)
    # One load covers both the five-month trend and the savings window.
    start = min(series_start, end - timedelta(days=th.window_days))
    w = load_window(session, list_id, start, end, tz)
    return SpendReport(
        list_id=list_id,
        period=month,
        tz=str(tz),
        insights=[
            totals(w, month),
            by_store(w, month),
            top_products(w, month),
            by_requester(w, month),
            cadence(w, month),
            cheaper_elsewhere(w, month, end, th),
        ],
        tripless_lines=count_tripless(session, list_id, month_start, end),
    )
