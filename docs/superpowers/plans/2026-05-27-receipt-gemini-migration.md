# Receipt Parsing Migration: Firebase AI Logic (Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cloud Vision OCR + 14-chain regex parser with a frontend Gemini call via Firebase AI Logic, correctly classifying price types (UNIT / KILOGRAM / MULTI) and removing all dead backend services.

**Architecture:** The frontend converts the receipt file to base64 inline data, calls `gemini-3.5-flash` with `PREFER_ON_DEVICE` via `firebase/ai`, receives structured JSON, then POSTs the parsed lines to a simplified backend endpoint that runs the existing fuzzy matcher and infers the store from matched items when Gemini returns null.

**Tech Stack:** `firebase/ai` (GoogleAIBackend, InferenceMode), FastAPI + SQLModel, Pydantic, Alembic, Vitest + Testing Library

---

## File Map

**Backend — modified**
- `backend/app/schemas/receipt.py` — add `ParsedLine`, `ReceiptScanRequest`; update `MatchedLine`/`UnmatchedLine` with new price fields
- `backend/app/db/models.py` — remove `image_path` and `ocr_raw` from `ReceiptScan`
- `backend/app/services/receipt_matcher.py` — change `match_lines` signature; import from schemas not receipt_parser
- `backend/app/routers/receipt.py` — accept JSON body, add store inference, remove OCR/parser imports
- `backend/app/core/config.py` — remove `gcp_project` and `receipt_storage_bucket`

**Backend — new**
- `backend/alembic/versions/<rev>_drop_receipt_scan_image_ocr.py` — migration to drop two columns

**Backend — deleted**
- `backend/app/services/receipt_ocr.py`
- `backend/app/services/receipt_parser.py`
- `backend/app/services/image_storage.py`
- `backend/tests/test_receipt_parser.py`
- `backend/tests/test_receipt_parser_stores.py`
- `backend/tests/fixtures/receipts/` (entire directory)

**Backend — tests modified**
- `backend/tests/test_receipt_router.py` — rewrite for JSON endpoint
- `backend/tests/test_receipt_matcher.py` — update imports and signatures

**Frontend — modified**
- `frontend/src/types/receipt.ts` — add `ParsedLine`, `ReceiptScanRequest`; update `MatchedLine`/`UnmatchedLine`
- `frontend/src/lib/firebase.ts` — export `ai` instance
- `frontend/src/lib/api.ts` — replace `uploadReceipt` + `apiFetchForm` with `submitParsedReceipt`
- `frontend/src/components/ListScreen.tsx` — wire up `parseReceiptWithAi`, add PDF accept
- `frontend/src/components/ReceiptScanSheet.tsx` — price context rows, patch building from new types
- `frontend/src/components/ReceiptScanSheet.test.tsx` — update mocks and assertions

**Frontend — new**
- `frontend/src/lib/receiptAi.ts` — Gemini call with structured output schema

---

## Task 1: Update backend receipt schemas

**Files:**
- Modify: `backend/app/schemas/receipt.py`

- [ ] **Step 1: Write a failing test for the new ParsedLine schema**

```python
# Add temporarily to backend/tests/test_receipt_router.py
def test_parsed_line_unit_price_required():
    from pydantic import ValidationError
    from app.schemas.receipt import ParsedLine
    import pytest
    with pytest.raises(ValidationError):
        ParsedLine(name="x", price_type="UNIT", line_total=1.0)  # missing unit_price
```

Run: `just backend test-file tests/test_receipt_router.py::test_parsed_line_unit_price_required`
Expected: FAIL (ImportError — `ParsedLine` not yet updated)

- [ ] **Step 2: Replace the contents of `backend/app/schemas/receipt.py`**

```python
from typing import Literal, Optional
from pydantic import BaseModel


class ParsedLine(BaseModel):
    name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class ReceiptScanRequest(BaseModel):
    store: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_total: Optional[float] = None
    lines: list[ParsedLine]


class MatchedLine(BaseModel):
    receipt_name: str
    item_id: str
    item_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class UnmatchedLine(BaseModel):
    receipt_name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float


class ReceiptScanResult(BaseModel):
    scan_id: str
    store: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_total: Optional[float] = None
    matched: list[MatchedLine]
    unmatched: list[UnmatchedLine]


class PricePatch(BaseModel):
    item_id: str
    price: float
    price_per: Optional[str] = None
    store: Optional[str] = None


class NameMappingCreate(BaseModel):
    store: str
    receipt_name: str
    item_name: str
    item_brand: Optional[str] = None


class ReceiptPriceBatch(BaseModel):
    scan_id: Optional[str] = None
    patches: list[PricePatch]
    mappings: list[NameMappingCreate]
```

- [ ] **Step 3: Run the test — expect it to pass now**

