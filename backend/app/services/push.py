"""Web push delivery for list changes.

Design: docs/superpowers/specs/2026-07-23-push-notifications-design.md
Decision: docs/decisions/010-web-push-via-fcm.md
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.db.models import ListItem, ListMember, PushToken

logger = logging.getLogger(__name__)

# FCM allows at most 500 tokens in a single multicast.
MULTICAST_BATCH_SIZE = 500


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
