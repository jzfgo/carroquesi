# Receipt Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable post-purchase bulk price logging by scanning or uploading a receipt image that is OCR-processed and fuzzy-matched against the list's purchased items.

**Architecture:** Backend handles all OCR (Google Cloud Vision via a provider-agnostic interface), parsing, and fuzzy matching; results are returned to a new `ReceiptScanSheet` bottom sheet for user review. Confirmed matches are written via a batch endpoint that also upserts learned name mappings to speed up future scans.

**Tech Stack:** Python 3.13, FastAPI, SQLModel, Alembic, rapidfuzz, google-cloud-vision, google-cloud-storage; React 18 / TypeScript / Vite

---

## File Map

### New backend files
- `backend/app/schemas/receipt.py` — Pydantic request/response models
- `backend/app/services/receipt_ocr.py` — `extract_text(bytes) -> str` (Cloud Vision impl)
- `backend/app/services/image_storage.py` — `store_image(bytes, user_id) -> str | None` (GCS impl)
- `backend/app/services/receipt_parser.py` — raw OCR text → `ParsedReceipt`
- `backend/app/services/receipt_matcher.py` — `ParsedReceipt` + purchased items → matched / unmatched lists
- `backend/app/routers/receipt.py` — `POST /lists/{list_id}/receipt` and `POST /lists/{list_id}/receipt-prices`
- `backend/tests/test_receipt_parser.py`
- `backend/tests/test_receipt_matcher.py`
- `backend/tests/test_receipt_router.py`

### Modified backend files
- `backend/app/db/models.py` — append `ReceiptScan` and `ReceiptNameMapping` table models
- `backend/app/core/config.py` — add `receipt_storage_bucket: str = ""`
- `backend/app/main.py` — register receipt router

### New frontend files
- `frontend/src/types/receipt.ts` — TypeScript types mirroring backend schemas
- `frontend/src/components/ReceiptScanSheet.tsx`
- `frontend/src/components/ReceiptScanSheet.test.tsx`

### Modified frontend files
- `frontend/src/components/ListActionSheet.tsx` — add "Escanear ticket" option
- `frontend/src/components/ListScreen.tsx` — empty-state CTA, sheet orchestration, upload trigger

---

### Task 1: DB Models

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Add imports at the top of models.py**

Open `backend/app/db/models.py`. After the existing imports add:

```python
from datetime import date as date_type
from sqlalchemy import UniqueConstraint
```

- [ ] **Step 2: Append the two new table models**

At the very end of `backend/app/db/models.py` append:

```python
class ReceiptScan(SQLModel, table=True):
    __tablename__ = "receipt_scans"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    scanned_by: str = Field(foreign_key="users.id")
    store: Optional[str] = None
    receipt_date: Optional[date_type] = None
    receipt_total: Optional[float] = None
    image_path: Optional[str] = None
    ocr_raw: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    parsed_lines: Optional[list] = Field(default=None, sa_column=Column(JSON))
    match_result: Optional[list] = Field(default=None, sa_column=Column(JSON))
    items_updated: int = 0
    created_at: datetime = Field(default_factory=_now)


class ReceiptNameMapping(SQLModel, table=True):
    __tablename__ = "receipt_name_mappings"
    __table_args__ = (UniqueConstraint("store", "receipt_name"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    store: str
    receipt_name: str
    item_name: str
    item_brand: Optional[str] = None
    confirmed_by: str = Field(foreign_key="users.id")
    use_count: int = 1
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
```

Note: `_uuid` and `_now` are already defined earlier in `models.py`. `Column` and `JSON` are already imported via SQLModel. `Optional` and `datetime` are already imported. Verify that `JSON` is imported from `sqlalchemy` (it is used by other models); if not, add `from sqlalchemy import Column, JSON` to the imports.

