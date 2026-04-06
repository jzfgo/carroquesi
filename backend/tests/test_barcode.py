from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock


OFF_MAHOU = {
    "status": "success",  # OFF v2/v3 API returns string status
    "product": {
        "product_name_es": "Cerveza especial",
        "product_name": "Mahou 5 Estrellas",
        "brands": "Mahou",
        "stores": "Mercadona,Alcampo",
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
    # First request populates the cache
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_MAHOU)
    client.get(f"/barcode/{_EAN13}")

    # Second request must not call any site — httpx_mock raises if an unexpected call is made
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["name"] == "Cerveza especial"


def test_stores_empty_list_when_absent(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=_OFF_URL_EAN13, json=OFF_NO_ES_NAME)
    data = client.get(f"/barcode/{_EAN13}").json()
    assert data["stores"] == []
