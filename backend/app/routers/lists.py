import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.db.models import (
    List,
    ListInvite,
    ListItem,
    ListMember,
    ListStore,
    Purchase,
    ReceiptScan,
    ReportOptOut,
    ReportRun,
    User,
    UserListPref,
)
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.lists import (
    BoardPrefUpdate,
    ListCreate,
    ListMemberBrief,
    ListRead,
    ListUpdate,
    ReportPref,
)
from app.services import feature_flags, receipt_storage
from app.services.default_list import ensure_default, set_default
from app.services.list_board import ensure_board, get_board, set_board
from app.services.public_name import public_name
from app.services.report_opt_out import is_opted_out, opt_in, opt_out
from app.services.trips import in_cart_predicate, in_scope_predicate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC)
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
        select(List).where(col(List.id).in_(list_ids)).order_by(col(List.updated_at).desc())
    ).all()

    # Single aggregation query — counts for all lists at once.
    # Uses session.execute (SQLAlchemy) rather than session.exec (SQLModel)
    # because it returns named-column Row objects from aggregation queries.
    # Only count items that are in-scope for the current shopping session:
    # unpurchased items, plus items whose trip is still open. Items from
    # closed or torn-off trips are excluded from both the denominator and
    # the numerator so the progress bar reflects only the current trip.
    #
    # `now` is a bound UTC instant, the same convention the trips
    # service compares tears_off_at with. The LEFT JOIN keeps unpurchased
    # items (purchase_id NULL) in item_count; a purchased item with no
    # matching trip row joins NULL, compares as NULL, and counts as closed.
    now = datetime.now(UTC)
    in_cart = in_cart_predicate(now)
    in_scope = in_scope_predicate(now)

    count_stmt = (
        select(
            ListItem.list_id,
            func.count(ListItem.id).filter(in_scope).label("item_count"),
            func.count(ListItem.id).filter(in_cart).label("purchased_count"),
            # purchased_count and cart_count are one rule on purpose: an item
            # counts toward progress exactly while it sits in the open trip.
            func.count(ListItem.id).filter(in_cart).label("cart_count"),
        )
        .outerjoin(Purchase, col(ListItem.purchase_id) == Purchase.id)
        .where(col(ListItem.list_id).in_(list_ids))
        .group_by(ListItem.list_id)
    )
    count_rows = session.exec(count_stmt).all()
    counts = {
        list_id: (item_count, purchased_count, cart_count)
        for list_id, item_count, purchased_count, cart_count in count_rows
    }

    # Member names for all lists in one query. Same display-name fallback as
    # the members endpoint: the email's local part.
    member_rows = session.exec(
        select(ListMember.list_id, ListMember.user_id, User.display_name, User.email)
        .join(User, col(User.id) == ListMember.user_id)
        .where(col(ListMember.list_id).in_(list_ids))
    ).all()
    members_by_list: dict[str, list[ListMemberBrief]] = {}
    for list_id, user_id, display_name, email in member_rows:
        members_by_list.setdefault(list_id, []).append(
            ListMemberBrief(
                user_id=user_id,
                display_name=public_name(display_name, email),
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


@router.get("/{list_id}/prefs/report", response_model=ReportPref)
def get_report_pref(list_and_user: OwnerDep, session: CurrentSession):
    """Whether the monthly report for this list is on. Owner only: the
    report goes to the owner, so nobody else has a setting to see."""
    lst, current_user = list_and_user
    _require_report_flag(current_user.id, session)
    return ReportPref(enabled=not is_opted_out(session, current_user.id, lst.id))


@router.put("/{list_id}/prefs/report", status_code=status.HTTP_204_NO_CONTENT)
def set_report_pref(body: ReportPref, list_and_user: OwnerDep, session: CurrentSession):
    """Turn the monthly report on or off: the same opt-out row the email's
    unsubscribe link writes. Personal, so it does not bump lists.updated_at."""
    lst, current_user = list_and_user
    _require_report_flag(current_user.id, session)
    if body.enabled:
        opt_in(session, current_user.id, lst.id)
    else:
        opt_out(session, current_user.id, lst.id)


def _require_report_flag(user_id: str, session: Session) -> None:
    """Without the flag no report is sent, so there is no setting to show."""
    if not feature_flags.is_enabled(user_id, "monthly_report", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="monthly_report feature not enabled",
        )


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
    for run in session.exec(select(ReportRun).where(ReportRun.list_id == lst.id)).all():
        session.delete(run)
    for row in session.exec(select(ReportOptOut).where(ReportOptOut.list_id == lst.id)).all():
        session.delete(row)
    # The models declare no relationships, so a flush does not order these
    # deletes by foreign key. Each flush below forces one layer out first:
    # items and scans point at trips, and everything points at the list.
    session.flush()
    for trip in session.exec(select(Purchase).where(Purchase.list_id == lst.id)).all():
        session.delete(trip)
    for store in session.exec(select(ListStore).where(ListStore.list_id == lst.id)).all():
        session.delete(store)
    session.flush()
    session.delete(lst)
    session.commit()
    # After the commit and best effort: a storage hiccup must not block list
    # deletion. A failure only leaves orphaned objects, which cost pennies.
    try:
        receipt_storage.delete_list_receipts(list_id)
    except Exception:
        logger.exception("Failed to delete receipt objects for list %s", list_id)