- [ ] **Step 3: Generate Alembic migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add receipt tables"
```

Find the generated file in `backend/alembic/versions/`. It will contain `op.create_table("receipt_scans", ...)` and `op.create_table("receipt_name_mappings", ...)`.

- [ ] **Step 4: Edit migration to add batch context (SQLite compat)**

The new tables are creates, not alter-column operations, so no `batch_alter_table` is needed here. Verify the generated `upgrade()` contains two `op.create_table` calls and `downgrade()` contains two `op.drop_table` calls. The file should look roughly like:

```python
def upgrade() -> None:
    op.create_table(
        "receipt_scans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("list_id", sa.String(), nullable=False),
        sa.Column("scanned_by", sa.String(), nullable=False),
        sa.Column("store", sa.String(), nullable=True),
        sa.Column("receipt_date", sa.Date(), nullable=True),
        sa.Column("receipt_total", sa.Float(), nullable=True),
        sa.Column("image_path", sa.String(), nullable=True),
        sa.Column("ocr_raw", sa.JSON(), nullable=True),
        sa.Column("parsed_lines", sa.JSON(), nullable=True),
        sa.Column("match_result", sa.JSON(), nullable=True),
        sa.Column("items_updated", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.ForeignKeyConstraint(["scanned_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "receipt_name_mappings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("store", sa.String(), nullable=False),
        sa.Column("receipt_name", sa.String(), nullable=False),
        sa.Column("item_name", sa.String(), nullable=False),
        sa.Column("item_brand", sa.String(), nullable=True),
        sa.Column("confirmed_by", sa.String(), nullable=False),
        sa.Column("use_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("store", "receipt_name"),
    )


def downgrade() -> None:
    op.drop_table("receipt_name_mappings")
    op.drop_table("receipt_scans")
```

- [ ] **Step 5: Run migration against local DB**

```bash
cd backend && uv run alembic upgrade head
```

Expected: two new tables created, no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models.py backend/alembic/versions/
git commit -m "feat: add receipt_scans and receipt_name_mappings DB models"
```

---

### Task 2: Config + Pydantic Schemas

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/schemas/receipt.py`

- [ ] **Step 1: Add receipt_storage_bucket to Settings**

In `backend/app/core/config.py`, add inside the `Settings` class (after `dev_auth_bypass`):

```python
receipt_storage_bucket: str = ""
```

- [ ] **Step 2: Create schemas/receipt.py**

Create `backend/app/schemas/receipt.py`:

```python
from typing import Optional
from pydantic import BaseModel


class MatchedLine(BaseModel):
    receipt_name: str
    item_id: str
    item_name: str
    price: float
    price_per: Optional[str] = None


class UnmatchedLine(BaseModel):
    receipt_name: str
    price: float
    price_per: Optional[str] = None


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

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/config.py backend/app/schemas/receipt.py
git commit -m "feat: add receipt config setting and Pydantic schemas"
```

---

### Task 3: OCR and Image Storage Services

**Files:**
- Create: `backend/app/services/receipt_ocr.py`
- Create: `backend/app/services/image_storage.py`

These services are thin wrappers. In tests they will be mocked entirely; no unit tests are needed for the wrappers themselves.

- [ ] **Step 1: Add dependencies**

```bash
cd backend && uv add rapidfuzz google-cloud-vision google-cloud-storage
```

Expected: `pyproject.toml` and `uv.lock` updated.

- [ ] **Step 2: Create receipt_ocr.py**

Create `backend/app/services/receipt_ocr.py`:

```python
from google.cloud import vision


def extract_text(image_bytes: bytes) -> str:
    """Call Cloud Vision document_text_detection and return full plain text."""
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)
    if response.error.message:
        raise RuntimeError(f"OCR error: {response.error.message}")
    annotation = response.full_text_annotation
    return annotation.text if annotation else ""
```

- [ ] **Step 3: Create image_storage.py**

Create `backend/app/services/image_storage.py`:

```python
import time
from google.cloud import storage as gcs

from app.core.config import settings


def store_image(image_bytes: bytes, user_id: str) -> str | None:
    """Upload image to object storage. Returns the storage path, or None if storage is not configured."""
    if not settings.receipt_storage_bucket:
        return None
    client = gcs.Client()
    bucket = client.bucket(settings.receipt_storage_bucket)
    path = f"receipts/{user_id}/{int(time.time() * 1000)}.jpg"
    blob = bucket.blob(path)
    blob.upload_from_string(image_bytes, content_type="image/jpeg")
    return path
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/receipt_ocr.py backend/app/services/image_storage.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add receipt OCR and image storage service wrappers"
```

---

### Task 4: Receipt Parser

**Files:**
- Create: `backend/app/services/receipt_parser.py`
- Create: `backend/tests/test_receipt_parser.py`

The parser converts raw OCR text into structured `ParsedLine` items. It detects the store from the first few lines, then applies store-specific extraction rules; unknown stores fall through to a generic line-ending pattern.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_receipt_parser.py`:

```python
import pytest
from app.services.receipt_parser import parse_receipt, ParsedLine, ParsedReceipt


MERCADONA_OCR = """MERCADONA, S.A.
C/ EJEMPLO 1, MADRID
11/04/2026 15:57

Descripcion           Importe
BEBIDA ALMENDRAS 0%      1,15
QUESO GOUDA LONCHAS      2,15
BACON LONCHAS            5,29
   2,3 kg x 2,30 EUR/kg
2 BOLSA PLASTICO         0,30
MANI DULCE               3,15

TOTAL                   12,04
Tarjeta bancaria        12,04
IVA  10%  base  10,00   1,04
"""

AHORRAMAS_OCR = """AHORRAMAS
C/ EJEMPLO 2, MADRID
12/04/2026 10:30

LECHE ENTERA 1L    A  0,89
PAN DE MOLDE       B  1,25
ACEITE OLIVA 1L    A  4,50

TOTAL              6,64
"""

GENERIC_OCR = """SUPERMERCADO BM
Calle Mayor 5

Yogur natural    0,75
Mantequilla      1,30
Cereales muesli  2,45

Total            4,50
"""


def test_mercadona_store_detected():
    result = parse_receipt(MERCADONA_OCR)
    assert result.store == "Mercadona"


def test_mercadona_date_detected():
    result = parse_receipt(MERCADONA_OCR)
    from datetime import date
    assert result.receipt_date == date(2026, 4, 11)


def test_mercadona_total_detected():
    result = parse_receipt(MERCADONA_OCR)
    assert result.receipt_total == pytest.approx(12.04)


def test_mercadona_items_parsed():
    result = parse_receipt(MERCADONA_OCR)
    names = [l.name for l in result.lines]
    assert "BEBIDA ALMENDRAS 0%" in names
    assert "QUESO GOUDA LONCHAS" in names
    assert "MANI DULCE" in names


def test_mercadona_non_items_excluded():
    result = parse_receipt(MERCADONA_OCR)
    names = [l.name for l in result.lines]
    assert not any("TOTAL" in n for n in names)
    assert not any("IVA" in n for n in names)
    assert not any("Tarjeta" in n for n in names)


def test_mercadona_weight_item():
    result = parse_receipt(MERCADONA_OCR)
    bacon = next(l for l in result.lines if "BACON" in l.name)
    assert bacon.price_per == "KILOGRAM"
    assert bacon.price == pytest.approx(2.30)


def test_mercadona_quantity_prefix_stripped():
    result = parse_receipt(MERCADONA_OCR)
    bolsa = next(l for l in result.lines if "BOLSA" in l.name)
    assert bolsa.name == "2 BOLSA PLASTICO"


def test_ahorramas_store_detected():
    result = parse_receipt(AHORRAMAS_OCR)
    assert result.store == "Ahorramas"


def test_ahorramas_items_parsed():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert "LECHE ENTERA 1L" in names
    assert "PAN DE MOLDE" in names


def test_ahorramas_non_items_excluded():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert not any("TOTAL" in n for n in names)


def test_generic_fallback_items_parsed():
    result = parse_receipt(GENERIC_OCR)
    names = [l.name for l in result.lines]
    assert "Yogur natural" in names
    assert "Mantequilla" in names
    assert "Cereales muesli" in names


def test_generic_fallback_total_excluded():
    result = parse_receipt(GENERIC_OCR)
    names = [l.name for l in result.lines]
    assert not any("Total" in n for n in names)


def test_price_parsed_as_float():
    result = parse_receipt(MERCADONA_OCR)
    almendras = next(l for l in result.lines if "ALMENDRAS" in l.name)
    assert almendras.price == pytest.approx(1.15)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_receipt_parser.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError` or `ImportError` — `receipt_parser` doesn't exist yet.

- [ ] **Step 3: Create receipt_parser.py**

Create `backend/app/services/receipt_parser.py`:

```python
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class ParsedLine:
    name: str
    price: float
    price_per: Optional[str] = None
    quantity: Optional[str] = None


@dataclass
class ParsedReceipt:
    store: Optional[str]
    receipt_date: Optional[date]
    receipt_total: Optional[float]
    lines: list[ParsedLine] = field(default_factory=list)


def _parse_price(text: str) -> Optional[float]:
    text = text.strip().replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(text: str) -> Optional[date]:
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def _detect_store(lines: list[str]) -> Optional[str]:
    header = " ".join(lines[:4]).upper()
    if "MERCADONA" in header:
        return "Mercadona"
    if "AHORRAMAS" in header:
        return "Ahorramas"
    return None


def _parse_mercadona(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    in_items = False
    skip_next = False

    for i, line in enumerate(lines):
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.search(r"Descripci", line, re.IGNORECASE):
            in_items = True
            continue

        if re.match(r"\s*TOTAL\b", line, re.IGNORECASE):
            m = re.search(r"(\d+[,\.]\d+)\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            in_items = False
            continue

        if not in_items:
            continue

        if skip_next:
            skip_next = False
            continue

        # Weight line: "   2,3 kg x 2,30 EUR/kg" — modifies the previous item
        kg_match = re.match(r"^\s*\d+[,\.]\d+\s*kg\s+[\d,\.]+\s*[xX×]\s*([\d,\.]+)", line, re.IGNORECASE)
        if kg_match and items:
            unit_price = _parse_price(kg_match.group(1))
            if unit_price is not None:
                items[-1].price = unit_price
                items[-1].price_per = "KILOGRAM"
            continue

        # Standard item line: "ITEM NAME    price"
        m = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None and not re.match(r"(IVA|TIPO|Tarjeta|EFECTIVO|CAMBIO)", name, re.IGNORECASE):
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def _parse_ahorramas(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        if re.match(r"\s*TOTAL\b", line, re.IGNORECASE):
            m = re.search(r"([\d,\.]+)\s*$", line)
            if m:
                receipt_total = _parse_price(m.group(1))
            continue

        # Ahorramas item: "ITEM NAME    [A|B|C]  price"
        m = re.match(r"^(.+?)\s+[ABC]\s+([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None:
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def _parse_generic(lines: list[str]) -> tuple[list[ParsedLine], Optional[date], Optional[float]]:
    receipt_date: Optional[date] = None
    receipt_total: Optional[float] = None
    items: list[ParsedLine] = []

    for line in lines:
        if receipt_date is None:
            d = _parse_date(line)
            if d:
                receipt_date = d

        # Skip obvious non-item lines
        if re.match(r"\s*(TOTAL|Total|IVA|Tarjeta|EFECTIVO)", line):
            m = re.search(r"([\d,\.]+)\s*$", line)
            if re.match(r"\s*(TOTAL|Total)\b", line) and m:
                receipt_total = _parse_price(m.group(1))
            continue

        # Generic: line ending with whitespace then a decimal number
        m = re.match(r"^(.+?)\s{2,}([\d,\.]+)\s*$", line)
        if m:
            name = m.group(1).strip()
            price = _parse_price(m.group(2))
            if price is not None and len(name) > 1:
                items.append(ParsedLine(name=name, price=price))

    return items, receipt_date, receipt_total


def parse_receipt(ocr_text: str) -> ParsedReceipt:
    lines = ocr_text.splitlines()
    store = _detect_store(lines)

    if store == "Mercadona":
        items, receipt_date, receipt_total = _parse_mercadona(lines)
    elif store == "Ahorramas":
        items, receipt_date, receipt_total = _parse_ahorramas(lines)
    else:
        items, receipt_date, receipt_total = _parse_generic(lines)

    return ParsedReceipt(
        store=store,
        receipt_date=receipt_date,
        receipt_total=receipt_total,
        lines=items,
    )
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_receipt_parser.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/receipt_parser.py backend/tests/test_receipt_parser.py
git commit -m "feat: add receipt parser with Mercadona, Ahorramas, and generic fallback"
```

---

### Task 5: Receipt Matcher

**Files:**
- Create: `backend/app/services/receipt_matcher.py`
- Create: `backend/tests/test_receipt_matcher.py`

The matcher normalises OCR names, checks learned mappings first, then falls back to rapidfuzz.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_receipt_matcher.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.services.receipt_matcher import normalise, match_lines
from app.services.receipt_parser import ParsedLine, ParsedReceipt
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


def _item(item_id: str, name: str) -> ListItem:
    return ListItem(
        id=item_id,
        list_id="list-1",
        name=name,
        added_by="user-1",
    )


def test_normalise_lowercases():
    assert normalise("BEBIDA ALMENDRAS") == "bebida almendras"


def test_normalise_strips_accents():
    assert normalise("Bebída") == "bebida"


def test_normalise_strips_leading_quantity():
    assert normalise("2 BOLSA PLASTICO") == "bolsa plastico"


def test_normalise_collapses_whitespace():
    assert normalise("  pan   de  molde  ") == "pan de molde"


def test_match_via_fuzzy(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="BEBIDA ALMENDRAS 0%", price=1.15)],
    )
    items = [_item("item-1", "Bebida de almendra 0% azúcares")]
    matched, unmatched = match_lines(parsed, items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].price == pytest.approx(1.15)
    assert len(unmatched) == 0


def test_unmatched_when_score_too_low(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="XXXXXX ZZZZ", price=9.99)],
    )
    items = [_item("item-1", "Bebida de almendra")]
    matched, unmatched = match_lines(parsed, items, session)
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

    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="MANI DULCE", price=3.15)],
    )
    items = [
        _item("item-1", "Maní dulce"),
        _item("item-2", "Frutos secos mix"),
    ]
    matched, unmatched = match_lines(parsed, items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].item_name == "Maní dulce"


