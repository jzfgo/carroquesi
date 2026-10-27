import re
from collections import defaultdict
from datetime import UTC, datetime
from statistics import mean, median
from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import select

from app.db.models import List, ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep, MemberOrDefaultDep
from app.schemas.due_suggestions import DueSuggestionRead
from app.schemas.lists import ListUpdatedAtRead
from app.schemas.suggestions import ElsewhereMatchRead, SuggestionRead
from app.services.fold import fold_name

router = APIRouter(tags=["suggestions"])

_LEADING_NUMBER = re.compile(r"^\+?([0-9]+(?:[.,][0-9]+)?)$")


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

    # Fold names in Python, newest first, keeping the first spelling of each
    # name. Accent folding defeats a plain SQL LIKE, and SQLite has no
    # unaccent. This reads the user's whole history on every call, which a
    # household's few thousand rows allow. If the bar ever feels slow, store a
    # folded name column and filter on it in SQL.
    prefix = fold_name(q)
    items = session.exec(
        select(ListItem.name, ListItem.brand, ListItem.stores)
        .where(ListItem.list_id.in_(list_ids))
        .order_by(ListItem.created_at.desc())
    ).all()
    latest: dict[str, SuggestionRead] = {}
    for name, brand, stores in items:
        key = fold_name(name)
        if key.startswith(prefix) and key not in latest:
            latest[key] = SuggestionRead(
                name=name,
                brand=brand,
                stores=stores if stores is not None else [],
            )
    return [latest[key] for key in sorted(latest)][:10]


@router.get("/lists/{list_id}/items/elsewhere", response_model=ElsewhereMatchRead | None)
def get_elsewhere_match(
    name: Annotated[str, Query(min_length=1)],
    list_and_user: MemberDep,
    session: CurrentSession,
):
    """Find the searched name on another of the caller's lists.

    Answers the empty-search line ("you have this on <list>") with the single
    most relevant match, or null when the name appears nowhere else.
    """
    lst, current_user = list_and_user

    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    other_list_ids = [m.list_id for m in memberships if m.list_id != lst.id]
    if not other_list_ids:
        return None

    # Fetch every item on the other lists and fold names in Python. Accent
    # folding defeats a plain SQL index, and a household's lists hold tens of
    # items — don't optimise this.
    rows = session.exec(
        select(ListItem, List)
        .join(List, List.id == ListItem.list_id)
        .where(ListItem.list_id.in_(other_list_ids))
    ).all()

    target = fold_name(name)
    matches = [(item, item_list) for item, item_list in rows if fold_name(item.name) == target]
    if not matches:
        return None

    purchased = [m for m in matches if m[0].purchased_at is not None]
    if purchased:
        item, item_list = max(purchased, key=lambda m: m[0].purchased_at)
    else:
        item, item_list = max(matches, key=lambda m: m[0].updated_at)
    return ElsewhereMatchRead(
        list_id=item_list.id,
        list_name=item_list.name,
        last_purchased_at=item.purchased_at,
    )


@router.get("/lists/{list_id}/due-suggestions", response_model=list[DueSuggestionRead])
def get_due_suggestions(
    list_and_user: MemberOrDefaultDep,
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


@router.get("/lists/{list_id}/updated-at", response_model=ListUpdatedAtRead)
def get_updated_at(list_and_user: MemberDep):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at}
