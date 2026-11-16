import json
from pathlib import Path

import pytest

from app.services.pack_from_name import format_in_quantity

VECTORS_PATH = (
    Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "packTextVectors.json"
)
VECTORS = json.loads(VECTORS_PATH.read_text())


@pytest.mark.parametrize("vector", VECTORS, ids=[v["text"] or "<empty>" for v in VECTORS])
def test_format_in_quantity_matches_shared_vectors(vector):
    """The input bar's `*` sigil reads a size with the frontend's copy of this
    grammar. Both suites assert the same file, so neither can drift."""
    assert format_in_quantity(vector["text"]) == vector["pack"]
