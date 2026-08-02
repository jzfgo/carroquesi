import logging
from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.db.models import (
    List,
    ListInvite,
    ListItem,
    ListMember,
    Purchase,
    ReceiptScan,
    User,
    UserListPref,
)
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.lists import BoardPrefUpdate, ListCreate, ListMemberBrief, ListRead, ListUpdate
from app.services import receipt_storage
from app.services.default_list import ensure_default, set_default
from app.services.list_board import ensure_board, get_board, set_board

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


def _read_with_default(
    lst: List, session: Session, user_id: str, board: str | None = None
) -> ListRead:
    """Build a ListRead carrying this user's per-membership is_default flag.

    (item_count/purchased_count/cart_count/members keep their ListRead defaults
    — the single-list endpoints don't recompute the aggregates; only get_lists
    does.)
    """
    membership = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == user_id)
    ).first()
    return ListRead(
        **lst.model_dump(),
        is_default=bool(membership and membership.is_default),
        board=board,
    )


@router.get("", response_model=list[ListRead])
def get_lists(current_user: CurrentUser, session: CurrentSession):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]
    default_list_ids = {m.list_id for m in memberships if m.is_default}

    if not list_ids:
        return []

    lists = session.exec(
        select(List).where(List.id.in_(list_ids)).order_by(List.updated_at.desc())
    ).all()

    # Single aggregation query — counts for all lists at once.
    # Uses session.execute (SQLAlchemy) rather than session.exec (SQLModel)
    # because it returns named-column Row objects from aggregation queries.
    # Only count items that are in-scope for the current shopping session:
    # unpurchased items, plus items whose trip is still open. Items from
    # closed or torn-off trips are excluded from both the denominator and
    # the numerator so the progress bar reflects only the current trip.
    #
    # `now` is a bound naive-UTC instant, the same convention the trips
    # service compares tears_off_at with. The LEFT JOIN keeps unpurchased
    # items (purchase_id NULL) in item_count; a purchased item with no
    # matching trip row joins NULL, compares as NULL, and counts as closed.
    now = datetime.now(UTC).replace(tzinfo=None)
    in_cart = and_(
        ListItem.purchased_at.is_not(None),
        func.coalesce(Purchase.closed_at, Purchase.tears_off_at) > now,
    )
    in_scope = or_(ListItem.purchased_at.is_(None), in_cart)

    count_stmt = (
        select(
            ListItem.list_id,
            func.count(ListItem.id).filter(in_scope).label("item_count"),
            func.count(ListItem.id).filter(in_cart).label("purchased_count"),
            # purchased_count and cart_count are one rule on purpose: an item
            # counts toward progress exactly while it sits in the open trip.
            func.count(ListItem.id).filter(in_cart).label("cart_count"),
        )
        .outerjoin(Purchase, ListItem.purchase_id == Purchase.id)
        .where(ListItem.list_id.in_(list_ids))
        .group_by(ListItem.list_id)
    )
    count_rows = session.execute(count_stmt).all()
    counts = {
        row.list_id: (row.item_count, row.purchased_count, row.cart_count) for row in count_rows
    }

    # Member names for all lists in one query. Same display-name fallback as
    # the members endpoint: the email's local part.
    member_rows = session.execute(
        select(ListMember.list_id, ListMember.user_id, User.display_name, User.email)
        .join(User, User.id == ListMember.user_id)
        .where(ListMember.list_id.in_(list_ids))
    ).all()
    members_by_list: dict[str, list[ListMemberBrief]] = {}
    for row in member_rows:
        members_by_list.setdefault(row.list_id, []).append(
            ListMemberBrief(
                user_id=row.user_id,
                display_name=row.display_name or row.email.split("@")[0],
            )
        )

    return [
        ListRead(
            **lst.model_dump(),
            item_count=counts.get(lst.id, (0, 0, 0))[0],
            purchased_count=counts.get(lst.id, (0, 0, 0))[1],
            cart_count=counts.get(lst.id, (0, 0, 0))[2],
            members=members_by_list.get(lst.id, []),
            is_default=lst.id in default_list_ids,
        )
        for lst in lists
    ]


@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(
    body: ListCreate,
    current_user: CurrentUser,
    session: CurrentSession,
):
    lst = List(name=body.name, emoji=body.emoji, owner_id=current_user.id)
    session.add(lst)
    session.flush()
    member = ListMember(list_id=lst.id, user_id=current_user.id)
    session.add(member)
    # First list a user ever creates or joins becomes their default (for Siri).
    ensure_default(session, member)
    session.commit()
    session.refresh(lst)
    session.refresh(member)
    return ListRead(**lst.model_dump(), is_default=member.is_default)


@router.get("/{list_id}", response_model=ListRead)
def get_list(list_and_user: MemberDep, session: CurrentSession):
    lst, current_user = list_and_user
    # Lazy assignment happens here and only here: opening the list is the
    # first moment the board is seen, so this response always carries one and
    # the screen never flashes a default. The panel listing and create stay
    # unassigned on purpose.
    board = ensure_board(session, current_user.id, lst.id)
    session.commit()
    return _read_with_default(lst, session, current_user.id, board=board)


@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    body: ListUpdate,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    if body.name is not None:
        lst.name = body.name
    if "emoji" in body.model_fields_set:
        lst.emoji = body.emoji
    _bump(lst, session)
    session.commit()
    session.refresh(lst)
    # is_default and board carried through so a rename can't misreport the
    # caller's state. get_board, not ensure_board: an update is not an open,
    # so it must not assign.
    return _read_with_default(
        lst, session, current_user.id, board=get_board(session, current_user.id, lst.id)
    )


@router.put("/{list_id}/default", status_code=status.HTTP_204_NO_CONTENT)
def set_default_list(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    """Mark this list as the caller's default (for Siri), clearing any prior one.

    Per-user membership state — deliberately does NOT bump lists.updated_at, since
    the flag is invisible to co-members and shouldn't trigger their polls.
    """
    lst, current_user = list_and_user
    set_default(session, current_user.id, lst.id)
    session.commit()


@router.put("/{list_id}/prefs/board", status_code=status.HTTP_204_NO_CONTENT)
def set_board_pref(
    body: BoardPrefUpdate,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    """Pick the board this list sits on, for the caller only.

    Personal presentation state — deliberately does NOT bump lists.updated_at,
    the same rule as set_default_list: the board is invisible to co-members
    and must not trigger their polls.
    """
    lst, current_user = list_and_user
    set_board(session, current_user.id, lst.id, body.board)
    session.commit()


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    list_id = lst.id
    for item in session.exec(select(ListItem).where(ListItem.list_id == lst.id)).all():
        session.delete(item)
    for member in session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all():
        session.delete(member)
    for invite in session.exec(select(ListInvite).where(ListInvite.list_id == lst.id)).all():
        session.delete(invite)
    for pref in session.exec(select(UserListPref).where(UserListPref.list_id == lst.id)).all():
        session.delete(pref)
    for scan in session.exec(select(ReceiptScan).where(ReceiptScan.list_id == lst.id)).all():
        session.delete(scan)
    session.delete(lst)
    session.commit()
    # After the commit and best effort: a storage hiccup must not block list
    # deletion. A failure only leaves orphaned objects, which cost pennies.
    try:
        receipt_storage.delete_list_receipts(list_id)
    except Exception:
        logger.exception("Failed to delete receipt objects for list %s", list_id)
