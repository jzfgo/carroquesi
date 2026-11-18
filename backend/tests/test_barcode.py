from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock
from sqlmodel import Session, select

from app.db.models import BarcodeCache

OFF_MAHOU = {
    "status": "success",  # OFF v2/v3 API returns string status
    "product": {
        "product_name_es": "Cerveza especial",
        "product_name": "Mahou 5 Estrellas",
        "brands": "Mahou",
        "stores": "Mercadona,Alcampo",
        "quantity": "6 x 33 cl",
    },
}

OFF_NO_ES_NAME = {
    "status": "success",
    "product": {
        "product_name_es": "",
        "product_name": "Generic Beer",
        "brands": "NoBrand,OtherBrand",
        "stores": None,
    },
}

OFF_NOT_FOUND = {"status": "failure"}  # OFF not-found response

_EAN13 = "8411327122016"
_EAN8 = "12345678"

_OFF_URL_EAN13 = f"https://es.openfoodfacts.org/api/v2/product/{_EAN13}.json"
_OFF_URL_EAN8 = f"https://es.openfoodfacts.org/api/v2/product/{_EAN8}.json"
_OBF_URL_EAN13 = f"https://es.openbeautyfacts.org/api/v2/product/{_EAN13}.json"
_OPF_URL_EAN13 = f"https://es.openproductsfacts.org/api/v2/product/{_EAN13}.json"
_OPFF_URL_EAN13 = f"https://es.openpetfoodfacts.org/api/v2/product/{_EAN13}.json"


def test_invalid_ean_returns_422(client: TestClient):
    assert client.get("/barcode/123").status_code == 422
    assert client.get("/barcode/ABCDEFGHIJKLM").status_code == 422
    assert client.get("/barcode/123456789012345").status_code == 422


def test_valid_ean8_accepted(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN8, json=OFF_MAHOU)
    assert client.get("/barcode/12345678").status_code == 200


def test_returns_product_from_off(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Cerveza especial"
    assert data["brand"] == "Mahou"
    assert data["stores"] == ["Mercadona", "Alcampo"]


def test_falls_back_to_product_name_when_no_es_name(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_NO_ES_NAME)
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Generic Beer"
    assert data["brand"] == "NoBrand"
    assert data["stores"] == []


def test_returns_404_when_not_found_on_any_site(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_NOT_FOUND)
    httpx_mock.add_response(url=_OBF_URL_EAN13, json=OFF_NOT_FOUND)
    httpx_mock.add_response(url=_OPF_URL_EAN13, json=OFF_NOT_FOUND)
    httpx_mock.add_response(url=_OPFF_URL_EAN13, json=OFF_NOT_FOUND)
    assert client.get(f"/barcode/{_EAN13}").status_code == 404


def test_falls_back_to_beauty_site_when_food_not_found(client: TestClient, httpx_mock: HTTPXMock):
    beauty_product = {
        "status": "success",
        "product": {"product_name": "Nivea Cream", "brands": "Nivea", "stores": None},
    }
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_NOT_FOUND)
    httpx_mock.add_response(url=_OBF_URL_EAN13, json=beauty_product)
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["name"] == "Nivea Cream"
    assert data["brand"] == "Nivea"


def test_falls_back_after_unreachable_site(client: TestClient, httpx_mock: HTTPXMock):
    import httpx as _httpx

    httpx_mock.add_exception(_httpx.ConnectError("unreachable"), url=_OFF_URL_EAN13)
    httpx_mock.add_response(url=_OBF_URL_EAN13, json=OFF_MAHOU)
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["name"] == "Cerveza especial"


def test_returns_404_when_all_sites_unreachable(client: TestClient, httpx_mock: HTTPXMock):
    import httpx as _httpx

    for url in (_OFF_URL_EAN13, _OBF_URL_EAN13, _OPF_URL_EAN13, _OPFF_URL_EAN13):
        httpx_mock.add_exception(_httpx.ConnectError("unreachable"), url=url)
    assert client.get(f"/barcode/{_EAN13}").status_code == 404


