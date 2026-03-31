# Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to scan a product barcode from the SmartInputBar, look up the product via a backend-cached Open Food Facts call, and confirm or edit the result before adding it to the list.

**Architecture:** `@undecaf/barcode-detector-polyfill` handles camera scanning in a full-screen overlay; on detection the frontend calls `GET /barcode/{ean}` on the FastAPI backend, which checks a `barcode_cache` table first and calls Open Food Facts on a miss. A confirmation sheet lets the user add directly or pre-fill the SmartInputBar for editing.

**Tech Stack:** Python `httpx` (backend OFF calls), `pytest-httpx` (test mocking), `@undecaf/barcode-detector-polyfill` (frontend scanning), React + TypeScript, SQLModel, Alembic.

---

## File Map

**Backend — new files:**
- `backend/app/schemas/barcode.py` — `BarcodeRead` Pydantic response model
- `backend/app/routers/barcode.py` — `GET /barcode/{ean}` endpoint
- `backend/tests/test_barcode.py` — endpoint tests

**Backend — modified files:**
- `backend/app/db/models.py` — add `BarcodeCache` SQLModel table
- `backend/app/main.py` — register barcode router
- `backend/tests/conftest.py` — add barcode router to test app
- `backend/alembic/versions/` — new migration file (generated)

**Frontend — new files:**
- `frontend/src/components/BarcodeScanner.tsx` — camera overlay component
- `frontend/src/components/BarcodeScanner.css` — overlay styles
- `frontend/src/components/BarcodeScanner.test.tsx` — scanner tests
- `frontend/src/components/BarcodeScanSheet.tsx` — confirmation sheet component
- `frontend/src/components/BarcodeScanSheet.css` — sheet styles
- `frontend/src/components/BarcodeScanSheet.test.tsx` — sheet tests

**Frontend — modified files:**
- `frontend/src/types.ts` — add `BarcodeRead` interface
- `frontend/src/lib/api.ts` — add `getBarcode` function
- `frontend/src/components/SmartInputBar.tsx` — add scan button + `onScanRequest` prop
- `frontend/src/components/SmartInputBar.css` — scan button styles
- `frontend/src/components/ListScreen.tsx` — scanner/sheet state management

---

## Task 1: Backend — BarcodeCache model + httpx dependency

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Add `httpx` to backend dependencies**

```bash
cd backend && uv add httpx
```

Expected: `httpx` appears in `pyproject.toml` dependencies.

- [ ] **Step 2: Add `BarcodeCache` model to `backend/app/db/models.py`**

Add after the `ListInvite` class:

```python
class BarcodeCache(SQLModel, table=True):
    __tablename__ = "barcode_cache"

    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    name: str
    brand: Optional[str] = None
    stores: Optional[str] = None  # nullable comma-separated, e.g. "Mercadona,Alcampo"
    created_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 3: Verify the model is importable**

```bash
cd backend && uv run python -c "from app.db.models import BarcodeCache; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/models.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add BarcodeCache model and httpx dependency"
```

---

## Task 2: Backend — BarcodeRead schema

**Files:**
- Create: `backend/app/schemas/barcode.py`

- [ ] **Step 1: Create the schema file**

```python
# backend/app/schemas/barcode.py
from pydantic import BaseModel


class BarcodeRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]  # parsed from comma-separated DB field; [] if None
```

- [ ] **Step 2: Verify it is importable**

```bash
cd backend && uv run python -c "from app.schemas.barcode import BarcodeRead; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/barcode.py
git commit -m "feat: add BarcodeRead schema"
```

---

## Task 3: Backend — Failing tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_barcode.py`

- [ ] **Step 1: Add `pytest-httpx` dev dependency**

```bash
cd backend && uv add --dev pytest-httpx
```

- [ ] **Step 2: Update `backend/tests/conftest.py` to include the barcode router**

Change the import line:
```python
from app.routers import auth, invites, items, lists, members, suggestions
```
to:
```python
from app.routers import auth, barcode, invites, items, lists, members, suggestions
```

Add `test_app.include_router(barcode.router)` after `test_app.include_router(suggestions.router)`:
```python
    test_app.include_router(suggestions.router)
    test_app.include_router(barcode.router)
```

- [ ] **Step 3: Create `backend/tests/test_barcode.py`**

