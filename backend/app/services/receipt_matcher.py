import re
import unicodedata
from typing import Optional

from rapidfuzz import fuzz
from sqlmodel import Session, select

from app.db.models import ListItem, ReceiptNameMapping
from app.schemas.receipt import MatchedLine, ParsedLine, UnmatchedLine

MATCH_THRESHOLD = 70


def normalise(text: str) -> str:
    text = text.lower()
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    text = re.sub(r"^\d+\s+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _lookup_mapping(
    store: Optional[str], norm_name: str, session: Session
) -> Optional[ReceiptNameMapping]:
    if not store:
        return None
    stmt = select(ReceiptNameMapping).where(
        ReceiptNameMapping.store == store,
        ReceiptNameMapping.receipt_name == norm_name,
    )
    return session.exec(stmt).first()


def match_lines(
    lines: list[ParsedLine],
    store: Optional[str],
    purchased_items: list[ListItem],
    session: Session,
) -> tuple[list[MatchedLine], list[UnmatchedLine]]:
    matched: list[MatchedLine] = []
    unmatched: list[UnmatchedLine] = []

    item_by_name: dict[str, ListItem] = {i.name: i for i in purchased_items}

    for line in lines:
        norm = normalise(line.name)

        mapping = _lookup_mapping(store, norm, session)
        if mapping:
            item = item_by_name.get(mapping.item_name)
            if item:
                matched.append(MatchedLine(
                    receipt_name=line.name,
                    item_id=item.id,
                    item_name=item.name,
                    price_type=line.price_type,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                ))
                continue

        best_score = 0
        best_item: Optional[ListItem] = None
        for item in purchased_items:
            score = fuzz.token_sort_ratio(norm, normalise(item.name))
            if score > best_score:
                best_score = score
                best_item = item

        if best_score >= MATCH_THRESHOLD and best_item:
            matched.append(MatchedLine(
                receipt_name=line.name,
                item_id=best_item.id,
                item_name=best_item.name,
                price_type=line.price_type,
                unit_price=line.unit_price,
                quantity=line.quantity,
                line_total=line.line_total,
            ))
        else:
            unmatched.append(UnmatchedLine(
                receipt_name=line.name,
                price_type=line.price_type,
                unit_price=line.unit_price,
                quantity=line.quantity,
                line_total=line.line_total,
            ))

    return matched, unmatched