def test_cache_hit_skips_off_call(client: TestClient, httpx_mock: HTTPXMock):
    # First request populates the barcode cache
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)
    client.get(f"/barcode/{_EAN13}")

    # Second request: the barcode cache is hit — no external calls
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["name"] == "Cerveza especial"


def test_stores_empty_list_when_absent(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_NO_ES_NAME)
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["stores"] == []


def test_parse_stores_dedupes_spelling_variants():
    from app.routers.barcode import _parse_stores

    assert _parse_stores("Carrefour, carrefour ,CARREFOUR") == ["Carrefour"]
    assert _parse_stores("Mercadona, Alcampo") == ["Mercadona", "Alcampo"]
    assert _parse_stores(None) == []


def test_caches_the_package_size(client: TestClient, httpx_mock: HTTPXMock, session: Session):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)
    client.get(f"/barcode/{_EAN13}")

    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == _EAN13)).one()
    assert cached.quantity == "6 x 33 cl"


# --- Gaps found by mutation testing ---


def _product(**fields) -> dict:
    return {"status": "success", "product": fields}


def test_off_is_called_with_our_headers_and_a_timeout(client: TestClient, monkeypatch):
    from app.core.http import HEADERS

    calls = []

    def fake_get(url, **kwargs):
        calls.append(kwargs)
        raise RuntimeError("offline")

    monkeypatch.setattr("app.routers.barcode.httpx.get", fake_get)
    client.get(f"/barcode/{_EAN13}")

    assert calls and all(c == {"headers": HEADERS, "timeout": 5.0} for c in calls)


def test_the_older_numeric_found_status_is_accepted(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=_OFF_URL_EAN13, json={"status": 1, "product": {"product_name": "Pan"}}
    )
    assert client.get(f"/barcode/{_EAN13}").json()["name"] == "Pan"


def test_a_found_status_without_a_product_tries_the_next_site(
    client: TestClient, httpx_mock: HTTPXMock
):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json={"status": "success"})
    httpx_mock.add_response(url=_OBF_URL_EAN13, json=_product(product_name="Champú"))
    assert client.get(f"/barcode/{_EAN13}").json()["name"] == "Champú"


def test_a_product_with_no_name_tries_the_next_site(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=_product(brands="Sin nombre"))
    httpx_mock.add_response(url=_OBF_URL_EAN13, json=_product(product_name="Champú"))
    assert client.get(f"/barcode/{_EAN13}").json()["name"] == "Champú"


def test_the_spanish_generic_name_comes_before_the_generic_one(
    client: TestClient, httpx_mock: HTTPXMock
):
    httpx_mock.add_response(
        url=_OFF_URL_EAN13, json=_product(generic_name_es="Leche", generic_name="Milk")
    )
    assert client.get(f"/barcode/{_EAN13}").json()["name"] == "Leche"


def test_the_generic_name_is_the_last_fallback(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=_product(generic_name="Milk"))
    assert client.get(f"/barcode/{_EAN13}").json()["name"] == "Milk"


def _commit_fails_once(session: Session, monkeypatch, before_raise=None):
    from sqlalchemy.exc import IntegrityError

    real_commit = session.commit
    state = {"failed": False}

    def commit():
        if state["failed"]:
            return real_commit()
        state["failed"] = True
        session.rollback()
        if before_raise:
            before_raise(real_commit)
        raise IntegrityError("INSERT", {}, Exception("unique"))

    monkeypatch.setattr(session, "commit", commit)


def test_a_concurrent_request_that_cached_the_ean_first_wins(
    client: TestClient, httpx_mock: HTTPXMock, session: Session, monkeypatch
):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)

    def concurrent_insert(real_commit):
        session.add(BarcodeCache(ean="00000000", name="Otro"))
        session.add(BarcodeCache(ean=_EAN13, name="Suyo"))
        real_commit()

    _commit_fails_once(session, monkeypatch, concurrent_insert)

    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["ean"] == _EAN13
    assert data["name"] == "Suyo"


def test_a_failed_cache_write_with_no_row_to_return_is_a_503(
    client: TestClient, httpx_mock: HTTPXMock, session: Session, monkeypatch
):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)
    _commit_fails_once(session, monkeypatch)

    assert client.get(f"/barcode/{_EAN13}").status_code == 503
