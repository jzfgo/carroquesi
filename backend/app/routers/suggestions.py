from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.suggestions import SuggestionRead

router = APIRouter(tags=["suggestions"])


@router.get("/suggestions", response_model=list[SuggestionRead])
def get_suggestions(
    q: Annotated[str, Query(min_length=1)],
    current_user: CurrentUser,
    session: CurrentSession,
):
    # Find all list IDs the user is currently a member of
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

    if not list_ids:
        return []

    escaped_q = q.lower().replace("%", "\\%").replace("_", "\\_")

    # For each distinct name matching the query, return the most recently added item's hints.
    # Using a subquery with ROW_NUMBER() to pick the latest entry per name.
    subq = (
        select(
            ListItem.name,
            ListItem.brand,
            ListItem.variety,
            ListItem.store,
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
        select(subq.c.name, subq.c.brand, subq.c.variety, subq.c.store)
        .where(subq.c.rn == 1)
        .order_by(subq.c.name.asc())
        .limit(10)
    ).all()

    return [
        SuggestionRead(name=r.name, brand=r.brand, variety=r.variety, store=r.store)
        for r in rows
    ]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(list_and_user: MemberDep):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
