from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock


OFF_MAHOU = {
    "status": "success",  # OFF v3 API returns string status
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

OFF_NOT_FOUND = {"status": "failure"}  # OFF v3 not-found response


def test_invalid_ean_returns_422(client: TestClient):
    assert client.get("/barcode/123").status_code == 422
    assert client.get("/barcode/ABCDEFGHIJKLM").status_code == 422
    assert client.get("/barcode/123456789012345").status_code == 422


def test_valid_ean8_accepted(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/12345678.json",
        json=OFF_MAHOU,
    )
    assert client.get("/barcode/12345678").status_code == 200


def test_returns_product_from_off(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_MAHOU,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Cerveza especial"
    assert data["brand"] == "Mahou"
    assert data["stores"] == ["Mercadona", "Alcampo"]


def test_falls_back_to_product_name_when_no_es_name(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NO_ES_NAME,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Generic Beer"
    assert data["brand"] == "NoBrand"
    assert data["stores"] == []


def test_returns_404_when_off_product_not_found(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NOT_FOUND,
    )
    assert client.get("/barcode/8411327122016").status_code == 404


def test_returns_503_when_off_unreachable(client: TestClient, httpx_mock: HTTPXMock):
    import httpx as _httpx
    httpx_mock.add_exception(
        _httpx.ConnectError("unreachable"),
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
    )
    assert client.get("/barcode/8411327122016").status_code == 503


def test_cache_hit_skips_off_call(client: TestClient, httpx_mock: HTTPXMock):
    # First request populates the cache
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_MAHOU,
    )
    client.get("/barcode/8411327122016")

    # Second request must not call OFF — httpx_mock raises if an unexpected call is made
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Cerveza especial"


def test_stores_empty_list_when_absent(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NO_ES_NAME,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["stores"] == []
