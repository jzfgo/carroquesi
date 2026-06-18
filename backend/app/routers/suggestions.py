import re
from collections import defaultdict
from datetime import UTC, datetime
from statistics import mean, median
from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.due_suggestions import DueSuggestionRead
from app.schemas.suggestions import SuggestionRead

router = APIRouter(tags=["suggestions"])

_LEADING_NUMBER = re.compile(r"^\+?([0-9]+(?:[.,][0-9]+)?)")


def _parse_quantity_numeric(q: str | None) -> float | None:
    if not q:
        return None
    m = _LEADING_NUMBER.match(q.strip())
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


@router.get("/suggestions", response_model=list[SuggestionRead])
def get_suggestions(
    q: Annotated[str, Query(min_length=1)],
    current_user: CurrentUser,
    session: CurrentSession,
):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

    if not list_ids:
        return []

    escaped_q = q.lower().replace("%", "\\%").replace("_", "\\_")

    subq = (
        select(
            ListItem.name,
            ListItem.brand,
            ListItem.stores,
            func.row_number()
            .over(
                partition_by=func.lower(ListItem.name),
                order_by=ListItem.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            ListItem.list_id.in_(list_ids),
            func.lower(ListItem.name).like(
                f"{escaped_q}%",
                escape="\\",
            ),
        )
        .subquery()
    )

    rows = session.execute(
        select(subq.c.name, subq.c.brand, subq.c.stores)
        .where(subq.c.rn == 1)
        .order_by(subq.c.name.asc())
        .limit(10)
    ).all()

    return [
        SuggestionRead(
            name=r.name,
            brand=r.brand,
            stores=r.stores if r.stores is not None else [],
        )
        for r in rows
    ]


@router.get("/lists/{list_id}/due-suggestions", response_model=list[DueSuggestionRead])
def get_due_suggestions(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    now = datetime.now(UTC).replace(tzinfo=None)

    purchased_items = session.exec(
        select(ListItem).where(
            ListItem.list_id == lst.id,
            ListItem.purchased_at.is_not(None),
        )
    ).all()

    groups: dict[str, list[ListItem]] = defaultdict(list)
    for item in purchased_items:
        groups[item.name.lower()].append(item)

    unpurchased_names = {
        row.lower()
        for row in session.exec(
            select(ListItem.name).where(
                ListItem.list_id == lst.id,
                ListItem.purchased_at.is_(None),
            )
        ).all()
    }

    results = []
    for name_key, items in groups.items():
        if len(items) < 3:
            continue
        if name_key in unpurchased_names:
            continue

        sorted_items = sorted(items, key=lambda i: i.purchased_at)
        timestamps = [i.purchased_at for i in sorted_items]

        gaps = [
            (timestamps[i + 1] - timestamps[i]).total_seconds() / 86400
            for i in range(len(timestamps) - 1)
        ]
        median_interval = median(gaps)
        if median_interval <= 0:
            continue

        last_purchased_at = sorted_items[-1].purchased_at
        days_since_last = (now - last_purchased_at).total_seconds() / 86400
        lower = 0.9 * median_interval
        upper = 1.5 * median_interval

        if not (lower <= days_since_last <= upper):
            continue

        numeric_quantities = [
            v for i in items if (v := _parse_quantity_numeric(i.quantity)) is not None
        ]
        avg_quantity: int | None = None
        if numeric_quantities:
            avg_quantity = round(mean(numeric_quantities))

        most_recent = max(items, key=lambda i: i.purchased_at)
        results.append(
            DueSuggestionRead(
                name=most_recent.name,
                brand=most_recent.brand,
                stores=most_recent.stores if most_recent.stores is not None else [],
                days_overdue=days_since_last - lower,
                dismissal_ttl_days=upper - days_since_last,
                median_interval_days=median_interval,
                days_since_last=days_since_last,
                avg_quantity=avg_quantity,
            )
        )

    results.sort(key=lambda r: r.days_overdue, reverse=True)
    return results[:10]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(list_and_user: MemberDep):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
