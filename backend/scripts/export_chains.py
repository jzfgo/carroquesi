#!/usr/bin/env python3
"""
Export the chain table (what GET /chains serves) to the frontend.

Usage:
    uv run python scripts/export_chains.py

The file is the frontend's cold-start fallback, used until the first
GET /chains answers. Never edit it by hand. No check fails when it is stale:
the fetch replaces it, so a stale copy only misses a recent own brand.
Refresh it when convenient.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")

from app.chains.registry import chain_table

OUT = Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "chains.generated.json"


def main() -> None:
    table = [chain.model_dump() for chain in chain_table()]
    OUT.write_text(json.dumps(table, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