def test_weight_item_price_per_preserved(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="BACON LONCHAS", price=2.30, price_per="KILOGRAM")],
    )
    items = [_item("item-1", "Bacon lonchas")]
    matched, unmatched = match_lines(parsed, items, session)
    assert matched[0].price_per == "KILOGRAM"
    assert matched[0].price == pytest.approx(2.30)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_receipt_matcher.py -v 2>&1 | head -20
```

Expected: `ImportError` — `receipt_matcher` doesn't exist yet.

- [ ] **Step 3: Create receipt_matcher.py**

Create `backend/app/services/receipt_matcher.py`:

```python
import re
import unicodedata
from typing import Optional

from rapidfuzz import fuzz
from sqlmodel import Session, select

from app.db.models import ListItem, ReceiptNameMapping
from app.schemas.receipt import MatchedLine, UnmatchedLine
from app.services.receipt_parser import ParsedReceipt

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
    parsed: ParsedReceipt,
    purchased_items: list[ListItem],
    session: Session,
) -> tuple[list[MatchedLine], list[UnmatchedLine]]:
    matched: list[MatchedLine] = []
    unmatched: list[UnmatchedLine] = []

    item_by_name: dict[str, ListItem] = {i.name: i for i in purchased_items}

    for line in parsed.lines:
        norm = normalise(line.name)

        # 1. Learned mapping lookup
        mapping = _lookup_mapping(parsed.store, norm, session)
        if mapping:
            item = item_by_name.get(mapping.item_name)
            if item:
                matched.append(
                    MatchedLine(
                        receipt_name=line.name,
                        item_id=item.id,
                        item_name=item.name,
                        price=line.price,
                        price_per=line.price_per,
                    )
                )
                continue

        # 2. Fuzzy fallback
        best_score = 0
        best_item: Optional[ListItem] = None
        for item in purchased_items:
            score = fuzz.token_sort_ratio(norm, normalise(item.name))
            if score > best_score:
                best_score = score
                best_item = item

        if best_score >= MATCH_THRESHOLD and best_item:
            matched.append(
                MatchedLine(
                    receipt_name=line.name,
                    item_id=best_item.id,
                    item_name=best_item.name,
                    price=line.price,
                    price_per=line.price_per,
                )
            )
        else:
            unmatched.append(
                UnmatchedLine(
                    receipt_name=line.name,
                    price=line.price,
                    price_per=line.price_per,
                )
            )

    return matched, unmatched
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_receipt_matcher.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/receipt_matcher.py backend/tests/test_receipt_matcher.py
git commit -m "feat: add receipt matcher with learned-mapping lookup and rapidfuzz fallback"
```

---

### Task 6: Receipt Router

**Files:**
- Create: `backend/app/routers/receipt.py`
- Create: `backend/tests/test_receipt_router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/test_receipt_router.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool
import io

