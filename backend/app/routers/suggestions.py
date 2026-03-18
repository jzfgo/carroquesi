from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.db.models import ListItem, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member
from app.schemas.suggestions import SuggestionRead

router = APIRouter(tags=["suggestions"])


@router.get("/suggestions", response_model=list[SuggestionRead])
def get_suggestions(
    q: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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
                partition_by=ListItem.name,
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
        .limit(10)
    ).all()

    return [SuggestionRead(name=r.name, brand=r.brand, variety=r.variety, store=r.store) for r in rows]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(
    list_and_user: tuple = Depends(require_member),
):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
