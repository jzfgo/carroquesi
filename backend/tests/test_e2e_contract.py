import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from fastapi.routing import APIRoute
from pydantic import TypeAdapter

from app.db.models import _now
from app.main import app
from app.services.feature_flags import REGISTRY


def _api_routes(routes: list[Any]) -> Iterator[APIRoute]:
    """Yield every APIRoute reachable from a router, however deeply included.

    `include_router` wraps each child in a private wrapper rather than copying
    its routes up, so the top level of `app.routes` holds almost none of them.
    """
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from _api_routes(inner.routes)


ROUTES = {
    (method, route.path): route for route in _api_routes(app.routes) for method in route.methods
}

# The walk above reaches into an undocumented attribute, so a FastAPI upgrade
# could quietly empty this map. Every lookup would then fail to find its route,
# and a fixture would be checked against nothing at all — a guard that passes
# because it found nothing to guard. Fail here instead.
assert len(ROUTES) > 20, "no routes found: the walk needs updating"


def response_model(method: str, path: str) -> Any:
    """The model the app really serves on a route.

    Asking the route, rather than importing a schema by name, is what makes this
    a contract test. Importing `ItemRead` proves the fixture matches that class;
    it says nothing about whether the items endpoint still returns it.
    """
    route = ROUTES.get((method, path))
    assert route is not None, f"{method} {path} is not a route"
    assert route.response_model is not None, f"{method} {path} declares no response_model"
    # The comparison below dumps the model on its own. That only matches the
    # wire when the route serializes it the ordinary way, so a route that opts
    # out has to fail rather than be silently compared against the wrong shape.
    assert route.response_model_by_alias, f"{method} {path} serializes without aliases"
    for opt in ("exclude_none", "exclude_unset", "exclude_defaults"):
        assert not getattr(route, f"response_model_{opt}"), f"{method} {path} sets {opt}"
    return route.response_model


def assert_exact(model: Any, payload: Any):
    """
    Validates a payload against a model and checks that the serialized output
    matches the original payload exactly, ensuring no extra keys exist and no
    default values were silently filled.

    Serialized by alias because that is what FastAPI does. Left at the Pydantic
    default, a field that gains a serialization alias is renamed on the wire
    while this test stays green.
    """
    obj = TypeAdapter(model).validate_python(payload)
    expected = TypeAdapter(model).dump_python(obj, mode="json", by_alias=True)
    assert payload == expected, f"{model} mismatch.\nPayload: {payload}\nExpected: {expected}"


def test_e2e_fixtures_match_backend_schemas():
    """
    Validates that the Playwright fixtures used in the frontend E2E tests
    match the Pydantic schemas defined in the backend.
    This prevents schema drift where E2E tests pass with mocked payloads
    that no longer match what the real backend returns.
    """
    fixtures_path = Path(__file__).parent.parent.parent / "frontend" / "tests" / "fixtures.json"
    assert fixtures_path.exists(), f"Fixtures file not found at {fixtures_path}"

    with open(fixtures_path) as f:
        content = f.read()
        data = json.loads(content)

    # The fixtures carry no zone suffix because the stored timestamps have no
    # zone either, and the client re-attaches the 'Z' when it parses. Read that
    # fact off the column default rather than restating it, so the day the
    # backend starts storing aware datetimes this fails instead of agreeing.
    assert _now().tzinfo is None, "timestamps are now aware: the fixtures need a zone suffix"
    for dt in re.findall(r'"\d{4}-\d{2}-\d{2}T[\d:.]+[^"]*"', content):
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T[\d:.]+", dt.strip('"')), f"naive UTC only: {dt}"

    # 1. /users/me -> UserRead
    assert_exact(response_model("GET", "/users/me"), data["ALICE"])

    # Assert that all features that default to true in the registry are present in ALICE's features.
    default_on_features = {name for name, f in REGISTRY.items() if f.default}
    alice_features = set(data["ALICE"]["features"])
    assert default_on_features.issubset(alice_features), (
        f"ALICE features ({alice_features}) must include all default-on features ({default_on_features}) "
        "to ensure E2E tests and visual baselines reflect what production renders."
    )
    assert alice_features <= set(REGISTRY.keys()), (
        f"ALICE features ({alice_features}) contains unknown flags not in REGISTRY"
    )

    # 2. /lists -> list[ListRead]
    assert_exact(response_model("GET", "/lists"), data["SEED_LISTS"])

    # 3. /lists/:id/items -> list[ItemRead]
    items_model = response_model("GET", "/lists/{list_id}/items")
    for items in data["SEED_ITEMS"].values():
        assert_exact(items_model, items)

    # 4. /lists/:id/members -> list[MemberRead]
    members_model = response_model("GET", "/lists/{list_id}/members")
    for members in data["SEED_MEMBERS"].values():
        assert_exact(members_model, members)

    # 5. /lists/:id/receipt -> ReceiptScanResult
    assert_exact(response_model("POST", "/lists/{list_id}/receipt"), data["SEED_RECEIPT_RESULT"])

    # 6. /lists/:id/stores -> list[StoreRead]
    stores_model = response_model("GET", "/lists/{list_id}/stores")
    for stores in data["SEED_STORES"].values():
        assert_exact(stores_model, stores)

    # 7. Write-path templates. The mocks in fixtures.ts answer a write by
    # spreading echoed request fields over one of these, so what this validates
    # is the full key set and every value the echo does not overwrite. The two
    # PATCH mocks are not templated: they spread a patch over an item or list
    # fixture already validated above, and a patch body cannot invent keys.
    assert_exact(response_model("POST", "/auth/sync"), data["ALICE"])
    assert_exact(response_model("POST", "/lists"), data["SEED_CREATED_LIST"])
    item_model = response_model("POST", "/lists/{list_id}/items")
    assert_exact(item_model, data["SEED_CREATED_ITEM"])
    assert_exact(item_model, data["SEED_IMPULSE_ITEM"])
    prices_path = "/lists/{list_id}/items/{item_id}/prices"
    assert_exact(response_model("POST", prices_path), data["SEED_PRICE_ENTRY"])
    assert_exact(response_model("PATCH", prices_path), data["SEED_PRICE_ENTRY"])
    assert_exact(response_model("GET", prices_path), data["SEED_PRICE_HISTORY"])
    assert_exact(
        response_model("POST", "/lists/{list_id}/receipt-prices"),
        data["SEED_RECEIPT_APPLY_RESULT"],
    )
    assert_exact(
        response_model("GET", "/lists/{list_id}/updated-at"),
        data["SEED_UPDATED_AT"],
    )
