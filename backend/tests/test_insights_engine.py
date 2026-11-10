from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.db.models import List, ListItem, Purchase, User
from app.services.insights.engine import SpendReport, compute_report
from app.services.insights.schemas import Cadence, Totals

MADRID = ZoneInfo("Europe/Madrid")
TYPES = [
    "totals",
    "by_store",
    "top_products",
    "product_moves",
    "by_requester",
    "cadence",
    "cheaper_elsewhere",
]


def _seed(session: Session, user: User) -> List:
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    for day, store, price in [
        (datetime(2026, 8, 10, 10, tzinfo=UTC), "Mercadona", 1.20),
        (datetime(2026, 9, 10, 10, tzinfo=UTC), "Mercadona", 1.20),
        (datetime(2026, 10, 10, 10, tzinfo=UTC), "Mercadona", 1.20),
        (datetime(2026, 10, 20, 10, tzinfo=UTC), "Ahorramas", 1.05),
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
                quantity="12 ud",
                price=price,
                added_by=user.id,
                purchase_id=trip.id,
                purchased_at=day,
            )
        )
        session.commit()
    return lst


def test_a_report_carries_every_insight_and_round_trips(session: Session, user: User):
    lst = _seed(session, user)

    report = compute_report(session, lst.id, "2026-10", MADRID)

    assert [i.type for i in report.insights] == TYPES
    assert SpendReport.model_validate_json(report.model_dump_json()) == report
    (savings,) = [i for i in report.insights if i.type == "cheaper_elsewhere"]
    assert [s.cheaper_store for s in savings.suggestions] == ["Ahorramas"]


def test_an_empty_month_still_yields_a_report(session: Session, user: User):
    lst = _seed(session, user)

    report = compute_report(session, lst.id, "2027-03", MADRID)

    by_type = {i.type: i for i in report.insights}
    totals = by_type["totals"]
    cadence = by_type["cadence"]
    assert isinstance(totals, Totals) and isinstance(cadence, Cadence)
    assert totals.total == 0
    assert totals.vs_previous is None
    assert cadence.mean_days_between is None
    assert by_type["cheaper_elsewhere"].suggestions == []  # ty: ignore[unresolved-attribute]


def test_computing_a_report_writes_nothing(session: Session, user: User):
    lst = _seed(session, user)

    compute_report(session, lst.id, "2026-10", MADRID)

    assert not session.new and not session.dirty and not session.deleted


def test_lines_without_a_trip_are_counted_for_the_report_month_only(session: Session, user: User):
    lst = _seed(session, user)
    for day in (datetime(2026, 8, 5, 10, tzinfo=UTC), datetime(2026, 10, 5, 10, tzinfo=UTC)):
        session.add(
            ListItem(list_id=lst.id, name="Pan", added_by=user.id, purchased_at=day, price=1.0)
        )
    session.commit()

    report = compute_report(session, lst.id, "2026-10", MADRID)

    assert report.coverage.tripless_lines == 1


def test_a_report_carries_its_coverage(session: Session, user: User):
    lst = _seed(session, user)

    report = compute_report(session, lst.id, "2026-10", MADRID)

    c = report.coverage
    assert (c.lines_priced, c.lines_total, c.trips_confirmed, c.trips) == (2, 2, 0, 2)
    # No trip has a confirmed total, so nothing measures the lines.
    assert c.unattributed is None