```python
from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock


OFF_MAHOU = {
    "status": 1,
    "product": {
        "product_name_es": "Cerveza especial",
        "product_name": "Mahou 5 Estrellas",
        "brands": "Mahou",
        "stores": "Mercadona,Alcampo",
    },
}

OFF_NO_ES_NAME = {
    "status": 1,
    "product": {
        "product_name_es": "",
        "product_name": "Generic Beer",
        "brands": "NoBrand,OtherBrand",
        "stores": None,
    },
}

OFF_NOT_FOUND = {"status": 0}


def test_invalid_ean_returns_422(client: TestClient):
    assert client.get("/barcode/123").status_code == 422
    assert client.get("/barcode/ABCDEFGHIJKLM").status_code == 422
    assert client.get("/barcode/123456789012345").status_code == 422


def test_valid_ean8_accepted(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/12345678.json",
        json=OFF_MAHOU,
    )
    assert client.get("/barcode/12345678").status_code == 200


def test_returns_product_from_off(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_MAHOU,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Cerveza especial"
    assert data["brand"] == "Mahou"
    assert data["stores"] == ["Mercadona", "Alcampo"]


def test_falls_back_to_product_name_when_no_es_name(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NO_ES_NAME,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Generic Beer"
    assert data["brand"] == "NoBrand"
    assert data["stores"] == []


def test_returns_404_when_off_product_not_found(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NOT_FOUND,
    )
    assert client.get("/barcode/8411327122016").status_code == 404


def test_returns_503_when_off_unreachable(client: TestClient, httpx_mock: HTTPXMock):
    import httpx as _httpx
    httpx_mock.add_exception(
        _httpx.ConnectError("unreachable"),
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
    )
    assert client.get("/barcode/8411327122016").status_code == 503


def test_cache_hit_skips_off_call(client: TestClient, httpx_mock: HTTPXMock):
    # First request populates the cache
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_MAHOU,
    )
    client.get("/barcode/8411327122016")

    # Second request must not call OFF — httpx_mock raises if an unexpected call is made
    data = client.get("/barcode/8411327122016").json()
    assert data["name"] == "Cerveza especial"


def test_stores_empty_list_when_absent(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://es.openfoodfacts.org/api/v3/product/8411327122016.json",
        json=OFF_NO_ES_NAME,
    )
    data = client.get("/barcode/8411327122016").json()
    assert data["stores"] == []
```

- [ ] **Step 4: Run tests to confirm they all fail**

```bash
cd backend && uv run pytest tests/test_barcode.py -v
```

Expected: FAIL — `ImportError` on `barcode` (router not yet created).

- [ ] **Step 5: Commit failing tests**

```bash
git add backend/tests/test_barcode.py backend/tests/conftest.py backend/pyproject.toml backend/uv.lock
git commit -m "test: add failing barcode endpoint tests"
```

---

## Task 4: Backend — Barcode router implementation

**Files:**
- Create: `backend/app/routers/barcode.py`

- [ ] **Step 1: Create `backend/app/routers/barcode.py`**

```python
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.db.models import BarcodeCache
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.barcode import BarcodeRead

router = APIRouter(tags=["barcode"])

_EAN_PATTERN = r"^\d{8}$|^\d{13}$"
_OFF_URL = "https://es.openfoodfacts.org/api/v3/product/{ean}.json"


def _parse_stores(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _to_read(entry: BarcodeCache) -> BarcodeRead:
    return BarcodeRead(
        name=entry.name,
        brand=entry.brand,
        stores=_parse_stores(entry.stores),
    )


@router.get("/barcode/{ean}", response_model=BarcodeRead)
def get_barcode(
    ean: Annotated[str, Path(pattern=_EAN_PATTERN)],
    current_user: CurrentUser,
    session: CurrentSession,
) -> BarcodeRead:
    # Cache lookup
    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
    if cached:
        return _to_read(cached)

    # Call Open Food Facts
    try:
        resp = httpx.get(_OFF_URL.format(ean=ean), timeout=5.0)
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Could not reach Open Food Facts")

    if data.get("status") != 1 or "product" not in data:
        raise HTTPException(status_code=404, detail="Product not found")

    product = data["product"]
    name = (
        product.get("product_name_es")
        or product.get("product_name")
        or product.get("generic_name_es")
        or product.get("generic_name")
        or ""
    )
    if not name:
        raise HTTPException(status_code=404, detail="Product not found")

    brands_raw = product.get("brands") or ""
    brand = brands_raw.split(",")[0].strip() or None
    stores = product.get("stores") or None

    entry = BarcodeCache(ean=ean, name=name, brand=brand, stores=stores)
    session.add(entry)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent request already cached this EAN — use theirs
        session.rollback()
        cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
        if cached:
            return _to_read(cached)
        raise HTTPException(status_code=503, detail="Cache error")

    session.refresh(entry)
    return _to_read(entry)
```

