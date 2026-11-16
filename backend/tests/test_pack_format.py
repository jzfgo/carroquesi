"""A line's pack format: written by hand on the item, carried by re-buy,
and the EAN it invalidates."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import BarcodeCache, ListItem, Purchase
from app.db.models import List as ShoppingList

SIX_BY_ONE_AND_A_HALF = {"count": 6, "content": 1.5, "unit": "l"}


def _list(client: TestClient) -> dict:
    return client.post("/lists", json={"name": "Compra"}).json()


def _item(client: TestClient, list_id: str, **body) -> dict:
    return client.post(f"/lists/{list_id}/items", json={"name": "Agua", **body}).json()


def _patch(client: TestClient, list_id: str, item_id: str, body: dict):
    return client.patch(f"/lists/{list_id}/items/{item_id}", json=body)


def test_a_new_item_has_no_format(client: TestClient):
    lst = _list(client)
    assert _item(client, lst["id"])["pack"] is None


def test_setting_a_format_reads_it_back(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])

    response = _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    assert response.status_code == 200
    assert response.json()["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_count_only_pack_has_no_content(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Papel higiénico")

    response = _patch(client, lst["id"], item["id"], {"pack": {"count": 12}})

    assert response.json()["pack"] == {"count": 12, "content": None, "unit": None}


def test_null_removes_the_format(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    response = _patch(client, lst["id"], item["id"], {"pack": None})

    assert response.json()["pack"] is None


@pytest.mark.parametrize(
    "pack",
    [
        {"count": 1},  # says nothing: send null instead
        {"count": 0},
        {"count": 6, "content": 1.5},  # a figure with no unit
        {"count": 6, "unit": "l"},
        {"count": 1, "content": 0, "unit": "l"},
        {"count": 1, "content": 1e-300, "unit": "g"},  # would price at infinity
        {"count": 1, "content": 1e9, "unit": "l"},
        {"count": 100_000},
        {"count": 1, "content": 1.5, "unit": "litros"},  # the client maps spellings
    ],
)
def test_an_invalid_format_is_refused(client: TestClient, pack: dict):
    lst = _list(client)
    item = _item(client, lst["id"])

    assert _patch(client, lst["id"], item["id"], {"pack": pack}).status_code == 422


def test_changing_the_format_clears_the_ean(client: TestClient):
    """That EAN named the old format; keeping it would teach the barcode the
    wrong size."""
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011111")

    response = _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    assert response.json()["ean"] is None


def test_a_scan_in_the_same_request_sets_the_new_ean(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011111")

    response = _patch(
        client,
        lst["id"],
        item["id"],
        {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"},
    )

    assert response.json()["ean"] == "8410188011128"


def test_an_ean_that_is_not_8_or_13_digits_is_refused(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])

    assert _patch(client, lst["id"], item["id"], {"ean": "12345"}).status_code == 422
    # Digits from another script are not a barcode.
    assert _patch(client, lst["id"], item["id"], {"ean": "٨٤١٠١٨٨٠"}).status_code == 422


def test_resending_the_same_format_keeps_the_ean(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"})

    response = _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    assert response.json()["ean"] == "8410188011128"


def test_a_format_correction_does_not_reopen_the_unpurchase_grace(
    client: TestClient, session: Session
):
    """Correcting the format of a closed purchase is not a write to the
    purchase, so it must not make the record un-purchasable again."""
    from app.routers.items import UNPURCHASE_GRACE

    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"purchased": True})
    db_item = session.get_one(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get_one(Purchase, db_item.purchase_id)
    now = datetime.now(UTC)
    trip.closed_at = now - timedelta(hours=1)
    db_item.updated_at = now - UNPURCHASE_GRACE - timedelta(minutes=1)
    session.add_all([trip, db_item])
    session.commit()

    assert _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF}).status_code == 200
    response = _patch(client, lst["id"], item["id"], {"purchased": False})

    assert response.status_code == 409


def test_rebuy_keeps_the_format(client: TestClient, session: Session):
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011128")
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"})
    _patch(client, lst["id"], item["id"], {"purchased": True})
    db_item = session.get_one(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get_one(Purchase, db_item.purchase_id)
    trip.closed_at = datetime.now(UTC) - timedelta(minutes=1)
    session.add(trip)
    session.commit()

    response = client.post(f"/lists/{lst['id']}/purchases/{trip.id}/items/{item['id']}/rebuy")

    assert response.status_code == 201
    assert response.json()["pack"] == SIX_BY_ONE_AND_A_HALF
    assert response.json()["ean"] == "8410188011128"
    assert session.get_one(ListItem, response.json()["id"]).pack_source == "copied"

    # The format was typed on the bought line, not on this one, so a name
    # typed here still replaces it.
    again = response.json()
    renamed = _patch(client, lst["id"], again["id"], {"name": "Agua 6x1L"}).json()
    assert renamed["name"] == "Agua"
    assert renamed["pack"] == {"count": 6, "content": 1, "unit": "l"}


def test_a_scanned_ean_brings_the_format_its_last_line_carried(client: TestClient):
    """The EAN names the format: adding by a known code gets that format."""
    lst = _list(client)
    first = _item(client, lst["id"], ean="8410188011128")
    _patch(client, lst["id"], first["id"], {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"})
    _patch(client, lst["id"], first["id"], {"purchased": True})

    again = _item(client, lst["id"], ean="8410188011128")

    assert again["pack"] == SIX_BY_ONE_AND_A_HALF


def _bought_line(session: Session, list_id: str, ean: str, minutes_ago: int, **pack) -> None:
    """A bought line written straight to the table, so the test sets its
    age and can leave its format empty while it keeps its EAN."""
    owner = session.get_one(ShoppingList, list_id).owner_id
    stamp = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    session.add(
        ListItem(
            list_id=list_id,
            added_by=owner,
            name="Agua",
            ean=ean,
            purchased_at=stamp,
            updated_at=stamp,
            **pack,
        )
    )
    session.commit()


def test_the_ean_brings_the_format_of_the_newest_line(client: TestClient, session: Session):
    lst = _list(client)
    _bought_line(
        session, lst["id"], "8410188011128", 60, pack_count=6, pack_content=1, pack_content_unit="l"
    )
    _bought_line(
        session,
        lst["id"],
        "8410188011128",
        5,
        pack_count=6,
        pack_content=1.5,
        pack_content_unit="l",
    )

    again = _item(client, lst["id"], ean="8410188011128")

    assert again["pack"]["content"] == 1.5


def test_a_line_with_the_ean_and_no_format_does_not_hide_an_older_one(
    client: TestClient, session: Session
):
    lst = _list(client)
    _bought_line(session, lst["id"], "8410188011128", 60, pack_count=12)
    _bought_line(session, lst["id"], "8410188011128", 5)

    again = _item(client, lst["id"], ean="8410188011128")

    # A pack of pieces has a count and no content; it still counts as a format.
    assert again["pack"] == {"count": 12, "content": None, "unit": None}


def test_a_count_of_one_alone_does_not_hide_an_older_format(client: TestClient, session: Session):
    """One piece with no content is no format, so it must not stand in
    front of an older line that has one."""
    lst = _list(client)
    _bought_line(session, lst["id"], "8410188011128", 60, pack_count=12)
    _bought_line(session, lst["id"], "8410188011128", 5, pack_count=1)

    again = _item(client, lst["id"], ean="8410188011128")

    assert again["pack"] == {"count": 12, "content": None, "unit": None}


def test_a_line_with_another_ean_brings_no_format(client: TestClient, session: Session):
    lst = _list(client)
    _bought_line(
        session,
        lst["id"],
        "8410188011111",
        5,
        pack_count=6,
        pack_content=1.5,
        pack_content_unit="l",
    )

    assert _item(client, lst["id"], ean="8410188011128")["pack"] is None


def test_an_ean_from_another_list_brings_no_format(client: TestClient):
    mine = _list(client)
    other = _list(client)
    line = _item(client, other["id"], ean="8410188011128")
    _patch(client, other["id"], line["id"], {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"})

    assert _item(client, mine["id"], ean="8410188011128")["pack"] is None


def _cache(session: Session, quantity: str | None, ean: str = "8410188011128") -> None:
    session.add(BarcodeCache(ean=ean, name="Agua", quantity=quantity))
    session.commit()


@pytest.mark.parametrize(
    ("quantity", "pack"),
    [
        ("6 x 1,5 l", SIX_BY_ONE_AND_A_HALF),
        ("500 g ℮", {"count": 1, "content": 500, "unit": "g"}),
    ],
)
def test_a_scanned_ean_brings_the_size_open_food_facts_gives(
    client: TestClient, session: Session, quantity: str, pack: dict
):
    _cache(session, quantity)
    lst = _list(client)

    item = _item(client, lst["id"], ean="8410188011128")

    assert item["pack"] == pack
    assert session.get_one(ListItem, item["id"]).pack_source == "off"


@pytest.mark.parametrize("quantity", [None, "1 pack", "500 g (2 x 250 g)"])
def test_a_size_open_food_facts_does_not_give_plainly_brings_no_format(
    client: TestClient, session: Session, quantity: str | None
):
    _cache(session, quantity)
    lst = _list(client)
    assert _item(client, lst["id"], ean="8410188011128")["pack"] is None


def test_the_lists_own_line_wins_over_open_food_facts(client: TestClient, session: Session):
    _cache(session, "1 l")
    lst = _list(client)
    first = _item(client, lst["id"], ean="8410188011128")
    _patch(client, lst["id"], first["id"], {"pack": SIX_BY_ONE_AND_A_HALF, "ean": "8410188011128"})
    _patch(client, lst["id"], first["id"], {"purchased": True})

    again = _item(client, lst["id"], ean="8410188011128")

    assert again["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, again["id"]).pack_source == "copied"


def _bought_with_format(client: TestClient, list_id: str, pack: dict) -> None:
    """A bought line whose format was typed by hand, under the scanned EAN."""
    first = _item(client, list_id, ean="8410188011128")
    _patch(client, list_id, first["id"], {"pack": pack, "ean": "8410188011128"})
    _patch(client, list_id, first["id"], {"purchased": True})


def test_a_format_in_the_name_wins_over_the_one_the_ean_brings(
    client: TestClient, session: Session
):
    lst = _list(client)
    _bought_with_format(client, lst["id"], {"count": 6, "content": 1, "unit": "l"})

    item = _item(client, lst["id"], name="Agua 6x1,5L", ean="8410188011128")

    assert item["name"] == "Agua"
    assert item["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "name"


def test_a_name_typed_later_replaces_the_format_the_ean_brought(client: TestClient):
    lst = _list(client)
    _bought_with_format(client, lst["id"], {"count": 6, "content": 1, "unit": "l"})
    item = _item(client, lst["id"], ean="8410188011128")

    renamed = _patch(client, lst["id"], item["id"], {"name": "Agua 6x1,5L"}).json()

    assert renamed["name"] == "Agua"
    assert renamed["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_format_in_the_name_wins_over_open_food_facts(client: TestClient, session: Session):
    _cache(session, "1 l")
    lst = _list(client)

    item = _item(client, lst["id"], name="Agua 6x1,5L", ean="8410188011128")

    assert item["name"] == "Agua"
    assert item["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "name"


def test_a_name_typed_later_replaces_the_open_food_facts_size(client: TestClient, session: Session):
    _cache(session, "1 l")
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011128")

    renamed = _patch(client, lst["id"], item["id"], {"name": "Agua 6x1,5L"}).json()

    assert renamed["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_format_in_the_name_moves_to_the_format(client: TestClient, session: Session):
    lst = _list(client)
    item = _item(client, lst["id"], name="Agua mineral 6x1,5L")
    assert item["name"] == "Agua mineral"
    assert item["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "name"


def test_a_format_in_the_name_counts_for_the_duplicate_check(client: TestClient):
    lst = _list(client)
    _item(client, lst["id"], name="Agua mineral")
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Agua mineral 6x1,5L"})
    assert response.status_code == 409


def test_renaming_reads_the_format_of_the_new_name(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Agua mineral 1,5L")
    renamed = _patch(client, lst["id"], item["id"], {"name": "Agua mineral 6x1,5L"}).json()
    assert renamed["name"] == "Agua mineral"
    assert renamed["pack"] == SIX_BY_ONE_AND_A_HALF


def test_renaming_never_replaces_a_format_typed_by_hand(client: TestClient, session: Session):
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})
    renamed = _patch(client, lst["id"], item["id"], {"name": "Agua 500ml"}).json()
    assert renamed["name"] == "Agua 500ml"
    assert renamed["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "manual"


def test_a_name_and_a_format_in_one_request_keep_the_typed_format(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])
    body = {"name": "Agua 500ml", "pack": SIX_BY_ONE_AND_A_HALF}
    renamed = _patch(client, lst["id"], item["id"], body).json()
    assert renamed["name"] == "Agua 500ml"
    assert renamed["pack"] == SIX_BY_ONE_AND_A_HALF