Run: `just backend test-file tests/test_receipt_router.py::test_parsed_line_unit_price_required`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/receipt.py
git commit -m "feat: update receipt schemas with price_type, unit_price, line_total"
```

---

## Task 2: Drop unused ReceiptScan columns

**Files:**
- Modify: `backend/app/db/models.py`
- Create: `backend/alembic/versions/<rev>_drop_receipt_scan_image_ocr.py`

- [ ] **Step 1: Remove `image_path` and `ocr_raw` from the `ReceiptScan` model**

In `backend/app/db/models.py`, find the `ReceiptScan` class and remove these two lines:

```python
    image_path: Optional[str] = None
    ocr_raw: Optional[dict] = Field(default=None, sa_column=Column(JSON))
```

The class after the edit should be:

```python
class ReceiptScan(SQLModel, table=True):
    __tablename__ = "receipt_scans"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    scanned_by: str = Field(foreign_key="users.id")
    store: Optional[str] = None
    receipt_date: Optional[date_type] = None
    receipt_total: Optional[float] = None
    parsed_lines: Optional[list] = Field(default=None, sa_column=Column(JSON))
    match_result: Optional[list] = Field(default=None, sa_column=Column(JSON))
    items_updated: int = 0
    created_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 2: Generate a new migration skeleton**

```bash
cd backend && uv run alembic revision -m "drop_receipt_scan_image_ocr"
```

Note the generated filename (e.g. `backend/alembic/versions/XXXXXXXX_drop_receipt_scan_image_ocr.py`).

- [ ] **Step 3: Fill in the migration**

Open the generated file. Set `down_revision = 'd182b25f62a5'` and fill in:

```python
import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    with op.batch_alter_table("receipt_scans") as batch_op:
        batch_op.drop_column("image_path")
        batch_op.drop_column("ocr_raw")


def downgrade() -> None:
    with op.batch_alter_table("receipt_scans") as batch_op:
        batch_op.add_column(sa.Column("image_path", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("ocr_raw", sa.JSON(), nullable=True))
```

- [ ] **Step 4: Run the full backend test suite**

Run: `just backend test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/alembic/versions/
git commit -m "feat: drop image_path and ocr_raw from receipt_scans"
```

---

## Task 3: Update receipt_matcher

**Files:**
- Modify: `backend/app/services/receipt_matcher.py`
- Modify: `backend/tests/test_receipt_matcher.py`

- [ ] **Step 1: Replace `backend/tests/test_receipt_matcher.py` with failing tests**

```python
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.schemas.receipt import ParsedLine
from app.services.receipt_matcher import normalise, match_lines
from app.db.models import ListItem, ReceiptNameMapping


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _item(item_id: str, name: str, price_store: str | None = None) -> ListItem:
    return ListItem(
        id=item_id,
        list_id="list-1",
        name=name,
        added_by="user-1",
        price_store=price_store,
    )


def _unit(name: str, price: float) -> ParsedLine:
    return ParsedLine(name=name, price_type="UNIT", unit_price=price, line_total=price)


def test_normalise_lowercases():
    assert normalise("BEBIDA ALMENDRAS") == "bebida almendras"


def test_normalise_strips_accents():
    assert normalise("Bebída") == "bebida"


def test_normalise_strips_leading_quantity():
    assert normalise("2 BOLSA PLASTICO") == "bolsa plastico"


def test_normalise_collapses_whitespace():
    assert normalise("  pan   de  molde  ") == "pan de molde"


def test_match_via_fuzzy(session):
    items = [_item("item-1", "Bebida de almendra 0% azúcares")]
    matched, unmatched = match_lines(
        [_unit("BEBIDA ALMENDRAS 0%", 1.15)], "Mercadona", items, session
    )
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].unit_price == pytest.approx(1.15)
    assert matched[0].price_type == "UNIT"
    assert len(unmatched) == 0


def test_unmatched_when_score_too_low(session):
    items = [_item("item-1", "Bebida de almendra")]
    matched, unmatched = match_lines(
        [_unit("XXXXXX ZZZZ", 9.99)], "Mercadona", items, session
    )
    assert len(matched) == 0
    assert len(unmatched) == 1
    assert unmatched[0].receipt_name == "XXXXXX ZZZZ"


def test_mapping_lookup_takes_priority(session):
    mapping = ReceiptNameMapping(
        id="map-1",
        store="Mercadona",
        receipt_name="mani dulce",
        item_name="Maní dulce",
        confirmed_by="user-1",
    )
    session.add(mapping)
    session.commit()

    items = [_item("item-1", "Maní dulce"), _item("item-2", "Frutos secos mix")]
    matched, unmatched = match_lines(
        [_unit("MANI DULCE", 3.15)], "Mercadona", items, session
    )
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"


def test_kilogram_line_carries_quantity(session):
    items = [_item("item-1", "Bacon lonchas")]
    line = ParsedLine(
        name="BACON LONCHAS",
        price_type="KILOGRAM",
        unit_price=11.40,
        quantity=0.202,
        line_total=2.30,
    )
    matched, unmatched = match_lines([line], "Mercadona", items, session)
    assert matched[0].price_type == "KILOGRAM"
    assert matched[0].unit_price == pytest.approx(11.40)
    assert matched[0].quantity == pytest.approx(0.202)
    assert matched[0].line_total == pytest.approx(2.30)


def test_multi_line_carries_quantity(session):
    items = [_item("item-1", "Yogur natural")]
    line = ParsedLine(
        name="YOGUR NATURAL",
        price_type="MULTI",
        unit_price=0.95,
        quantity=3,
        line_total=2.85,
    )
    matched, unmatched = match_lines([line], "Mercadona", items, session)
    assert matched[0].price_type == "MULTI"
    assert matched[0].unit_price == pytest.approx(0.95)
    assert matched[0].quantity == 3
    assert matched[0].line_total == pytest.approx(2.85)
```