- [ ] **Step 2: Run the barcode tests**

```bash
cd backend && uv run pytest tests/test_barcode.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Run the full test suite**

```bash
cd backend && uv run pytest -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/barcode.py
git commit -m "feat: implement GET /barcode/{ean} with OFF lookup and cache"
```

---

## Task 5: Register router + Alembic migration

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/alembic/versions/<hash>_add_barcode_cache_table.py` (generated)

- [ ] **Step 1: Register the barcode router in `backend/app/main.py`**

Change:
```python
from app.routers import auth, invites, items, lists, members, suggestions
```
to:
```python
from app.routers import auth, barcode, invites, items, lists, members, suggestions
```

Add after `app.include_router(suggestions.router)`:
```python
app.include_router(barcode.router)
```

- [ ] **Step 2: Generate Alembic migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add barcode_cache table"
```

Expected: a new file created in `backend/alembic/versions/`.

- [ ] **Step 3: Verify the generated migration**

Open the generated file. The `upgrade()` should create a `barcode_cache` table with columns `id`, `ean` (unique index), `name`, `brand`, `stores`, `created_at`. The `downgrade()` should drop the table and its index. If autogenerate added unrelated noise (diffs on existing tables), remove those lines.

- [ ] **Step 4: Apply the migration locally**

```bash
cd backend && uv run alembic upgrade head
```

Expected: `Running upgrade ... -> <rev>, add barcode_cache table`

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/alembic/versions/
git commit -m "feat: register barcode router and add barcode_cache migration"
```

---

## Task 6: Frontend — BarcodeRead type + getBarcode API function

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `BarcodeRead` interface to `frontend/src/types.ts`**

Add after the `Suggestion` interface:

```typescript
export interface BarcodeRead {
  name: string
  brand: string | null
  stores: string[]
}
```

- [ ] **Step 2: Update the import in `frontend/src/lib/api.ts` and add `getBarcode`**

Change the top import:
```typescript
import type { BarcodeRead, Suggestion } from '../types'
```

Add after `getSuggestions`:

```typescript
export async function getBarcode(
  getToken: () => Promise<string>,
  ean: string,
): Promise<BarcodeRead> {
  return apiFetch(getToken, `/barcode/${ean}`) as Promise<BarcodeRead>
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: add BarcodeRead type and getBarcode API function"
```

---

## Task 7: Frontend — BarcodeScanSheet component

**Files:**
- Create: `frontend/src/components/BarcodeScanSheet.tsx`
- Create: `frontend/src/components/BarcodeScanSheet.css`
- Create: `frontend/src/components/BarcodeScanSheet.test.tsx`

- [ ] **Step 1: Write failing tests — `frontend/src/components/BarcodeScanSheet.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import type { BarcodeRead } from '../types'

const product: BarcodeRead = {
  name: 'Leche Entera',
  brand: 'Pascual',
  stores: ['Mercadona', 'Alcampo'],
}

const productNoExtras: BarcodeRead = {
  name: 'Producto Genérico',
  brand: null,
  stores: [],
}

describe('BarcodeScanSheet', () => {
  it('renders product name', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Leche Entera')).toBeInTheDocument()
  })

  it('renders brand tag when present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Pascual/)).toBeInTheDocument()
  })

  it('renders store chips when stores present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
    expect(screen.getByText('Alcampo')).toBeInTheDocument()
  })

  it('does not render store chips when stores empty', () => {
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('store-chips')).not.toBeInTheDocument()
  })

  it('edit button calls onEdit with name and brand sigil', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Leche Entera #Pascual')
  })

  it('edit button omits brand sigil when brand is null', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Producto Genérico')
  })

  it('add button calls onAdd with name, brand, and null store', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', store: null })
  })

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- BarcodeScanSheet
```

Expected: FAIL — `BarcodeScanSheet` not found.

- [ ] **Step 3: Create `frontend/src/components/BarcodeScanSheet.tsx`**

```typescript
import './BarcodeScanSheet.css'
import type { BarcodeRead } from '../types'

interface Props {
  product: BarcodeRead
  onAdd: (item: { name: string; brand: string | null; store: null }) => void
  onEdit: (prefill: string) => void
  onClose: () => void
}

function buildPrefill(product: BarcodeRead): string {
  const parts = [product.name]
  if (product.brand) parts.push(`#${product.brand}`)
  return parts.join(' ')
}