from app.main import app
from app.db.session import get_session
from app.db.models import User, List, ListMember, ListItem
from app.dependencies import get_current_user


LIST_ID = "list-receipt-test"
USER_ID = "user-receipt-test"


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(id=USER_ID, firebase_uid="fb-uid", email="test@test.com", display_name="Test")
        lst = List(id=LIST_ID, name="Test List", owner_id=USER_ID)
        member = ListMember(list_id=LIST_ID, user_id=USER_ID)
        item = ListItem(
            id="item-almendras",
            list_id=LIST_ID,
            name="Bebida de almendra 0% azúcares",
            added_by=USER_ID,
            purchased_at="2026-04-11T15:57:00",
        )
        session.add_all([user, lst, member, item])
        session.commit()
        yield session


@pytest.fixture(name="client")
def client_fixture(session):
    def override_session():
        yield session

    def override_auth():
        return session.get(User, USER_ID)

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = override_auth
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


FAKE_OCR_TEXT = """MERCADONA, S.A.
11/04/2026 15:57

Descripcion           Importe
BEBIDA ALMENDRAS 0%      1,15

TOTAL                    1,15
"""


def test_post_receipt_returns_scan_result(client):
    with patch("app.routers.receipt.extract_text", return_value=FAKE_OCR_TEXT), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"fake-image-bytes")
        response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("receipt.jpg", image_data, "image/jpeg")},
        )
    assert response.status_code == 200
    body = response.json()
    assert "scan_id" in body
    assert body["store"] == "Mercadona"
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"
    assert body["matched"][0]["price"] == pytest.approx(1.15)


