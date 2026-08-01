"""Deterministic store-name key: compare by key, display the typed string.

Store names arrive as free text from four sources (typed sigils, the AI
receipt parse, Open Food Facts, price logging) and no two people spell a
shop the same way. The key collapses spelling variants — case, accents,
whitespace, punctuation — and nothing else: vocabulary variants such as
"BM" vs "BM Supermercados" stay apart on purpose, because no rule can
tell them from "Carrefour" vs "Carrefour Express".

The frontend mirrors this in lib/storeKey.ts. Both implementations are
pinned to the shared vector file frontend/src/lib/storeKeyVectors.json;
change one only through that file.
"""

import re
import unicodedata

from sqlmodel import Session, select

from app.db.models import ReceiptNameMapping


def store_key(text: str) -> str:
    folded = text.lower()
    folded = "".join(
        c for c in unicodedata.normalize("NFD", folded) if unicodedata.category(c) != "Mn"
    )
    folded = re.sub(r"\s+", " ", folded).strip()
    # Category classes L*/N* rather than isalnum(): the frontend regex uses
    # \p{L}\p{N}, and the two sets must not drift apart at the edges.
    key = "".join(c for c in folded if unicodedata.category(c)[0] in ("L", "N"))
    # A punctuation-only name must keep its own key. Collapsing them all
    # into "" would merge every such store into one bucket.
    return key or folded


def merge_receipt_name_mapping_keys(session: Session) -> None:
    """Rewrite mapping rows to their key form, merging rows that collide.

    Lives here rather than in the migration file because the test suite
    never runs migrations; this way the logic is unit-tested and the
    migration only has to call it.
    """
    from app.services.receipt_matcher import normalise

    rows = session.exec(select(ReceiptNameMapping)).all()
    groups: dict[tuple[str, str], list[ReceiptNameMapping]] = {}
    for row in rows:
        groups.setdefault((store_key(row.store), normalise(row.receipt_name)), []).append(row)

    for (kstore, kname), group in groups.items():
        survivor = max(group, key=lambda r: (r.use_count, r.updated_at))
        for loser in group:
            if loser is not survivor:
                session.delete(loser)
        # Free the (store, receipt_name) unique slots before the rewrite:
        # a loser may already sit on the exact key pair.
        session.flush()
        survivor.use_count = sum(r.use_count for r in group)
        survivor.store = kstore
        survivor.receipt_name = kname
        session.add(survivor)
