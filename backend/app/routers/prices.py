from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.db.models import ListItem, PriceCache
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.prices import PriceCreate, PriceHistoryResponse, PriceRecordRead, StoreGroup

router = APIRouter(prefix="/lists/{list_id}/items/{item_id}/prices", tags=["prices"])


def _records_to_response(
    records: list[PriceRecord],
    community_price: float | None,
    community_price_per: str | None,
) -> PriceHistoryResponse:
    groups_map: dict[str | None, list[PriceRecord]] = defaultdict(list)
    for r in records:
        groups_map[r.store].append(r)

    groups = []
    for store, store_records in groups_map.items():
        sorted_records = sorted(store_records, key=lambda r: r.recorded_at, reverse=True)
        groups.append(
            StoreGroup(
                store=store,
                records=[PriceRecordRead.model_validate(r) for r in sorted_records],
            )
        )
    return PriceHistoryResponse(
        groups=groups,
        community_price=community_price,
        community_price_per=community_price_per,
    )


@router.post("", response_model=PriceRecordRead)
def log_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = session.exec(select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    record = PriceRecord(
        list_item_id=item_id,
        ean=item.ean,
        amount=price_in.amount,
        price_per=price_in.price_per,
        store=price_in.store,
        user_id=current_user.id,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return PriceRecordRead.model_validate(record)


@router.get("", response_model=PriceHistoryResponse)
def get_price_history(
    list_id: str,
    item_id: str,
    scope: str = Query(default="this_list", pattern="^(this_list|my_lists|all)$"),
    session: CurrentSession = None,
    current_user: CurrentUser = None,
    _: MemberDep = None,
):
    item = session.exec(select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    ean = item.ean

    # Community price from cache
    community_price, community_price_per = None, None
    if ean:
        cached = session.exec(select(PriceCache).where(PriceCache.ean == ean)).first()
        if cached:
            community_price = cached.amount
            community_price_per = cached.price_per

    # Special logic for grouping price history by name and brand for manually added items
    records = []

    # Helper function to get similar items based on name and brand
    def get_similar_items(item_name: str, item_brand: str, exclude_item_id: str):
        return session.exec(
            select(ListItem).where(
                ListItem.name == item_name,
                ListItem.brand == item_brand,
                ListItem.id != exclude_item_id
            )
        ).all()

    if scope == "this_list":
        # For items with EAN, include any price record for the same EAN inside this list
        if ean:
            records = list(session.exec(
                select(PriceRecord)
                .join(ListItem, PriceRecord.list_item_id == ListItem.id)
                .where(
                    ListItem.list_id == list_id,
                    PriceRecord.ean == ean,
                )
            ).all())
        else:
            # For items without EAN, we want to collect records from similar items
            # Get records for the current item
            item_records = session.exec(
                select(PriceRecord).where(PriceRecord.list_item_id == item_id)
            ).all()

            # Get records for similar items (same name and brand)
            similar_items = get_similar_items(item.name, item.brand, item_id)

            similar_records = []
            for similar_item in similar_items:
                similar_item_records = session.exec(
                    select(PriceRecord).where(PriceRecord.list_item_id == similar_item.id)
                ).all()
                similar_records.extend(similar_item_records)

            records = list(item_records) + list(similar_records)

    elif scope == "my_lists":
        if ean:
            records = list(session.exec(
                select(PriceRecord).where(
                    PriceRecord.ean == ean,
                    PriceRecord.user_id == current_user.id,
                )
            ).all())
        else:
            # For items without EAN in my_lists scope
            # Get records for the current item
            item_records = session.exec(
                select(PriceRecord).where(
                    PriceRecord.list_item_id == item_id,
                    PriceRecord.user_id == current_user.id
                )
            ).all()

            # Get records for similar items
            similar_items = get_similar_items(item.name, item.brand, item_id)

            similar_records = []
            for similar_item in similar_items:
                similar_item_records = session.exec(
                    select(PriceRecord).where(
                        PriceRecord.list_item_id == similar_item.id,
                        PriceRecord.user_id == current_user.id
                    )
                ).all()
                similar_records.extend(similar_item_records)

            records = list(item_records) + list(similar_records)

    else:  # scope == "all"
        if ean:
            records = list(session.exec(
                select(PriceRecord).where(PriceRecord.ean == ean)
            ).all())
        else:
            # For items without EAN in all scope
            # Get records for the current item
            item_records = session.exec(
                select(PriceRecord).where(PriceRecord.list_item_id == item_id)
            ).all()

            # Get records for similar items
            similar_items = get_similar_items(item.name, item.brand, item_id)

            similar_records = []
            for similar_item in similar_items:
                similar_item_records = session.exec(
                    select(PriceRecord).where(PriceRecord.list_item_id == similar_item.id)
                ).all()
                similar_records.extend(similar_item_records)

            records = list(item_records) + list(similar_records)

    return _records_to_response(records, community_price, community_price_per)