export function BarcodeScanSheet({ product, onAdd, onEdit, onClose }: Props) {
  return (
    <>
      <div className="bss__overlay" onClick={onClose} />
      <div className="bss">
        <div className="bss__header">Producto encontrado</div>

        <div className="bss__product-row">
          <div className="bss__product-info">
            <div className="bss__name">{product.name}</div>
            {(product.brand || product.stores.length > 0) && (
              <div className="bss__tags">
                {product.brand && (
                  <span className="bss__tag">🏷️ {product.brand}</span>
                )}
                {product.stores.length > 0 && (
                  <div className="bss__store-chips" data-testid="store-chips">
                    {product.stores.map(s => (
                      <span key={s} className="bss__tag bss__tag--store">🏪 {s}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="bss__edit"
            onClick={() => onEdit(buildPrefill(product))}
            aria-label="Editar"
          >
            ✏️
          </button>
        </div>

        <div className="bss__actions">
          <button className="bss__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="bss__add"
            onClick={() => onAdd({ name: product.name, brand: product.brand, store: null })}
          >
            Añadir a la lista
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/BarcodeScanSheet.css`**

```css
.bss__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.bss {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 201;
  background: var(--bg);
  border-radius: 20px 20px 0 0;
  padding: 20px 20px 36px;
  border-top: 1px solid var(--border);
}

.bss__header {
  text-align: center;
  font-size: 11px;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

.bss__product-row {
  display: flex;
  align-items: stretch;
  gap: 12px;
  margin-bottom: 20px;
}

.bss__product-info {
  flex: 1;
}

.bss__name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-h);
  margin-bottom: 8px;
}

.bss__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bss__tag {
  font-size: 12px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border, rgba(170,59,255,0.25));
  border-radius: 6px;
  padding: 3px 8px;
  color: var(--accent);
}

.bss__store-chips {
  display: contents;
}

.bss__tag--store {
  background: var(--bg2, #f9f8fb);
  border-color: var(--border);
  color: var(--text);
}

.bss__edit {
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--accent-border, rgba(170,59,255,0.25));
  border-radius: 10px;
  padding: 0 14px;
  font-size: 18px;
  cursor: pointer;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bss__actions {
  display: flex;
  gap: 10px;
}

.bss__cancel {
  flex: 1;
  padding: 12px;
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

.bss__add {
  flex: 2;
  padding: 12px;
  background: var(--accent);
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  font-family: inherit;
}
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- BarcodeScanSheet
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BarcodeScanSheet.tsx frontend/src/components/BarcodeScanSheet.css frontend/src/components/BarcodeScanSheet.test.tsx
git commit -m "feat: add BarcodeScanSheet confirmation component"
```

---

## Task 8: Frontend — BarcodeScanner component

**Files:**
- Create: `frontend/src/components/BarcodeScanner.tsx`
- Create: `frontend/src/components/BarcodeScanner.css`
- Create: `frontend/src/components/BarcodeScanner.test.tsx`

- [ ] **Step 1: Install `@undecaf/barcode-detector-polyfill`**

```bash
cd frontend && npm install @undecaf/barcode-detector-polyfill
```

- [ ] **Step 2: Write failing tests — `frontend/src/components/BarcodeScanner.test.tsx`**

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { BarcodeScanner } from './BarcodeScanner'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, getBarcode: vi.fn() }
})

const mockGetToken = () => Promise.resolve('token')

beforeEach(() => {
  vi.unstubAllGlobals()

  // Mock camera stream
  const mockTrack = { stop: vi.fn() }
  const mockStream = { getTracks: () => [mockTrack] }
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    configurable: true,
  })

  // Default: detector finds nothing (will be overridden per-test)
  vi.stubGlobal('BarcodeDetector', vi.fn(() => ({
    detect: vi.fn().mockResolvedValue([]),
  })))

  // Run requestAnimationFrame synchronously (single frame, then stop)
  let rafCalled = false
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!rafCalled) { rafCalled = true; cb(0) }
    return 0
  })
})

describe('BarcodeScanner', () => {
  it('renders a close button', () => {
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onNotFound={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument()
  })

  it('calls onClose when close button is tapped', async () => {
    const onClose = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onNotFound={vi.fn()} onClose={onClose} />
    )
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onResult with product when barcode found', async () => {
    vi.stubGlobal('BarcodeDetector', vi.fn(() => ({
      detect: vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }]),
    })))
    const product = { name: 'Leche', brand: 'Pascual', stores: [] }
    ;(api.getBarcode as Mock).mockResolvedValue(product)

    const onResult = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={onResult} onNotFound={vi.fn()} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(product))
  })

  it('calls onNotFound when backend returns 404', async () => {
    vi.stubGlobal('BarcodeDetector', vi.fn(() => ({
      detect: vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }]),
    })))
    ;(api.getBarcode as Mock).mockRejectedValue(new ApiError(404, 'not found'))

    const onNotFound = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onNotFound={onNotFound} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onNotFound).toHaveBeenCalled())
  })

  it('calls onNotFound when backend returns 503', async () => {
    vi.stubGlobal('BarcodeDetector', vi.fn(() => ({
      detect: vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }]),
    })))
    ;(api.getBarcode as Mock).mockRejectedValue(new ApiError(503, 'unavailable'))

    const onNotFound = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onNotFound={onNotFound} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onNotFound).toHaveBeenCalled())
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd frontend && npm test -- BarcodeScanner
```

Expected: FAIL — `BarcodeScanner` not found.

- [ ] **Step 4: Create `frontend/src/components/BarcodeScanner.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react'
import './BarcodeScanner.css'
import { BarcodeDetectorPolyfill } from '@undecaf/barcode-detector-polyfill'
import { getBarcode } from '../lib/api'
import type { BarcodeRead } from '../types'

type DetectorConstructor = typeof BarcodeDetectorPolyfill
const Detector: DetectorConstructor =
  typeof (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector !== 'undefined'
    ? (globalThis as { BarcodeDetector: DetectorConstructor }).BarcodeDetector
    : BarcodeDetectorPolyfill

interface Props {
  getToken: () => Promise<string>
  onResult: (product: BarcodeRead) => void
  onNotFound: () => void
  onClose: () => void
}

export function BarcodeScanner({ getToken, onResult, onNotFound, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [cameraError, setCameraError] = useState(false)

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    const detector = new Detector({ formats: ['ean_8', 'ean_13'] })

    async function scan() {
      if (!scanningRef.current || !videoRef.current) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          scanningRef.current = false
          stopStream()
          try {
            const product = await getBarcode(getToken, barcodes[0].rawValue)
            onResult(product)
          } catch {
            onNotFound()
          }
          return
        }
      } catch {
        // Detection failed this frame — continue
      }
      if (scanningRef.current) requestAnimationFrame(scan)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().then(() => requestAnimationFrame(scan)).catch(() => {
            // jsdom does not support video.play() — start scan directly in tests
            requestAnimationFrame(scan)
          })
        }
      })
      .catch(() => setCameraError(true))

    return () => {
      scanningRef.current = false
      stopStream()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (cameraError) {
    return (
      <div className="barcode-scanner barcode-scanner--error">
        <p>No se pudo acceder a la cámara.</p>
        <button onClick={onClose} aria-label="Cerrar escáner">Cerrar</button>
      </div>
    )
  }

  return (
    <div className="barcode-scanner">
      <video ref={videoRef} className="barcode-scanner__video" playsInline muted />
      <div className="barcode-scanner__overlay">
        <div className="barcode-scanner__frame" />
        <p className="barcode-scanner__hint">Apunta al código de barras</p>
      </div>
      <button
        className="barcode-scanner__close"
        aria-label="Cerrar escáner"
        onClick={() => { scanningRef.current = false; stopStream(); onClose() }}
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Create `frontend/src/components/BarcodeScanner.css`**

```css
.barcode-scanner {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.barcode-scanner__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.barcode-scanner__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.barcode-scanner__frame {
  width: 260px;
  height: 160px;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.45);
}

.barcode-scanner__hint {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.barcode-scanner__close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}

.barcode-scanner--error {
  color: white;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  text-align: center;
}
```

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm test -- BarcodeScanner
```

Expected: all 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BarcodeScanner.tsx frontend/src/components/BarcodeScanner.css frontend/src/components/BarcodeScanner.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add BarcodeScanner camera overlay component"
```

---

## Task 9: Frontend — SmartInputBar scan button

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`
- Modify: `frontend/src/components/SmartInputBar.css`

- [ ] **Step 1: Update `Props` interface in `frontend/src/components/SmartInputBar.tsx`**

Change:
```typescript
interface Props {
  value: string
  parsed: ParsedInput
  items: ListItem[]
  suggestions: string[]
  onChange: (v: string) => void
  onSubmit: () => void
}
```
to:
```typescript
interface Props {
  value: string
  parsed: ParsedInput
  items: ListItem[]
  suggestions: string[]
  onChange: (v: string) => void
  onSubmit: () => void
  onScanRequest: () => void
}
```

- [ ] **Step 2: Destructure the new prop**

Change:
```typescript
export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit }: Props) {
```
to:
```typescript
export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit, onScanRequest }: Props) {
```

- [ ] **Step 3: Add the scan button inside `.smart-input__row`**

In the `smart-input__row` div, add the scan button between the `<input>` and the add `<button>`:

```typescript
      <div className="smart-input__row">
        <input
          className="smart-input__field"
          type="text"
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && hasName) onSubmit() }}
          placeholder="Añadir producto…"
          aria-label="Añadir producto"
        />
        {!value && (
          <button
            className="smart-input__scan"
            onClick={onScanRequest}
            aria-label="Escanear código de barras"
            type="button"
          >
            📷
          </button>
        )}
        <button
          className="smart-input__add"
          onClick={onSubmit}
          disabled={!hasName}
          aria-label="Añadir"
        >
          <span aria-hidden="true" className="smart-input__add-icon" />
        </button>
      </div>
```

- [ ] **Step 4: Add scan button styles to `frontend/src/components/SmartInputBar.css`**

Add after the `.smart-input__row:focus-within` rule:

```css
.smart-input__scan {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 18px;
  font-family: inherit;
}
```

- [ ] **Step 5: Fix any SmartInputBar tests that render without `onScanRequest`**

Run:
```bash
cd frontend && npm test -- SmartInputBar
```

If any test fails with "Missing required prop `onScanRequest`", add `onScanRequest={vi.fn()}` to those render calls in `frontend/src/components/SmartInputBar.test.tsx`.

- [ ] **Step 6: Confirm all SmartInputBar tests pass**

```bash
cd frontend && npm test -- SmartInputBar
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.css
git commit -m "feat: add barcode scan button to SmartInputBar"
```

---

## Task 10: Frontend — ListScreen wiring

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Add imports at the top of `frontend/src/components/ListScreen.tsx`**

Add these three imports alongside the existing component imports:
```typescript
import { BarcodeScanner } from './BarcodeScanner'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import type { BarcodeRead } from '../types'
```

- [ ] **Step 2: Add scanner and sheet state after the existing state declarations**

```typescript
const [scannerOpen, setScannerOpen] = useState(false)
const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(null)
```

- [ ] **Step 3: Add callbacks after `handleSubmit`**

```typescript
const handleScanRequest = useCallback(() => {
  setScannerOpen(true)
}, [])

const handleScanResult = useCallback((product: BarcodeRead) => {
  setScannerOpen(false)
  setScannedProduct(product)
}, [])

const handleScanNotFound = useCallback(() => {
  setScannerOpen(false)
  setToast('Producto no encontrado')
}, [])

const handleScanAdd = useCallback((item: { name: string; brand: string | null; store: null }) => {
  setScannedProduct(null)
  void addItem({ name: item.name, brand: item.brand, store: null, quantity: null, variety: null })
}, [addItem])

const handleScanEdit = useCallback((prefill: string) => {
  setScannedProduct(null)
  setInputValue(prefill)
}, [])
```

- [ ] **Step 4: Pass `onScanRequest` to `SmartInputBar`**

Find the `<SmartInputBar` JSX and add the new prop:
```typescript
        <SmartInputBar
          value={inputValue}
          parsed={parsed}
          items={items}
          suggestions={suggestions}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onScanRequest={handleScanRequest}
        />
```

- [ ] **Step 5: Render `BarcodeScanner` and `BarcodeScanSheet`**

After `{toast && <Toast message={toast} onDismiss={() => setToast(null)} />}`, add:

```typescript
      {scannerOpen && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onNotFound={handleScanNotFound}
          onClose={() => setScannerOpen(false)}
        />
      )}
      {scannedProduct && (
        <BarcodeScanSheet
          product={scannedProduct}
          onAdd={handleScanAdd}
          onEdit={handleScanEdit}
          onClose={() => setScannedProduct(null)}
        />
      )}
```

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: all tests PASS. If any `ListScreen` snapshot or render test complains about the new `onScanRequest` prop being passed to `SmartInputBar`, update those test stubs to include `onScanRequest={vi.fn()}`.

- [ ] **Step 8: Run all backend tests**

```bash
cd backend && uv run pytest -v
```

Expected: all tests PASS.

- [ ] **Step 9: Final commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: wire barcode scanner and confirmation sheet into ListScreen"
```
