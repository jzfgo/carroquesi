import json
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas.auth import UserRead
from app.schemas.items import ItemRead
from app.schemas.lists import ListRead
from app.schemas.members import MemberRead
from app.schemas.receipt import ReceiptScanResult


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
        data = json.loads(f.read())

    # 1. /users/me -> UserRead
    # extra='ignore' is implicitly default for BaseModel, but validate_python checks it
    TypeAdapter(UserRead).validate_python(data["ALICE"])

    # 2. /lists -> list[ListRead]
    TypeAdapter(list[ListRead]).validate_python(data["SEED_LISTS"])

    # 3. /lists/:id/items -> list[ItemRead]
    items_adapter = TypeAdapter(list[ItemRead])
    for items in data["SEED_ITEMS"].values():
        items_adapter.validate_python(items)

    # 4. /lists/:id/members -> list[MemberRead]
    members_adapter = TypeAdapter(list[MemberRead])
    for members in data["SEED_MEMBERS"].values():
        members_adapter.validate_python(members)

    # 5. /lists/:id/receipt -> ReceiptScanResult
    TypeAdapter(ReceiptScanResult).validate_python(data["SEED_RECEIPT_RESULT"])
