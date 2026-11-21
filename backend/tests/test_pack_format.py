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


def test_a_format_sent_with_a_new_item_is_typed(client: TestClient, session: Session):
    lst = _list(client)

    item = _item(client, lst["id"], name="Agua mineral", pack=SIX_BY_ONE_AND_A_HALF)

    assert item["name"] == "Agua mineral"
    assert item["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "manual"


def test_a_typed_format_beats_the_one_in_the_name(client: TestClient):
    """The name keeps its text: the format it carries is not this line's."""
    lst = _list(client)

    item = _item(client, lst["id"], name="Agua 6x1L", pack=SIX_BY_ONE_AND_A_HALF)

    assert item["name"] == "Agua 6x1L"
    assert item["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_typed_format_beats_the_one_its_ean_brings(client: TestClient, session: Session):
    lst = _list(client)
    _bought_line(session, lst["id"], "8410188011128", 5, pack_count=12)
    session.add(BarcodeCache(ean="8410188011128", name="Agua", quantity="5 l"))
    session.commit()

    item = _item(client, lst["id"], ean="8410188011128", pack=SIX_BY_ONE_AND_A_HALF)

    assert item["pack"] == SIX_BY_ONE_AND_A_HALF
    assert session.get_one(ListItem, item["id"]).pack_source == "manual"


def test_an_invalid_format_on_a_new_item_is_refused(client: TestClient):
    lst = _list(client)

    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Agua", "pack": {"count": 1}})

    assert response.status_code == 422


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


def test_a_code_added_later_brings_the_size_open_food_facts_gives(
    client: TestClient, session: Session
):
    _cache(session, "6 x 1,5 l")
    lst = _list(client)
    item = _item(client, lst["id"])

    scanned = _patch(client, lst["id"], item["id"], {"ean": "8410188011128"}).json()

    assert scanned["pack"] == SIX_BY_ONE_AND_A_HALF
    assert scanned["pack_source"] == "off"


def test_a_code_added_later_never_replaces_a_format(client: TestClient, session: Session):
    _cache(session, "1 l")
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    scanned = _patch(client, lst["id"], item["id"], {"ean": "8410188011128"}).json()

    assert scanned["pack"] == SIX_BY_ONE_AND_A_HALF
    assert scanned["pack_source"] == "manual"


def test_a_code_added_later_brings_the_format_of_the_lists_own_line(
    client: TestClient, session: Session
):
    _cache(session, "1 l")
    lst = _list(client)
    _bought_line(
        session,
        lst["id"],
        "8410188011128",
        5,
        pack_count=6,
        pack_content=1.5,
        pack_content_unit="l",
    )
    item = _item(client, lst["id"])

    scanned = _patch(client, lst["id"], item["id"], {"ean": "8410188011128"}).json()

    assert scanned["pack"] == SIX_BY_ONE_AND_A_HALF
    assert scanned["pack_source"] == "copied"


def test_a_code_added_later_brings_no_format_to_a_weighed_line(
    client: TestClient, session: Session
):
    _cache(session, "1 kg")
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera", price=8.82, price_per="KILOGRAM")

    scanned = _patch(client, lst["id"], item["id"], {"ean": "8410188011128"}).json()

    assert scanned["pack"] is None


OTHER_EAN = "8480000118325"


def test_a_new_code_replaces_the_format_the_old_code_guessed(client: TestClient, session: Session):
    _cache(session, "6 x 1,5 l")
    _cache(session, "5 l", ean=OTHER_EAN)
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"ean": "8410188011128"})

    rescanned = _patch(client, lst["id"], item["id"], {"ean": OTHER_EAN}).json()

    assert rescanned["pack"] == {"count": 1, "content": 5, "unit": "l"}
    assert rescanned["pack_source"] == "off"


def test_a_new_code_with_no_size_keeps_the_old_guess(client: TestClient, session: Session):
    _cache(session, "6 x 1,5 l")
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"ean": "8410188011128"})

    rescanned = _patch(client, lst["id"], item["id"], {"ean": OTHER_EAN}).json()

    assert rescanned["pack"] == SIX_BY_ONE_AND_A_HALF
    assert rescanned["pack_source"] == "off"


def test_a_new_code_never_replaces_the_format_in_the_name(client: TestClient, session: Session):
    _cache(session, "5 l", ean=OTHER_EAN)
    lst = _list(client)
    item = _item(client, lst["id"], name="Agua 6x1,5L")

    rescanned = _patch(client, lst["id"], item["id"], {"ean": OTHER_EAN}).json()

    assert rescanned["pack"] == SIX_BY_ONE_AND_A_HALF
    assert rescanned["pack_source"] == "name"


def test_resending_the_same_code_reads_no_size(client: TestClient, session: Session):
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011128")
    _cache(session, "1 l")

    again = _patch(client, lst["id"], item["id"], {"ean": "8410188011128"}).json()

    assert again["pack"] is None