Run: `just backend test-file tests/test_receipt_matcher.py`
Expected: FAIL (import errors — `match_lines` still uses old signature)

- [ ] **Step 2: Rewrite `backend/app/services/receipt_matcher.py`**

```python
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
```

- [ ] **Step 3: Run tests**

Run: `just backend test-file tests/test_receipt_matcher.py`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/receipt_matcher.py backend/tests/test_receipt_matcher.py
git commit -m "feat: update receipt_matcher to use ParsedLine schema with price types"
```

---

## Task 4: Rewrite receipt router

**Files:**
- Modify: `backend/app/routers/receipt.py`
- Modify: `backend/tests/test_receipt_router.py`

- [ ] **Step 1: Replace `backend/tests/test_receipt_router.py`**

```python
import pytest
from datetime import datetime

from app.db.models import List, ListItem, ListMember


LIST_ID = "list-receipt-test"


@pytest.fixture(autouse=True)
def seed_list(session, user):
    lst = List(id=LIST_ID, name="Test List", owner_id=user.id)
    member = ListMember(list_id=LIST_ID, user_id=user.id)
    item = ListItem(
        id="item-almendras",
        list_id=LIST_ID,
        name="Bebida de almendra 0% azúcares",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
    )
    session.add_all([lst, member, item])
    session.commit()


def _unit_body(store="Mercadona"):
    return {
        "store": store,
        "receipt_date": "2026-04-11",
        "receipt_total": 1.15,
        "lines": [
            {
                "name": "BEBIDA ALMENDRAS 0%",
                "price_type": "UNIT",
                "unit_price": 1.15,
                "quantity": None,
                "line_total": 1.15,
            }
        ],
    }


def test_post_receipt_returns_scan_result(client):
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert "scan_id" in body
    assert body["store"] == "Mercadona"
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"
    assert body["matched"][0]["unit_price"] == pytest.approx(1.15)
    assert body["matched"][0]["price_type"] == "UNIT"


def test_post_receipt_infers_store_when_null(client, session):
    item = session.get(ListItem, "item-almendras")
    item.price_store = "Mercadona"
    session.add(item)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={**_unit_body(), "store": None},
    )
    assert response.status_code == 200
    assert response.json()["store"] == "Mercadona"


