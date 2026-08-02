"""Per-user board assignment: which paper board a list sits on.

The board is the backdrop a member sees behind a list — orientation, not
identity (redesign rule 20). It is personal: the same shared list can sit on
kraft for Alice and salvia for Bob, and neither ever sees the other's choice.

Assignment is lazy, on the first single-list read: the member gets the first
board in BOARDS order that none of their existing prefs use, so their lists
walk the palette before repeating. Once all boards are taken, assignment
wraps by pref count, which keeps it deterministic without tracking anything.

These helpers stage changes on the session but never commit; the caller owns
the transaction boundary (same contract as default_list).
"""

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from sqlmodel.sql.expression import SelectOfScalar

from app.db.models import UserListPref

BOARDS = ("kraft", "lino", "salvia", "niebla", "barro", "pizarra")


def _pref_lookup(user_id: str, list_id: str) -> SelectOfScalar[UserListPref]:
    return select(UserListPref).where(
        UserListPref.user_id == user_id, UserListPref.list_id == list_id
    )


def get_board(session: Session, user_id: str, list_id: str) -> str | None:
    """The user's board for this list, or None if none was ever assigned.

    Read-only on purpose: callers that only *carry* an existing pref through
    (a rename response, say) must not create one as a side effect.
    """
    pref = session.exec(_pref_lookup(user_id, list_id)).first()
    return pref.board if pref is not None else None


def _insert_guarded(
    session: Session, pref: UserListPref, lookup: SelectOfScalar[UserListPref]
) -> UserListPref:
    """INSERT the pref; on a lost race, hand back the winner's row.

    Two devices opening the same list at the same instant can both miss the
    SELECT and both attempt the INSERT. The real guarantee of one pref per
    (user, list) is the unique constraint, not the caller's lookup; the same
    savepoint pattern as trips.open_trip_for turns the loser's constraint
    violation into a read of the winner's row instead of a failed open.
    """
    try:
        with session.begin_nested():
            session.add(pref)
            # Forces the INSERT now, inside the savepoint, so a unique
            # violation raises here where it is caught rather than at some
            # later autoflush.
            session.flush()
    except IntegrityError:
        # `.first()` rather than `.one()`: IntegrityError covers *any*
        # constraint violation, not only the race. When the re-select finds
        # nothing, re-raising surfaces the unrelated failure as itself.
        winner = session.exec(lookup).first()
        if winner is None:
            raise
        return winner
    return pref


def ensure_board(session: Session, user_id: str, list_id: str) -> str:
    """The user's board for this list, assigned now if this is the first open."""
    lookup = _pref_lookup(user_id, list_id)
    pref = session.exec(lookup).first()
    if pref is not None:
        return pref.board
    mine = session.exec(select(UserListPref.board).where(UserListPref.user_id == user_id)).all()
    used = set(mine)
    board = next((b for b in BOARDS if b not in used), BOARDS[len(mine) % len(BOARDS)])
    return _insert_guarded(
        session, UserListPref(user_id=user_id, list_id=list_id, board=board), lookup
    ).board


def set_board(session: Session, user_id: str, list_id: str, board: str) -> None:
    """Pin the user's board for this list, creating the pref if none exists.

    Trusts `board`: validation is the API layer's job (the request schema's
    Literal), the same split store_key relies on.
    """
    lookup = _pref_lookup(user_id, list_id)
    pref = session.exec(lookup).first()
    if pref is None:
        # Racing the lazy assignment of a concurrent open is possible; the
        # explicit choice wins by overwriting whichever row survived.
        pref = _insert_guarded(
            session, UserListPref(user_id=user_id, list_id=list_id, board=board), lookup
        )
    pref.board = board
    session.add(pref)