def test_a_catalogue_format_taken_from_a_suggestion_keeps_its_source(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], ean="8410188011128")
    _patch(client, lst["id"], item["id"], {"pack": {"count": 1, "content": 1, "unit": "l"}})

    body = {"pack": SIX_BY_ONE_AND_A_HALF, "pack_source": "off", "ean": "8410188011128"}
    taken = _patch(client, lst["id"], item["id"], body).json()

    assert taken["pack"] == SIX_BY_ONE_AND_A_HALF
    assert taken["pack_source"] == "off"
    assert taken["ean"] == "8410188011128"


def test_taking_a_catalogue_format_wins_over_the_lists_own_line(
    client: TestClient, session: Session
):
    """Sending the code back with the format taken is no new code, so the
    list's own line must not copy its format over the one just taken."""
    lst = _list(client)
    _bought_line(
        session, lst["id"], "8410188011128", 5, pack_count=1, pack_content=1, pack_content_unit="l"
    )
    item = _item(client, lst["id"], name="Agua mineral")
    _patch(client, lst["id"], item["id"], {"ean": "8410188011128"})

    body = {"pack": SIX_BY_ONE_AND_A_HALF, "pack_source": "off", "ean": "8410188011128"}
    taken = _patch(client, lst["id"], item["id"], body).json()

    assert taken["pack"] == SIX_BY_ONE_AND_A_HALF
    assert taken["pack_source"] == "off"
    assert taken["ean"] == "8410188011128"