def test_post_receipt_store_stays_null_when_items_have_mixed_stores(client, session):
    item2 = ListItem(
        id="item-bacon",
        list_id=LIST_ID,
        name="Bacon lonchas",
        added_by=session.get(ListItem, "item-almendras").added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
        price_store="Lidl",
    )
    item = session.get(ListItem, "item-almendras")
    item.price_store = "Mercadona"
    session.add_all([item, item2])
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": None,
            "receipt_date": None,
            "receipt_total": None,
            "lines": [
                {"name": "BEBIDA ALMENDRAS 0%", "price_type": "UNIT", "unit_price": 1.15, "quantity": None, "line_total": 1.15},
                {"name": "BACON LONCHAS", "price_type": "UNIT", "unit_price": 2.30, "quantity": None, "line_total": 2.30},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["store"] is None


def test_post_receipt_prices_writes_unit_price(client, session):
    scan_resp = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    scan_id = scan_resp.json()["scan_id"]

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-almendras", "price": 1.15, "price_per": None, "store": "Mercadona"}
            ],
            "mappings": [
                {
                    "store": "Mercadona",
                    "receipt_name": "bebida almendras 0%",
                    "item_name": "Bebida de almendra 0% azúcares",
                    "item_brand": None,
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["items_updated"] == 1

    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.price == pytest.approx(1.15)
    assert item.price_store == "Mercadona"
```

Run: `just backend test-file tests/test_receipt_router.py`
Expected: FAIL (router still uses multipart/OCR)

- [ ] **Step 2: Rewrite `backend/app/routers/receipt.py`**

```python
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter
from sqlmodel import select

from app.db.models import List, ListItem, ReceiptNameMapping, ReceiptScan
from app.dependencies import CurrentSession, MemberDep
from app.schemas.receipt import (
    ReceiptPriceBatch,
    ReceiptScanRequest,
    ReceiptScanResult,
)
from app.services.receipt_matcher import match_lines

router = APIRouter(tags=["receipt"])


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
def scan_receipt(
    list_id: str,
    body: ReceiptScanRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user

    stmt = select(ListItem).where(
        ListItem.list_id == list_id,
        ListItem.purchased_at.isnot(None),
    )
    purchased_items = list(session.exec(stmt).all())

    matched, unmatched = match_lines(body.lines, body.store, purchased_items, session)

    store = body.store
    if store is None and matched:
        stores = {
            item.price_store
            for m in matched
            for item in purchased_items
            if item.id == m.item_id and item.price_store
        }
        if len(stores) == 1:
            store = stores.pop()

    receipt_date: Optional[date] = None
    if body.receipt_date:
        try:
            receipt_date = date.fromisoformat(body.receipt_date)
        except ValueError:
            pass

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=store,
        receipt_date=receipt_date,
        receipt_total=body.receipt_total,
        parsed_lines=[line.model_dump() for line in body.lines],
        match_result=[m.model_dump() for m in matched],
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    return ReceiptScanResult(
        scan_id=scan.id,
        store=store,
        receipt_date=body.receipt_date,
        receipt_total=body.receipt_total,
        matched=matched,
        unmatched=unmatched,
    )


@router.post("/lists/{list_id}/receipt-prices")
def apply_receipt_prices(
    list_id: str,
    body: ReceiptPriceBatch,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updated = 0

    for patch in body.patches:
        item = session.get(ListItem, patch.item_id)
        if not item or item.list_id != list_id:
            continue
        item.price = patch.price
        item.price_per = patch.price_per
        if patch.store:
            item.price_store = patch.store
        session.add(item)
        updated += 1

    for m in body.mappings:
        stmt = select(ReceiptNameMapping).where(
            ReceiptNameMapping.store == m.store,
            ReceiptNameMapping.receipt_name == m.receipt_name,
        )
        existing = session.exec(stmt).first()
        if existing:
            existing.use_count += 1
            existing.item_name = m.item_name
            existing.item_brand = m.item_brand
            existing.confirmed_by = current_user.id
            existing.updated_at = now
            session.add(existing)
        else:
            session.add(
                ReceiptNameMapping(
                    store=m.store,
                    receipt_name=m.receipt_name,
                    item_name=m.item_name,
                    item_brand=m.item_brand,
                    confirmed_by=current_user.id,
                )
            )

    if body.scan_id:
        scan = session.get(ReceiptScan, body.scan_id)
        if scan:
            scan.items_updated = updated
            session.add(scan)

    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()
    return {"items_updated": updated}
```

- [ ] **Step 3: Run tests**

Run: `just backend test-file tests/test_receipt_router.py`
Expected: all PASS

- [ ] **Step 4: Run full backend suite**

Run: `just backend test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/receipt.py backend/tests/test_receipt_router.py
git commit -m "feat: rewrite receipt endpoint to accept JSON parsed lines with store inference"
```

---

## Task 5: Delete dead backend code

**Files:**
- Delete: `backend/app/services/receipt_ocr.py`, `receipt_parser.py`, `image_storage.py`
- Delete: `backend/tests/test_receipt_parser.py`, `test_receipt_parser_stores.py`
- Delete: `backend/tests/fixtures/receipts/`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Delete the service files**

```bash
rm backend/app/services/receipt_ocr.py
rm backend/app/services/receipt_parser.py
rm backend/app/services/image_storage.py
```

- [ ] **Step 2: Delete the parser test files and fixtures**

```bash
rm backend/tests/test_receipt_parser.py
rm backend/tests/test_receipt_parser_stores.py
rm -rf backend/tests/fixtures/receipts/
rmdir backend/tests/fixtures/ 2>/dev/null || true
```

- [ ] **Step 3: Remove unused config fields in `backend/app/core/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql://postgres:postgres@localhost:5432/carroquesi"
    firebase_credentials_path: str = "firebase-credentials.json"
    dev_auth_bypass: bool = False
    frontend_url: str = "https://carroquesi.web.app"

    model_config = {"env_file": ".env"}


settings = Settings()
```

- [ ] **Step 4: Remove GCP Python dependencies**

```bash
cd backend && uv remove google-cloud-vision google-cloud-storage
```

If a package is not listed (returns an error), skip it.

- [ ] **Step 5: Run the full backend test suite**

Run: `just backend test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add -A backend/
git commit -m "chore: delete receipt_ocr, receipt_parser, image_storage and related tests"
```

---

## Task 6: Update frontend receipt types

**Files:**
- Modify: `frontend/src/types/receipt.ts`

- [ ] **Step 1: Replace `frontend/src/types/receipt.ts`**

```typescript
export type PriceType = 'UNIT' | 'KILOGRAM' | 'MULTI'

export interface ParsedLine {
  name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface ReceiptScanRequest {
  store: string | null
  receipt_date: string | null
  receipt_total: number | null
  lines: ParsedLine[]
}

export interface MatchedLine {
  receipt_name: string
  item_id: string
  item_name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface UnmatchedLine {
  receipt_name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface ReceiptScanResult {
  scan_id: string
  store: string | null
  receipt_date: string | null
  receipt_total: number | null
  matched: MatchedLine[]
  unmatched: UnmatchedLine[]
}

export interface PricePatch {
  item_id: string
  price: number
  price_per: string | null
  store: string | null
}

export interface NameMapping {
  store: string
  receipt_name: string
  item_name: string
  item_brand: string | null
}

export interface ReceiptPriceBatch {
  scan_id: string | null
  patches: PricePatch[]
  mappings: NameMapping[]
}
```

- [ ] **Step 2: Run typecheck to surface all callsites needing updates**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS"
```

Expected: type errors in `ReceiptScanSheet.tsx` and `ListScreen.tsx` referencing the old `price`/`price_per` fields — fixed in Tasks 10–11.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/receipt.ts
git commit -m "feat: update receipt types with price_type, unit_price, line_total"
```

---

## Task 7: Initialize Firebase AI in firebase.ts

**Files:**
- Modify: `frontend/src/lib/firebase.ts`

- [ ] **Step 1: Add the `ai` export**

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getAI, GoogleAIBackend } from 'firebase/ai'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const ai = getAI(app, { backend: new GoogleAIBackend() })
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "firebase.ts"
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/firebase.ts
git commit -m "feat: export Firebase AI Logic instance"
```

---

## Task 8: Create receiptAi.ts

**Files:**
- Create: `frontend/src/lib/receiptAi.ts`

- [ ] **Step 1: Create `frontend/src/lib/receiptAi.ts`**

```typescript
import { getGenerativeModel, InferenceMode } from 'firebase/ai'
import { ai } from './firebase'
import type { ParsedLine, ReceiptScanRequest } from '../types/receipt'

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string', nullable: true },
    receipt_date: { type: 'string', nullable: true },
    receipt_total: { type: 'number', nullable: true },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price_type: { type: 'string', enum: ['UNIT', 'KILOGRAM', 'MULTI'] },
          unit_price: { type: 'number' },
          quantity: { type: 'number', nullable: true },
          line_total: { type: 'number' },
        },
        required: ['name', 'price_type', 'unit_price', 'line_total'],
      },
    },
  },
  required: ['lines'],
}

const PROMPT = `Extract structured data from this Spanish grocery receipt.

RULES:
- store: the supermarket name (e.g. "Mercadona", "Carrefour"). Return null if not clearly visible. Do not infer from product names.
- receipt_date: purchase date as YYYY-MM-DD. Return null if not clearly readable.
- receipt_total: final total charged. Return null if not clearly readable.
- lines: purchased product lines only. Omit any line where name or price is not clearly legible.
- Skip: subtotals, taxes, VAT, loyalty discounts, bag charges, cashier info, store address, payment lines.
- price_type:
  - "UNIT": single item at fixed price. unit_price = shown price. line_total = unit_price.
  - "KILOGRAM": sold by weight. unit_price = price per kg. quantity = weight in kg. line_total = unit_price x quantity.
  - "MULTI": multiple units at combined price. unit_price = line_total divided by quantity. quantity = number of units.
- Normalise product names to Spanish title case.
- CRITICAL: If any value is unclear, partially obscured, or you are not fully confident, return null or omit the line. Do not guess. Accuracy over completeness.`

const model = getGenerativeModel(ai, {
  model: 'gemini-3.5-flash',
  mode: InferenceMode.PREFER_ON_DEVICE,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: RECEIPT_SCHEMA,
  },
})

async function fileToInlinePart(file: File) {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve({ inlineData: { data: result.split(',')[1], mimeType: file.type } })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function parseReceiptWithAi(file: File): Promise<ReceiptScanRequest> {
  const filePart = await fileToInlinePart(file)
  const result = await model.generateContent([filePart, PROMPT])
  const raw = JSON.parse(result.response.text()) as {
    store?: string | null
    receipt_date?: string | null
    receipt_total?: number | null
    lines: ParsedLine[]
  }
  return {
    store: raw.store ?? null,
    receipt_date: raw.receipt_date ?? null,
    receipt_total: raw.receipt_total ?? null,
    lines: raw.lines,
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "receiptAi.ts"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/receiptAi.ts
git commit -m "feat: add receiptAi.ts — Gemini structured-output receipt parser"
```

---

## Task 9: Update api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update the import at line 2**

Change:
```typescript
import type { ReceiptPriceBatch, ReceiptScanResult } from '../types/receipt'
```
To:
```typescript
import type { ReceiptPriceBatch, ReceiptScanRequest, ReceiptScanResult } from '../types/receipt'
```

- [ ] **Step 2: Remove `apiFetchForm` (lines 16–32)**

Delete the entire `apiFetchForm` function — it has no other callers after `uploadReceipt` is removed.

- [ ] **Step 3: Replace `uploadReceipt` with `submitParsedReceipt`**

Remove:
```typescript
export function uploadReceipt(
  getToken: () => Promise<string>,
  listId: string,
  file: File,
): Promise<ReceiptScanResult> {
  const form = new FormData()
  form.append('image', file)
  return apiFetchForm(getToken, `/lists/${listId}/receipt`, form) as Promise<ReceiptScanResult>
}
```

Add:
```typescript
export function submitParsedReceipt(
  getToken: () => Promise<string>,
  listId: string,
  body: ReceiptScanRequest,
): Promise<ReceiptScanResult> {
  return apiFetch(getToken, `/lists/${listId}/receipt`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ReceiptScanResult>
}
```

Leave `submitReceiptPrices` unchanged.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "api.ts"
```

Expected: no errors on api.ts.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: replace uploadReceipt with submitParsedReceipt in api.ts"
```

---

## Task 10: Update ListScreen

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Update the receipt-related imports**

Replace:
```typescript
import {
  uploadReceipt,
  submitReceiptPrices,
} from '../lib/api'
```
With:
```typescript
import {
  submitParsedReceipt,
  submitReceiptPrices,
} from '../lib/api'
import { parseReceiptWithAi } from '../lib/receiptAi'
```

- [ ] **Step 2: Replace `handleFileChange`**

Find the existing `handleFileChange` useCallback and replace it with:

```typescript
const handleFileChange = useCallback(
  async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setToast("El archivo es demasiado grande (máx. 10 MB)");
      return;
    }
    setReceiptUploading(true);
    try {
      const parsed = await parseReceiptWithAi(file);
      const result = await submitParsedReceipt(getToken, listId, parsed);
      setReceiptScanResult(result);
    } catch {
      setToast("No se pudo leer el ticket");
    } finally {
      setReceiptUploading(false);
    }
  },
  [getToken, listId],
);
```

- [ ] **Step 3: Update the gallery file input to accept PDFs**

Find the `<input ref={fileInputRef} ...>` element (no `capture` prop) and change its `accept`:

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/*,application/pdf"
  style={{ display: "none" }}
  onChange={handleFileChange}
/>
```

Leave the camera input (`capture="environment"`) with `accept="image/*"` unchanged.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "ListScreen.tsx"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: wire up Gemini receipt parsing in ListScreen, add PDF support"
```

---

## Task 11: Update ReceiptScanSheet and tests

**Files:**
- Modify: `frontend/src/components/ReceiptScanSheet.tsx`
- Modify: `frontend/src/components/ReceiptScanSheet.test.tsx`

- [ ] **Step 1: Replace `frontend/src/components/ReceiptScanSheet.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceiptScanSheet from "./ReceiptScanSheet";
import type { ReceiptScanResult } from "../types/receipt";

const mockResult: ReceiptScanResult = {
  scan_id: "scan-1",
  store: "Mercadona",
  receipt_date: "2026-04-11",
  receipt_total: 6.45,
  matched: [
    {
      receipt_name: "BEBIDA ALMENDRAS 0%",
      item_id: "item-1",
      item_name: "Bebida de almendra 0% azúcares",
      price_type: "UNIT",
      unit_price: 1.15,
      quantity: null,
      line_total: 1.15,
    },
    {
      receipt_name: "BACON LONCHAS",
      item_id: "item-2",
      item_name: "Bacon lonchas",
      price_type: "KILOGRAM",
      unit_price: 11.40,
      quantity: 0.202,
      line_total: 2.30,
    },
    {
      receipt_name: "YOGUR NATURAL",
      item_id: "item-3",
      item_name: "Yogur natural",
      price_type: "MULTI",
      unit_price: 0.95,
      quantity: 3,
      line_total: 2.85,
    },
  ],
  unmatched: [
    {
      receipt_name: "MANI DULCE",
      price_type: "UNIT",
      unit_price: 3.15,
      quantity: null,
      line_total: 3.15,
    },
  ],
};

const mockPurchasedItems = [
  { id: "item-1", name: "Bebida de almendra 0% azúcares" },
  { id: "item-2", name: "Bacon lonchas" },
  { id: "item-3", name: "Yogur natural" },
  { id: "item-4", name: "Maní dulce" },
];

describe("ReceiptScanSheet", () => {
  it("shows store name and total", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Mercadona")).toBeInTheDocument();
    expect(screen.getByText(/6[.,]45/)).toBeInTheDocument();
  });

  it("renders matched items pre-checked", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Bebida de almendra 0% azúcares")).toBeInTheDocument();
    expect(screen.getByText("BEBIDA ALMENDRAS 0%")).toBeInTheDocument();
  });

  it("shows /kg suffix for KILOGRAM items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("/kg")).toBeInTheDocument();
  });

  it("shows weight context for KILOGRAM items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/0[.,]202\s*kg/)).toBeInTheDocument();
  });

  it("shows count context for MULTI items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/3\s*×/)).toBeInTheDocument();
  });

  it("renders unmatched items with link dropdown", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("MANI DULCE")).toBeInTheDocument();
    expect(screen.getByText("Vincular a elemento…")).toBeInTheDocument();
  });

  it("confirm button shows matched count", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/3 elementos/)).toBeInTheDocument();
  });

  it("unchecking a matched item decrements the count", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText(/2 elementos/)).toBeInTheDocument();
  });

  it("calls onConfirm with unit_price as price and KILOGRAM price_per", () => {
    const onConfirm = vi.fn();
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Guardar precios/));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [patches] = onConfirm.mock.calls[0];
    expect(patches).toHaveLength(3);

    const unit = patches.find((p: { item_id: string }) => p.item_id === "item-1");
    expect(unit.price).toBe(1.15);
    expect(unit.price_per).toBeNull();

    const kg = patches.find((p: { item_id: string }) => p.item_id === "item-2");
    expect(kg.price).toBeCloseTo(11.40);
    expect(kg.price_per).toBe("KILOGRAM");

    const multi = patches.find((p: { item_id: string }) => p.item_id === "item-3");
    expect(multi.price).toBeCloseTo(0.95);
    expect(multi.price_per).toBeNull();
  });
});
```

Run: `cd frontend && npm run test -- src/components/ReceiptScanSheet.test.tsx`
Expected: FAIL (old types in component)

- [ ] **Step 2: Replace `frontend/src/components/ReceiptScanSheet.tsx`**

```typescript
import { useState } from "react";
import type { MatchedLine, PricePatch, NameMapping, UnmatchedLine, ReceiptScanResult } from "../types/receipt";
import { formatPrice } from "../lib/formatPrice";
import "./ReceiptScanSheet.css";

interface PurchasedItemRef {
  id: string;
  name: string;
}

interface Props {
  result: ReceiptScanResult;
  purchasedItems: PurchasedItemRef[];
  store: string | null;
  onConfirm: (patches: PricePatch[], mappings: NameMapping[]) => void;
  onClose: () => void;
}

function PriceContext({ line }: { line: MatchedLine | UnmatchedLine }) {
  if (line.price_type === "KILOGRAM" && line.quantity != null) {
    return (
      <div className="item-price-context">
        {line.quantity.toLocaleString("es-ES", { maximumFractionDigits: 3 })} kg × {formatPrice(line.unit_price)}/kg
      </div>
    );
  }
  if (line.price_type === "MULTI" && line.quantity != null) {
    return (
      <div className="item-price-context">
        {line.quantity}× {formatPrice(line.unit_price)}
      </div>
    );
  }
  return null;
}

function pricePatchFor(line: MatchedLine | UnmatchedLine, itemId: string, store: string | null): PricePatch {
  return {
    item_id: itemId,
    price: line.unit_price,
    price_per: line.price_type === "KILOGRAM" ? "KILOGRAM" : null,
    store,
  };
}

export default function ReceiptScanSheet({ result, purchasedItems, store, onConfirm, onClose }: Props) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(result.matched.map((m) => m.item_id))
  );
  const [linkedItems, setLinkedItems] = useState<Record<string, string>>({});

  const toggleItem = (itemId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) { next.delete(itemId); } else { next.add(itemId); }
      return next;
    });
  };

  const confirmedMatched = result.matched.filter((m) => checkedIds.has(m.item_id));
  const confirmedLinked = Object.entries(linkedItems)
    .filter(([, itemId]) => itemId !== "")
    .map(([receiptName, itemId]) => {
      const unmatched = result.unmatched.find((u) => u.receipt_name === receiptName)!;
      const item = purchasedItems.find((i) => i.id === itemId)!;
      return { unmatched, item };
    });

  const totalCount = confirmedMatched.length + confirmedLinked.length;

  const handleConfirm = () => {
    const patches: PricePatch[] = [
      ...confirmedMatched.map((m) => pricePatchFor(m, m.item_id, store)),
      ...confirmedLinked.map(({ unmatched, item }) => pricePatchFor(unmatched, item.id, store)),
    ];

    const mappings: NameMapping[] = [
      ...confirmedMatched.map((m) => ({
        store: store ?? "",
        receipt_name: m.receipt_name.toLowerCase(),
        item_name: m.item_name,
        item_brand: null,
      })),
      ...confirmedLinked.map(({ unmatched, item }) => ({
        store: store ?? "",
        receipt_name: unmatched.receipt_name.toLowerCase(),
        item_name: item.name,
        item_brand: null,
      })),
    ].filter((m) => m.store !== "");

    onConfirm(patches, mappings);
  };

  const alreadyLinkedItemIds = new Set([
    ...confirmedMatched.map((m) => m.item_id),
    ...Object.values(linkedItems).filter(Boolean),
  ]);

  const availableItems = (receiptName: string) =>
    purchasedItems.filter(
      (i) => !alreadyLinkedItemIds.has(i.id) || linkedItems[receiptName] === i.id
    );

  const formattedDate = result.receipt_date
    ? new Date(result.receipt_date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="sheet">
      <div className="sheet-handle" />

      <div className="sheet-header">
        <div className="sheet-title-row">
          <div className="sheet-title">
            Ticket escaneado
            {store && <span className="store-badge">{store}</span>}
          </div>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="sheet-meta">
          {formattedDate && <span>📅 {formattedDate}</span>}
          {result.receipt_total != null && (
            <span>💶 {formatPrice(result.receipt_total)}</span>
          )}
        </div>
      </div>

      <div className="sheet-body">
        {result.matched.length > 0 && (
          <>
            <div className="section-label">
              Encontrados <span style={{ color: "var(--color-success)" }}>{result.matched.length}</span>
            </div>
            {result.matched.map((m) => (
              <div key={m.item_id} className="receipt-item">
                <input
                  type="checkbox"
                  checked={checkedIds.has(m.item_id)}
                  onChange={() => toggleItem(m.item_id)}
                  className="item-check"
                />
                <div className="item-body">
                  <div className="item-receipt-name">{m.receipt_name}</div>
                  <div className="item-matched-name">{m.item_name}</div>
                </div>
                <div className="item-price-col">
                  <div className="item-price">{formatPrice(m.line_total)}</div>
                  {m.price_type === "KILOGRAM" && <div className="item-price-per">/kg</div>}
                  <PriceContext line={m} />
                </div>
              </div>
            ))}
          </>
        )}

        {result.unmatched.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 16, color: "var(--color-warning)" }}>
              Sin vincular <span style={{ fontWeight: 700 }}>{result.unmatched.length}</span>
            </div>
            {result.unmatched.map((u) => (
              <div key={u.receipt_name} className="unmatched-item">
                <div className="unmatched-row">
                  <div className="unmatched-name">{u.receipt_name}</div>
                  <div className="unmatched-price">
                    {formatPrice(u.line_total)}
                    <PriceContext line={u} />
                  </div>
                </div>
                <div className="link-row">
                  <select
                    className="link-select"
                    value={linkedItems[u.receipt_name] ?? ""}
                    onChange={(e) =>
                      setLinkedItems((prev) => ({ ...prev, [u.receipt_name]: e.target.value }))
                    }
                  >
                    <option value="" disabled>Vincular a elemento…</option>
                    {availableItems(u.receipt_name).map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <button
                    className="skip-btn"
                    onClick={() => setLinkedItems((prev) => ({ ...prev, [u.receipt_name]: "" }))}
                  >
                    Omitir
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="sheet-footer">
        <button
          className="confirm-btn"
          disabled={totalCount === 0}
          onClick={handleConfirm}
        >
          Guardar precios
          <span className="confirm-count">
            {totalCount} {totalCount === 1 ? "elemento" : "elementos"}
          </span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm run test -- src/components/ReceiptScanSheet.test.tsx
```

Expected: all PASS

- [ ] **Step 4: Run full validation**

```bash
just ci
```

Expected: typecheck, lint, and backend tests all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReceiptScanSheet.tsx frontend/src/components/ReceiptScanSheet.test.tsx
git commit -m "feat: update ReceiptScanSheet for price types and raw receipt context"
```

---

## Self-Review Checklist

- [x] **Spec: Frontend Firebase AI Logic** — Task 7 (firebase.ts) + Task 8 (receiptAi.ts)
- [x] **Spec: gemini-3.5-flash + PREFER_ON_DEVICE** — Task 8, `getGenerativeModel` call
- [x] **Spec: Inline data for all files** — Task 8, `fileToInlinePart`
- [x] **Spec: Price types UNIT/KILOGRAM/MULTI** — Tasks 1, 3, 4, 11
- [x] **Spec: unit_price stored, line_total displayed** — Task 11, `pricePatchFor` + `PriceContext`
- [x] **Spec: Hallucination prevention prompt** — Task 8, `PROMPT` constant
- [x] **Spec: Store inference from matched items** — Task 4, router post-match logic
- [x] **Spec: Drop image_path + ocr_raw** — Task 2
- [x] **Spec: Delete receipt_ocr, receipt_parser, image_storage** — Task 5
- [x] **Spec: PDF support in file input** — Task 10
- [x] **Spec: receipt_matcher logic unchanged** — Task 3 (signature updated, logic preserved)
- [x] **Spec: receipt-prices endpoint unchanged** — Task 4 (copied verbatim)
- [x] **Type consistency:** `ParsedLine.unit_price` used consistently across Tasks 1, 3, 4, 8, 11; `price_type` consistent throughout