def test_post_receipt_422_when_no_text(client):
    with patch("app.routers.receipt.extract_text", return_value=""), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"blank")
        response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("blank.jpg", image_data, "image/jpeg")},
        )
    assert response.status_code == 422


def test_post_receipt_prices_writes_price(client, session):
    # First create a scan row
    with patch("app.routers.receipt.extract_text", return_value=FAKE_OCR_TEXT), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"fake-image-bytes")
        scan_response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("receipt.jpg", image_data, "image/jpeg")},
        )
    scan_id = scan_response.json()["scan_id"]

    # Now confirm prices
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-almendras", "price": 1.15, "price_per": None, "store": "Mercadona"}
            ],
            "mappings": [
                {"store": "Mercadona", "receipt_name": "bebida almendras 0%", "item_name": "Bebida de almendra 0% azúcares", "item_brand": None}
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["items_updated"] == 1

    # Verify price was written
    item = session.get(ListItem, "item-almendras")
    assert item.price == pytest.approx(1.15)
    assert item.price_store == "Mercadona"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_receipt_router.py -v 2>&1 | head -20
```

Expected: `ImportError` or 404 — router doesn't exist yet.

- [ ] **Step 3: Create routers/receipt.py**

Create `backend/app/routers/receipt.py`:

```python
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select

from app.db.models import List, ListItem, ReceiptNameMapping, ReceiptScan
from app.db.session import get_session
from app.dependencies import get_current_user, require_member
from app.schemas.receipt import (
    MatchedLine,
    NameMappingCreate,
    ReceiptPriceBatch,
    ReceiptScanResult,
)
from app.services.image_storage import store_image
from app.services.receipt_matcher import match_lines
from app.services.receipt_ocr import extract_text
from app.services.receipt_parser import parse_receipt

router = APIRouter(tags=["receipt"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
async def scan_receipt(
    list_id: str,
    image: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
    _member=Depends(require_member),
):
    image_bytes = await image.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="Image too large (max 10 MB)")

    image_path: Optional[str] = store_image(image_bytes, current_user.id)

    ocr_text = extract_text(image_bytes)
    if not ocr_text.strip():
        raise HTTPException(status_code=422, detail="No se pudo leer el ticket")

    parsed = parse_receipt(ocr_text)

    stmt = select(ListItem).where(
        ListItem.list_id == list_id,
        ListItem.purchased_at.isnot(None),
    )
    purchased_items = list(session.exec(stmt).all())

    matched, unmatched = match_lines(parsed, purchased_items, session)

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=parsed.store,
        receipt_date=parsed.receipt_date,
        receipt_total=parsed.receipt_total,
        image_path=image_path,
        ocr_raw={"text": ocr_text},
        parsed_lines=[
            {"name": l.name, "price": l.price, "price_per": l.price_per}
            for l in parsed.lines
        ],
        match_result=[
            {"receipt_name": m.receipt_name, "matched_item_id": m.item_id, "confidence": 100}
            for m in matched
        ],
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    receipt_date_str = parsed.receipt_date.isoformat() if parsed.receipt_date else None

    return ReceiptScanResult(
        scan_id=scan.id,
        store=parsed.store,
        receipt_date=receipt_date_str,
        receipt_total=parsed.receipt_total,
        matched=matched,
        unmatched=unmatched,
    )


@router.post("/lists/{list_id}/receipt-prices")
def apply_receipt_prices(
    list_id: str,
    body: ReceiptPriceBatch,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
    _member=Depends(require_member),
):
    now = datetime.now(timezone.utc)
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

    # Upsert learned name mappings
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

    # Update scan row
    if body.scan_id:
        scan = session.get(ReceiptScan, body.scan_id)
        if scan:
            scan.items_updated = updated
            session.add(scan)

    # Bump list updated_at
    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()

    return {"items_updated": updated}
```

- [ ] **Step 4: Register router in main.py**

Open `backend/app/main.py`. Find the section where other routers are imported and included. Add:

```python
from app.routers import receipt
```

And in the router registration section:

```python
app.include_router(receipt.router)
```

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && uv run pytest tests/test_receipt_router.py tests/test_receipt_parser.py tests/test_receipt_matcher.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd backend && uv run pytest
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/receipt.py backend/tests/test_receipt_router.py backend/app/main.py
git commit -m "feat: add receipt scan and receipt-prices endpoints"
```

---

### Task 7: ReceiptScanSheet Component

**Files:**
- Create: `frontend/src/types/receipt.ts`
- Create: `frontend/src/components/ReceiptScanSheet.tsx`
- Create: `frontend/src/components/ReceiptScanSheet.test.tsx`

- [ ] **Step 1: Create TypeScript types**

Create `frontend/src/types/receipt.ts`:

```typescript
export interface MatchedLine {
  receipt_name: string;
  item_id: string;
  item_name: string;
  price: number;
  price_per: string | null;
}

export interface UnmatchedLine {
  receipt_name: string;
  price: number;
  price_per: string | null;
}

export interface ReceiptScanResult {
  scan_id: string;
  store: string | null;
  receipt_date: string | null;
  receipt_total: number | null;
  matched: MatchedLine[];
  unmatched: UnmatchedLine[];
}

export interface PricePatch {
  item_id: string;
  price: number;
  price_per: string | null;
  store: string | null;
}

export interface NameMapping {
  store: string;
  receipt_name: string;
  item_name: string;
  item_brand: string | null;
}

export interface ReceiptPriceBatch {
  scan_id: string | null;
  patches: PricePatch[];
  mappings: NameMapping[];
}
```

- [ ] **Step 2: Write failing component tests**

Create `frontend/src/components/ReceiptScanSheet.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceiptScanSheet from "./ReceiptScanSheet";
import { ReceiptScanResult } from "../types/receipt";

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
      price: 1.15,
      price_per: null,
    },
    {
      receipt_name: "BACON LONCHAS",
      item_id: "item-2",
      item_name: "Bacon lonchas",
      price: 2.30,
      price_per: "KILOGRAM",
    },
  ],
  unmatched: [
    { receipt_name: "MANI DULCE", price: 3.15, price_per: null },
  ],
};

const mockPurchasedItems = [
  { id: "item-1", name: "Bebida de almendra 0% azúcares" },
  { id: "item-2", name: "Bacon lonchas" },
  { id: "item-3", name: "Maní dulce" },
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
    expect(screen.getByText(/6,45/)).toBeInTheDocument();
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

  it("shows /kg suffix for weight items", () => {
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
    expect(screen.getByText(/2 elementos/)).toBeInTheDocument();
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
    expect(screen.getByText(/1 elemento/)).toBeInTheDocument();
  });

  it("calls onConfirm with patches and mappings", () => {
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
    const [patches, mappings] = onConfirm.mock.calls[0];
    expect(patches).toHaveLength(2);
    expect(patches[0].item_id).toBe("item-1");
    expect(patches[0].price).toBe(1.15);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/components/ReceiptScanSheet.test.tsx 2>&1 | head -20
```

Expected: `Cannot find module './ReceiptScanSheet'`

- [ ] **Step 4: Create ReceiptScanSheet.tsx**

Create `frontend/src/components/ReceiptScanSheet.tsx`:

```typescript
import { useState } from "react";
import { MatchedLine, ReceiptScanResult, PricePatch, NameMapping } from "../types/receipt";
import { formatPrice } from "../lib/formatPrice";

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

export default function ReceiptScanSheet({ result, purchasedItems, store, onConfirm, onClose }: Props) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(result.matched.map((m) => m.item_id))
  );
  const [linkedItems, setLinkedItems] = useState<Record<string, string>>({});

  const toggleItem = (itemId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
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
      ...confirmedMatched.map((m) => ({
        item_id: m.item_id,
        price: m.price,
        price_per: m.price_per,
        store: store,
      })),
      ...confirmedLinked.map(({ unmatched, item }) => ({
        item_id: item.id,
        price: unmatched.price,
        price_per: unmatched.price_per,
        store: store,
      })),
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
              <div key={m.item_id} className="receipt-item" onClick={() => toggleItem(m.item_id)}>
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
                  <div className="item-price">{formatPrice(m.price)}</div>
                  {m.price_per === "KILOGRAM" && <div className="item-price-per">/kg</div>}
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
                  <div className="unmatched-price">{formatPrice(u.price)}</div>
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

- [ ] **Step 5: Run component tests**

```bash
cd frontend && npm run test -- src/components/ReceiptScanSheet.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/receipt.ts frontend/src/components/ReceiptScanSheet.tsx frontend/src/components/ReceiptScanSheet.test.tsx
git commit -m "feat: add ReceiptScanSheet component and TypeScript types"
```

---

### Task 8: Frontend Integration

**Files:**
- Modify: `frontend/src/components/ListActionSheet.tsx`
- Modify: `frontend/src/components/ListScreen.tsx`

Before editing, read both files in full to understand their current prop interfaces, state shape, and JSX structure.

- [ ] **Step 1: Add onScanReceipt prop to ListActionSheet**

Open `frontend/src/components/ListActionSheet.tsx`. Add `onScanReceipt: () => void` to the props interface. Add a new button before the rename/delete section:

```typescript
<button className="action-sheet-item" onClick={() => { onScanReceipt(); onClose(); }}>
  🧾 Escanear ticket
</button>
```

Place it above any destructive actions (rename, delete list).

Update the component's prop type and any call sites if TypeScript requires it (there should be one call site in `ListScreen.tsx`).

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Fix any type errors before continuing.

- [ ] **Step 3: Add receipt scan state and handlers to ListScreen**

Open `frontend/src/components/ListScreen.tsx`. Add the following imports at the top:

```typescript
import ReceiptScanSheet from "./ReceiptScanSheet";
import { ReceiptScanResult, PricePatch, NameMapping } from "../types/receipt";
```

Add state variables inside the component (alongside existing state):

```typescript
const [receiptScanResult, setReceiptScanResult] = useState<ReceiptScanResult | null>(null);
const [receiptUploading, setReceiptUploading] = useState(false);
```

Add the trigger function (triggers a hidden file input):

```typescript
const triggerReceiptScan = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      // toast: "La imagen es demasiado grande (máx. 10 MB)"
      return;
    }
    setReceiptUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/lists/${listId}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getToken()}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      setReceiptScanResult(await res.json());
    } catch {
      // toast: "No se pudo leer el ticket"
    } finally {
      setReceiptUploading(false);
    }
  };
  input.click();
};
```

Replace `getToken()` with however the existing code retrieves the Firebase auth token (look for the existing pattern — typically `auth.currentUser?.getIdToken()`). Replace `API_BASE` with the existing API base URL constant.

Add the confirm handler:

```typescript
const handleReceiptConfirm = async (patches: PricePatch[], mappings: NameMapping[]) => {
  if (!receiptScanResult) return;
  try {
    const res = await fetch(`${API_BASE}/lists/${listId}/receipt-prices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scan_id: receiptScanResult.scan_id,
        patches,
        mappings,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { items_updated } = await res.json();
    setReceiptScanResult(null);
    // toast: `${items_updated} precios actualizados`
  } catch {
    // toast: error
  }
};
```

- [ ] **Step 4: Add empty-state CTA**

Find the section in `ListScreen.tsx` where the empty unpurchased state is shown (when all items are checked off). Add below the mascot/empty-state card:

```typescript
{allPurchasedCount > 0 && unpurchasedItems.length === 0 && (
  <button
    className="receipt-scan-cta"
    onClick={triggerReceiptScan}
    disabled={receiptUploading}
  >
    {receiptUploading ? "Escaneando…" : "🧾 Escanear ticket para registrar precios"}
  </button>
)}
```

Adapt `allPurchasedCount` and `unpurchasedItems` to match the actual variable names in `ListScreen.tsx`.

- [ ] **Step 5: Pass onScanReceipt to ListActionSheet**

Find the `<ListActionSheet` JSX in `ListScreen.tsx` and add:

```typescript
onScanReceipt={triggerReceiptScan}
```

- [ ] **Step 6: Render ReceiptScanSheet conditionally**

Find where other bottom sheets (e.g., `LogPriceSheet`, `ItemActionSheet`) are rendered in `ListScreen.tsx` and add:

```typescript
{receiptScanResult && (
  <ReceiptScanSheet
    result={receiptScanResult}
    purchasedItems={items
      .filter((i) => i.purchased)
      .map((i) => ({ id: i.id, name: i.name }))}
    store={receiptScanResult.store}
    onConfirm={handleReceiptConfirm}
    onClose={() => setReceiptScanResult(null)}
  />
)}
```

- [ ] **Step 7: Run typecheck and lint**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run lint
```

Fix any errors.

- [ ] **Step 8: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass (existing tests unaffected).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ListActionSheet.tsx frontend/src/components/ListScreen.tsx
git commit -m "feat: wire receipt scanning entry points and ReceiptScanSheet into ListScreen"
```

---

### Task 9: Final Validation

- [ ] **Step 1: Run full CI check**

```bash
just ci
```

Expected: frontend typecheck + lint + backend tests all pass.

- [ ] **Step 2: Update CLAUDE.md**

Add a brief entry to the `backend/` project layout section noting the new modules:

```
│   ├── routers/
│   │   └── receipt.py       # POST /lists/{id}/receipt, POST /lists/{id}/receipt-prices
│   ├── schemas/
│   │   └── receipt.py       # ReceiptScanResult, ReceiptPriceBatch
│   ├── services/
│   │   ├── receipt_ocr.py      # extract_text(bytes) -> str
│   │   ├── image_storage.py    # store_image(bytes, user_id) -> str | None
│   │   ├── receipt_parser.py   # parse_receipt(text) -> ParsedReceipt
│   │   └── receipt_matcher.py  # match_lines(...) -> matched, unmatched
```

Also add `receipt_storage_bucket` to the environment variables section.

- [ ] **Step 3: Remove receipt scanning entry from TODO.md**

The `**Receipt scanning (OCR)**` line in `TODO.md` ships with this feature. Remove it. Keep the `**Receipt scanning — list seeding**` line (still open).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md TODO.md
git commit -m "chore: update CLAUDE.md and TODO for receipt scanning"
```

