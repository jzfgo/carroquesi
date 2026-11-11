from datetime import datetime

from sqlmodel import Session, select

from app.chains.registry import GENERIC, profile_for
from app.db.models import ChainArticleMapping
from app.services.store_key import store_key


def remember_article(
    session: Session,
    *,
    list_id: str,
    store: str | None,
    article: str,
    item_name: str,
    item_brand: str | None,
    user_id: str,
    now: datetime,
) -> None:
    """Remember which product a label's article code was, for this list.

    The chain comes from the save's store: the label was decoded with that
    store as its hint. A store no chain claims has no article codes, so
    nothing is written. The caller commits.
    """
    if store is None:
        return
    profile = profile_for(store)
    if profile is GENERIC:
        return
    chain = store_key(profile.name)
    # The session autoflushes before this query, so a second line with the
    # same article in one save finds the row the first line added.
    row = session.exec(
        select(ChainArticleMapping).where(
            ChainArticleMapping.list_id == list_id,
            ChainArticleMapping.chain == chain,
            ChainArticleMapping.article == article,
        )
    ).first()
    if row is None:
        row = ChainArticleMapping(
            list_id=list_id,
            chain=chain,
            article=article,
            item_name=item_name,
            item_brand=item_brand,
            confirmed_by=user_id,
            created_at=now,
            updated_at=now,
        )
    else:
        row.item_name = item_name
        row.item_brand = item_brand
        row.confirmed_by = user_id
        row.use_count += 1
        row.updated_at = now
    session.add(row)
