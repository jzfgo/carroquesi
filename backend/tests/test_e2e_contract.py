import json
import re
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from app.schemas.auth import UserRead
from app.schemas.items import ItemRead
from app.schemas.lists import ListRead
from app.schemas.members import MemberRead
from app.schemas.receipt import ReceiptScanResult
from app.services.feature_flags import REGISTRY


def assert_exact(model: Any, payload: Any):
    """
    Validates a payload against a model and checks that the serialized output
    matches the original payload exactly, ensuring no extra keys exist and no
    default values were silently filled.
    """
    obj = TypeAdapter(model).validate_python(payload)
    expected = TypeAdapter(model).dump_python(obj, mode="json")
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

    for dt in re.findall(r'"\d{4}-\d{2}-\d{2}T[\d:.]+[^"]*"', content):
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T[\d:.]+", dt.strip('"')), f"naive UTC only: {dt}"

    # 1. /users/me -> UserRead
    assert_exact(UserRead, data["ALICE"])

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
    assert_exact(list[ListRead], data["SEED_LISTS"])

    # 3. /lists/:id/items -> list[ItemRead]
    for items in data["SEED_ITEMS"].values():
        assert_exact(list[ItemRead], items)

    # 4. /lists/:id/members -> list[MemberRead]
    for members in data["SEED_MEMBERS"].values():
        assert_exact(list[MemberRead], members)

    # 5. /lists/:id/receipt -> ReceiptScanResult
    assert_exact(ReceiptScanResult, data["SEED_RECEIPT_RESULT"])