def test_a_source_without_a_format_changes_nothing(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    after = _patch(client, lst["id"], item["id"], {"pack_source": "off"}).json()

    assert after["pack_source"] == "manual"


def test_a_source_never_relabels_the_format_it_comes_with(client: TestClient):
    """Resending the format already there with a guess's source would let a
    later rename replace a format someone typed."""
    lst = _list(client)
    item = _item(client, lst["id"])
    _patch(client, lst["id"], item["id"], {"pack": SIX_BY_ONE_AND_A_HALF})

    body = {"pack": SIX_BY_ONE_AND_A_HALF, "pack_source": "off"}
    after = _patch(client, lst["id"], item["id"], body).json()

    assert after["pack_source"] == "manual"


def test_a_scan_on_a_bought_line_does_not_reopen_the_unpurchase_grace(
    client: TestClient, session: Session
):
    _cache(session, "1 l")
    lst = _list(client)
    item = _item(client, lst["id"], name="Leche")
    _patch(client, lst["id"], item["id"], {"purchased": True})
    row = session.get_one(ListItem, item["id"])
    long_ago = datetime.now(UTC) - timedelta(days=3)
    row.updated_at = long_ago
    session.add(row)
    session.commit()

    _patch(client, lst["id"], item["id"], {"ean": "8410188011128", "brand": "Hacendado"})

    session.refresh(row)
    assert row.updated_at.replace(tzinfo=UTC) == long_ago


# A line sold by weight has no format, wherever the format would come from.


def _lines_of(client: TestClient, list_id: str) -> dict:
    return {i["name"]: i for i in client.get(f"/lists/{list_id}/items").json()}


def _price_per_kilo(client: TestClient, list_id: str, item_id: str) -> None:
    client.post(
        f"/lists/{list_id}/items/{item_id}/prices",
        json={"amount": 8.82, "price_per": "KILOGRAM"},
    )


def test_a_weighed_line_moves_the_size_in_its_name_to_the_quantity(client: TestClient):
    lst = _list(client)

    item = _item(client, lst["id"], name="Ternera 1kg", price=8.82, price_per="KILOGRAM")

    assert item["name"] == "Ternera"
    assert item["quantity"] == "1 kg"
    assert item["pack"] is None


def test_a_weighed_line_with_a_quantity_keeps_its_name(client: TestClient):
    """The quantity was typed apart, with its sigil, so it wins."""
    lst = _list(client)

    item = _item(
        client,
        lst["id"],
        name="Ternera 1kg",
        quantity="2 kg",
        price=8.82,
        price_per="KILOGRAM",
    )

    assert item["name"] == "Ternera 1kg"
    assert item["quantity"] == "2 kg"
    assert item["pack"] is None


def test_a_weighed_line_keeps_a_typed_format(client: TestClient):
    lst = _list(client)

    item = _item(
        client,
        lst["id"],
        name="Ternera",
        price=8.82,
        price_per="KILOGRAM",
        pack=SIX_BY_ONE_AND_A_HALF,
    )

    assert item["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_price_per_kilo_moves_the_size_from_the_name_to_the_quantity(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera 1,5kg")
    assert item["pack"] == {"count": 1, "content": 1.5, "unit": "kg"}

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Ternera"]
    assert line["pack"] is None
    assert line["pack_source"] is None
    assert line["quantity"] == "1,5 kg"


def test_a_packaged_line_with_a_quantity_moves_the_weight_to_the_format(client: TestClient):
    """Two bags of 1 kg: the weight is the product's format."""
    lst = _list(client)

    item = _item(client, lst["id"], name="Arroz 1kg", quantity="2")

    assert item["name"] == "Arroz"
    assert item["pack"] == {"count": 1, "content": 1, "unit": "kg"}


def test_a_price_per_kilo_puts_the_weight_back_in_the_name_when_a_quantity_was_typed(
    client: TestClient,
):
    """The usual order: the line is typed, and priced per kilo later. The
    quantity is taken, so the weight goes back where it was typed."""
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera 1kg", quantity="2")

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Ternera 1 kg"]
    assert line["pack"] is None
    assert line["quantity"] == "2"


def test_a_weighed_line_with_a_quantity_keeps_grams_in_its_name(client: TestClient):
    lst = _list(client)

    item = _item(
        client, lst["id"], name="Queso 250g", quantity="2", price=12.5, price_per="KILOGRAM"
    )

    assert item["name"] == "Queso 250g"
    assert item["pack"] is None


def test_a_weighed_line_with_a_quantity_drops_a_pack_of_weights(client: TestClient):
    """Several pieces is no weight to buy: it leaves the name and goes."""
    lst = _list(client)

    item = _item(
        client, lst["id"], name="Queso 2x250g", quantity="1", price=12.5, price_per="KILOGRAM"
    )

    assert item["name"] == "Queso"
    assert item["pack"] is None
    assert item["quantity"] == "1"


def test_a_price_per_kilo_never_puts_a_code_format_in_the_name(
    client: TestClient, session: Session
):
    _cache(session, "1 kg")
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera", quantity="2", ean="8410188011128")
    assert item["pack_source"] == "off"

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Ternera"]
    assert line["pack"] is None
    assert line["quantity"] == "2"


def test_a_price_per_kilo_puts_a_backfilled_size_back_in_the_quantity(
    client: TestClient, session: Session
):
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera")
    row = session.get_one(ListItem, item["id"])
    row.pack_content = 500
    row.pack_content_unit = "g"
    row.pack_source = "quantity"
    session.add(row)
    session.commit()

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Ternera"]
    assert line["pack"] is None
    assert line["quantity"] == "500 g"


def test_a_price_per_kilo_drops_a_pack_from_the_name_when_a_quantity_was_typed(
    client: TestClient,
):
    """Only a single weight goes back: a pack is no weight to buy."""
    lst = _list(client)
    item = _item(client, lst["id"], name="Agua 6x1,5L", quantity="2")

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Agua"]
    assert line["pack"] is None
    assert line["quantity"] == "2"


def test_a_price_per_kilo_drops_a_format_a_code_brought(client: TestClient, session: Session):
    """Only a size read in the name says how much to buy. The code stays:
    nobody changed the format by hand."""
    _cache(session, "1 kg")
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera", ean="8410188011128")
    assert item["pack_source"] == "off"

    _price_per_kilo(client, lst["id"], item["id"])

    line = _lines_of(client, lst["id"])["Ternera"]
    assert line["pack"] is None
    assert line["quantity"] is None
    assert line["ean"] == "8410188011128"


def test_a_price_per_kilo_keeps_a_typed_format(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera", pack=SIX_BY_ONE_AND_A_HALF)

    _price_per_kilo(client, lst["id"], item["id"])

    assert _lines_of(client, lst["id"])["Ternera"]["pack"] == SIX_BY_ONE_AND_A_HALF


def test_a_price_per_unit_keeps_the_guessed_format(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Agua 6x1,5L")

    client.post(f"/lists/{lst['id']}/items/{item['id']}/prices", json={"amount": 3.48})

    assert _lines_of(client, lst["id"])["Agua"]["pack"] == SIX_BY_ONE_AND_A_HALF


def test_closing_a_line_per_kilo_drops_its_guessed_format(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Ternera 1kg")
    _patch(client, lst["id"], item["id"], {"purchased": True})

    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "lines": [{"item_id": item["id"], "price": 8.82, "price_per": "KILOGRAM"}],
        },
    )

    line = _lines_of(client, lst["id"])["Ternera"]
    assert line["pack"] is None
    assert line["quantity"] == "1 kg"


def test_an_impulse_buy_per_kilo_takes_no_format_from_its_name(client: TestClient):
    lst = _list(client)
    item = _item(client, lst["id"], name="Pan")
    _patch(client, lst["id"], item["id"], {"purchased": True})

    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "lines": [{"item_id": item["id"]}],
            "new_items": [{"name": "Queso 250g", "price": 12.5, "price_per": "KILOGRAM"}],
        },
    )

    queso = _lines_of(client, lst["id"])["Queso"]
    assert queso["pack"] is None
    assert queso["quantity"] == "250 g"
