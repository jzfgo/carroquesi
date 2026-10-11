import re
import unicodedata

from rapidfuzz import fuzz
from sqlmodel import Session, select

from app.db.models import ListItem, ReceiptNameMapping
from app.schemas.receipt import MatchedLine, ParsedLine, UnmatchedLine
from app.services.store_key import store_key

MATCH_THRESHOLD = 70


def normalise(text: str) -> str:
    text = text.lower()
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    text = re.sub(r"^\d+\s+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _lookup_mapping(
    store: str | None, norm_name: str, session: Session
) -> ReceiptNameMapping | None:
    if not store:
        return None
    # Rows are stored key-normalised; the scan's store arrives as free text.
    stmt = select(ReceiptNameMapping).where(
        ReceiptNameMapping.store == store_key(store),
        ReceiptNameMapping.receipt_name == norm_name,
    )
    return session.exec(stmt).first()


def match_lines(
    lines: list[ParsedLine],
    store: str | None,
    purchased_items: list[ListItem],
    session: Session,
) -> tuple[list[MatchedLine], list[UnmatchedLine]]:
    matched: list[MatchedLine] = []
    unmatched: list[UnmatchedLine] = []

    # purchased_items is ordered by relevance, so the first free candidate is
    # the likeliest one. Each item takes at most one line: a product sold by
    # the piece prints one line per package, and letting every copy claim the
    # same row would keep only the last price and drop the rest of the spend.
    # With N rows of that name the lines pair up with them in order; lines
    # beyond that come back unmatched for the review to name.
    assigned: set[str] = set()

    def free(item: ListItem) -> bool:
        return item.id not in assigned

    for line in lines:
        # A negative amount is not a product — it is a discount the parse
        # failed to fold into its product's line. It must never claim an item
        # (a match would write the discount into that product's price
        # history), so it skips matching entirely and surfaces unmatched for
        # the review sheet to lock.
        if line.line_total < 0 or line.unit_price < 0:
            unmatched.append(
                UnmatchedLine(
                    receipt_name=line.name,
                    price_type=line.price_type,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                )
            )
            continue

        norm = normalise(line.name)

        mapping = _lookup_mapping(store, norm, session)
        if mapping:
            mapped_name = normalise(mapping.item_name)
            item = next(
                (i for i in purchased_items if free(i) and normalise(i.name) == mapped_name),
                None,
            )
            if item:
                assigned.add(item.id)
                matched.append(
                    MatchedLine(
                        receipt_name=line.name,
                        item_id=item.id,
                        item_name=item.name,
                        price_type=line.price_type,
                        unit_price=line.unit_price,
                        quantity=line.quantity,
                        line_total=line.line_total,
                    )
                )
                continue

        best_score = 0
        best_item: ListItem | None = None
        for item in filter(free, purchased_items):
            score = fuzz.token_sort_ratio(norm, normalise(item.name))
            if score > best_score:
                best_score = score
                best_item = item

        if best_score >= MATCH_THRESHOLD and best_item:
            assigned.add(best_item.id)
            matched.append(
                MatchedLine(
                    receipt_name=line.name,
                    item_id=best_item.id,
                    item_name=best_item.name,
                    price_type=line.price_type,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                )
            )
        else:
            unmatched.append(
                UnmatchedLine(
                    receipt_name=line.name,
                    price_type=line.price_type,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                )
            )

    return matched, unmatched
