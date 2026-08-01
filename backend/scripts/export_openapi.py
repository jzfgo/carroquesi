#!/usr/bin/env python3
"""
Export the OpenAPI schema to backend/openapi.json.

Usage:
    uv run python scripts/export_openapi.py

The snapshot is the source for the generated frontend types
(frontend/src/apiSchema.generated.ts). Regenerate both with `just openapi`.
Two tests keep the pair honest: the backend snapshot test fails when this
file is stale, and the frontend lint step fails when the generated types are.

The dump format (sorted keys, two-space indent, trailing newline) is defined
here and only here — the snapshot test compares parsed JSON, not bytes, so
changing the format does not break it.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# The app only needs to be importable, not runnable: settings must resolve,
# but no database or Firebase project is touched by app.openapi().
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")

from app.main import app


def main() -> None:
    out = Path(__file__).parent.parent / "openapi.json"
    schema = app.openapi()
    out.write_text(json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
