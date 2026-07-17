"""Per-user default list management.

A user's "default list" is the target for the Siri Shortcut, which sends the
literal string ``"default"`` as its ``list_id`` because a single static shortcut
can't know a real UUID ahead of time. The default is a **per-user** preference
stored on the membership row (``ListMember.is_default``): a shared list can be
Alice's default without being Bob's.

Invariant: at most one membership per user has ``is_default=True``. It is
enforced here, in-app, inside the caller's transaction — every mutation that
sets a default first clears the user's other defaults. There is no DB-level
partial unique index (a possible future hardening).

These helpers stage changes on the session but never commit; the caller owns the
transaction boundary.
"""

from sqlmodel import Session, select

from app.db.models import List, ListMember


def has_default(session: Session, user_id: str) -> bool:
    """True if the user already has a membership flagged as their default."""
    return (
        session.exec(
            select(ListMember.id).where(
                ListMember.user_id == user_id, ListMember.is_default.is_(True)
            )
        ).first()
        is not None
    )


def ensure_default(session: Session, membership: ListMember) -> None:
    """Auto-assign: if the user has no default yet, make ``membership`` it.

    Called when a user first creates or first joins a list, so a user who only
    ever joins lists still ends up with a default. No-op if they already have one.

    This is the *only* automatic default assignment, and it is unambiguous — the
    user has exactly one (their first) list. There is deliberately no promotion
    when a default list is later deleted or left: repointing "default" at a list
    the user didn't choose is a silent destination change, exactly what this
    feature removes. Losing your default is a state you re-resolve explicitly
    (mark another list, gated at the Siri-setup entry point).
    """
    if not has_default(session, membership.user_id):
        membership.is_default = True
        session.add(membership)


def set_default(session: Session, user_id: str, list_id: str) -> None:
    """Make ``list_id`` the user's default, clearing any prior default.

    Assumes the caller has already verified membership. Clears every other
    default the user holds so the one-default invariant is preserved.
    """
    memberships = session.exec(select(ListMember).where(ListMember.user_id == user_id)).all()
    for m in memberships:
        m.is_default = m.list_id == list_id
        session.add(m)


def resolve_default(session: Session, user_id: str) -> List | None:
    """Resolve the user's default list from their explicitly flagged membership.

    Returns ``None`` when the user has no default set (including when they belong
    to no lists at all). There is deliberately no most-recently-updated fallback:
    "default" is explicit and user-controlled, and a non-deterministic fallback
    is exactly the behavior this feature removes. Auto-assign-on-first-list and
    the one-time migration backfill mean an established user always has one; a
    ``None`` here is a genuine edge case (e.g. the flagged list was just deleted)
    that the caller surfaces as "pick a default first".
    """
    return session.exec(
        select(List)
        .join(ListMember, ListMember.list_id == List.id)
        .where(ListMember.user_id == user_id, ListMember.is_default.is_(True))
    ).first()


def backfill_all_defaults(session: Session) -> int:
    """Assign a default to every user who has memberships but no default yet.

    A one-time backfill for the migration that introduces ``is_default``. It
    pins each existing user's default to their most-recently-updated list —
    which is exactly where the old resolver would have sent "default" just before
    the migration, so nothing moves on day one. This is a migration-time snapshot,
    not a runtime fallback: the ``updated_at`` ordering lives here and nowhere in
    the request path (see ``resolve_default``). The ``id DESC`` tiebreaker keeps
    ties (rows sharing an ``updated_at``) from setting two defaults for one user.

    Idempotent and safe to call against a partially-migrated dataset. Returns the
    number of users assigned.

    Kept as an ORM helper (rather than raw SQL in the migration) so it can be
    exercised directly by the test suite, which builds its schema with
    ``create_all`` and never runs Alembic.
    """
    user_ids = session.exec(select(ListMember.user_id).distinct()).all()
    assigned = 0
    for user_id in user_ids:
        if has_default(session, user_id):
            continue
        lst = session.exec(
            select(List)
            .join(ListMember, ListMember.list_id == List.id)
            .where(ListMember.user_id == user_id)
            .order_by(List.updated_at.desc(), List.id.desc())
        ).first()
        if lst is None:
            continue
        set_default(session, user_id, lst.id)
        assigned += 1
    return assigned
