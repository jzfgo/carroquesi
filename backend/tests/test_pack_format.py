"""A line's pack format: written by hand on the item, carried by re-buy,
and the EAN it invalidates."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListItem, Purchase

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
