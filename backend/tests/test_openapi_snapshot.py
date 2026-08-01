import json
from pathlib import Path

from app.main import app


def test_openapi_snapshot_is_fresh():
    """
    The committed backend/openapi.json must match what the app serves.

    The snapshot feeds the generated frontend types, so a stale snapshot means
    the frontend is typed against an API that no longer exists. Comparison is
    on parsed JSON, not bytes: the dump format belongs to the export script
    alone, and a format change is not a contract change.
    """
    snapshot_path = Path(__file__).parent.parent / "openapi.json"
    assert snapshot_path.exists(), "backend/openapi.json is missing — run `just openapi`"

    snapshot = json.loads(snapshot_path.read_text())
    assert snapshot == app.openapi(), (
        "backend/openapi.json is stale — run `just openapi` and commit both "
        "it and frontend/src/apiSchema.generated.ts"
    )
