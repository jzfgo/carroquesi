"""Web push delivery for list changes.

Design: docs/superpowers/specs/2026-07-23-push-notifications-design.md
Decision: docs/decisions/010-web-push-via-fcm.md
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from datetime import datetime

from firebase_admin import messaging
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListMember, PushToken, User

logger = logging.getLogger(__name__)

# FCM allows at most 500 tokens in a single multicast.
MULTICAST_BATCH_SIZE = 500

# Total budget for all recipients combined, not per call. N members must not mean
# N sequential round-trips holding a threadpool worker on every item write.
SEND_TIMEOUT_SECONDS = 5.0
MAX_CONCURRENT_SENDS = 8


@dataclass
class Recipient:
    user_id: str
    watermark: datetime
    tokens: list[str] = field(default_factory=list)


def watermark_for(member: ListMember) -> datetime:
    """When this member last looked at the list.

    Falls back to join time so a member who has never opened the list is not
    told about every item that predates them.
    """
    return member.last_seen_at or member.created_at


def recipients_for(session: Session, list_id: str, actor_id: str) -> dict[str, Recipient]:
    """Members of the list, excluding the actor, who have at least one device.

    Excludes by user_id rather than by token so the actor's other devices stay
    quiet about changes they just made themselves.
    """
    rows = session.exec(
        select(ListMember, PushToken)
        .join(PushToken, PushToken.user_id == ListMember.user_id)
        .where(ListMember.list_id == list_id, ListMember.user_id != actor_id)
    ).all()

    recipients: dict[str, Recipient] = {}
    for member, token in rows:
        entry = recipients.setdefault(
            member.user_id,
            Recipient(user_id=member.user_id, watermark=watermark_for(member)),
        )
        entry.tokens.append(token.token)
    return recipients


def unseen_count_for(session: Session, list_id: str, recipient_id: str, watermark: datetime) -> int:
    """Changes made by other people since this recipient last looked.

    Derived from list_items rather than accumulated in a counter, so dropped
    pushes, retries and duplicate sends cannot cause drift. Counts only the two
    events we notify on, so a receipt scan touching many updated_at values does
    not inflate it.
    """
    return session.exec(
        select(func.count())
        .select_from(ListItem)
        .where(
            ListItem.list_id == list_id,
            or_(
                and_(ListItem.created_at > watermark, ListItem.added_by != recipient_id),
                and_(
                    ListItem.purchased_at > watermark,
                    # is_distinct_from, not !=: NULL != 'x' is NULL in SQL, which
                    # would silently drop rows predating the purchased_by column.
                    ListItem.purchased_by.is_distinct_from(recipient_id),
                ),
            ),
        )
    ).one()


def _build_message(
    tokens: list[str], lst: List, actor: User, event: str, item_name: str, count: int
) -> messaging.MulticastMessage:
    """Data-only: an FCM notification block is auto-displayed by the SDK, which
    would bypass our worker and make composed copy impossible. Our worker always
    calls showNotification, satisfying Safari's ban on silent push."""
    return messaging.MulticastMessage(
        tokens=tokens,
        data={
            "list_id": lst.id,
            "list_name": lst.name,
            "actor_name": actor.display_name or "Alguien",
            "event": event,
            "item_name": item_name,
            "unseen_count": str(count),
        },
    )


def _is_dead_token(exc: Exception | None) -> bool:
    if exc is None:
        return False
    unregistered = getattr(messaging, "UnregisteredError", None)
    if isinstance(unregistered, type) and isinstance(exc, unregistered):
        return True
    return "not found" in str(exc).lower() or "not registered" in str(exc).lower()


def notify_list_change(
    session: Session, lst: List, actor: User, event: str, item_name: str
) -> None:
    """Send a push to every member except the actor. Never raises.

    A push failure must never fail a grocery-list write, so everything here is
    wrapped. Called synchronously inside the request handler: Cloud Run runs
    without --min-instances and throttles CPU between requests, so deferred sends
    are non-deterministic in production. The frontend adds items optimistically,
    so this latency is not user-visible.
    """
    try:
        recipients = recipients_for(session, lst.id, actor_id=actor.id)
        if not recipients:
            return

        payloads: list[tuple[list[str], messaging.MulticastMessage]] = []
        for recipient in recipients.values():
            count = unseen_count_for(session, lst.id, recipient.user_id, recipient.watermark)
            for i in range(0, len(recipient.tokens), MULTICAST_BATCH_SIZE):
                batch = recipient.tokens[i : i + MULTICAST_BATCH_SIZE]
                payloads.append((batch, _build_message(batch, lst, actor, event, item_name, count)))

        # Threads do network only. All DB access stays on this thread, because a
        # SQLModel Session is not thread-safe.
        dead: list[str] = []
        # Deliberately not `with ThreadPoolExecutor(...)`: the context manager exits
        # via shutdown(wait=True), which joins every submitted future and would make
        # the timeout below decorative. shutdown(wait=False) lets a hung send finish
        # on its own thread while the request returns inside its budget.
        pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_SENDS)
        try:
            futures = {
                pool.submit(messaging.send_each_for_multicast, msg): batch
                for batch, msg in payloads
            }
            done, pending = wait(futures, timeout=SEND_TIMEOUT_SECONDS)
            for future in pending:
                future.cancel()
                logger.warning("push send timed out for list %s", lst.id)
            for future in done:
                batch = futures[future]
                try:
                    result = future.result()
                except Exception:
                    logger.exception("push send failed for list %s", lst.id)
                    continue
                for token, response in zip(batch, result.responses, strict=False):
                    if not response.success and _is_dead_token(response.exception):
                        dead.append(token)
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        if dead:
            for row in session.exec(select(PushToken).where(PushToken.token.in_(dead))).all():
                session.delete(row)
            session.commit()
    except Exception:
        logger.exception("push notification failed for list %s", lst.id)
