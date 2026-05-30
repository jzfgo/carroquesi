# In-App Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual-only in-app feedback flow that lets authenticated users submit free-text feedback from the dashboard avatar menu and stores it in the backend database.

**Architecture:** Add a small authenticated FastAPI router backed by a new `feedback_submissions` SQLModel table. Add a frontend API helper, a focused `FeedbackSheet` component, and dashboard wiring for the permanent menu entry and success/failure toasts.

**Tech Stack:** FastAPI, SQLModel, Alembic, Pytest, React, TypeScript, Vite, Vitest, React Testing Library.

---

## File Structure

- Create `backend/app/schemas/feedback.py`: request and response schemas for feedback submissions.
- Create `backend/app/routers/feedback.py`: authenticated `POST /feedback` endpoint.
- Modify `backend/app/db/models.py`: add `FeedbackSubmission`.
- Modify `backend/app/main.py`: include the feedback router.
- Modify `backend/tests/conftest.py`: include the feedback router in the isolated test app.
- Create `backend/tests/test_feedback.py`: endpoint behavior and persistence tests.
- Modify `backend/tests/test_models.py`: model field smoke test.
- Create `backend/alembic/versions/b6c7d8e9f0a1_add_feedback_submissions.py`: database migration.
- Modify `frontend/src/lib/api.ts`: add feedback request/response types and `submitFeedback`.
- Modify `frontend/src/lib/api.test.ts`: API helper test.
- Create `frontend/src/components/FeedbackSheet.tsx`: reusable sheet UI and form behavior.
- Create `frontend/src/components/FeedbackSheet.css`: sheet styling using existing tokens.
- Create `frontend/src/components/FeedbackSheet.test.tsx`: component-level form tests.
- Modify `frontend/src/components/DashboardScreen.tsx`: menu entry, sheet state, submit handling.
- Modify `frontend/src/components/DashboardScreen.test.tsx`: dashboard integration tests.

---

### Task 1: Backend Feedback Model And Schemas

**Files:**
- Modify: `backend/app/db/models.py`
- Create: `backend/app/schemas/feedback.py`
- Modify: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing model test**

Add this test to `backend/tests/test_models.py`:

```python
def test_feedback_submission_fields():
    from app.db.models import FeedbackSubmission

    fields = FeedbackSubmission.model_fields
    assert "user_id" in fields
    assert "message" in fields
    assert "email" in fields
    assert "source" in fields
    assert "user_agent" in fields
    assert "created_at" in fields

    feedback = FeedbackSubmission(user_id="user-1", message="Great app")
    assert feedback.id is not None
    assert feedback.source == "manual"
    assert feedback.email is None
    assert feedback.user_agent is None
    assert feedback.created_at is not None
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
cd backend
uv run pytest tests/test_models.py::test_feedback_submission_fields -v
```

Expected: fail with an import error because `FeedbackSubmission` does not exist.

- [ ] **Step 3: Add the model**

Append this class to `backend/app/db/models.py` after `ReceiptNameMapping`:

```python
class FeedbackSubmission(SQLModel, table=True):
    __tablename__ = "feedback_submissions"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    message: str
    email: Optional[str] = None
    source: str = Field(default="manual")
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 4: Create feedback schemas**

Create `backend/app/schemas/feedback.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class FeedbackCreate(BaseModel):
    message: str
    email: EmailStr | None = None
    source: str = "manual"

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Feedback message cannot be blank")
        return trimmed

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("source")
    @classmethod
    def source_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Feedback source cannot be blank")
        return trimmed


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
```

- [ ] **Step 5: Run the model test to verify it passes**

Run:

```bash
cd backend
uv run pytest tests/test_models.py::test_feedback_submission_fields -v
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/app/db/models.py backend/app/schemas/feedback.py backend/tests/test_models.py
git commit -m "feat: add feedback submission model"
```

---

### Task 2: Backend Feedback Endpoint And Migration

**Files:**
- Create: `backend/app/routers/feedback.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_feedback.py`
- Create: `backend/alembic/versions/b6c7d8e9f0a1_add_feedback_submissions.py`

- [ ] **Step 1: Write failing endpoint tests**

Create `backend/tests/test_feedback.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import FeedbackSubmission, User


def test_create_feedback_persists_for_current_user(
    client: TestClient,
    session: Session,
    user: User,
):
    response = client.post(
        "/feedback",
        json={"message": "The receipt flow is confusing", "email": "me@example.com"},
        headers={"user-agent": "pytest-browser"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"]
    assert data["created_at"]

    stored = session.exec(select(FeedbackSubmission)).one()
    assert stored.user_id == user.id
    assert stored.message == "The receipt flow is confusing"
    assert stored.email == "me@example.com"
    assert stored.source == "manual"
    assert stored.user_agent == "pytest-browser"


def test_create_feedback_trims_message_and_blank_email(
    client: TestClient,
    session: Session,
    user: User,
):
    response = client.post(
        "/feedback",
        json={"message": "  Great work  ", "email": "   "},
    )

    assert response.status_code == 200
    stored = session.exec(select(FeedbackSubmission)).one()
    assert stored.user_id == user.id
    assert stored.message == "Great work"
    assert stored.email is None


def test_create_feedback_rejects_blank_message(
    client: TestClient,
    session: Session,
):
    response = client.post("/feedback", json={"message": "   "})

    assert response.status_code == 422
    assert session.exec(select(FeedbackSubmission)).all() == []
```

- [ ] **Step 2: Run endpoint tests to verify they fail**

Run:

```bash
cd backend
uv run pytest tests/test_feedback.py -v
```

Expected: fail because `/feedback` is not registered or `FeedbackSubmission` is not persisted by any endpoint.

- [ ] **Step 3: Implement the router**

Create `backend/app/routers/feedback.py`:

```python
from fastapi import APIRouter, Depends, Header
from sqlmodel import Session

from app.db.models import FeedbackSubmission, User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.schemas.feedback import FeedbackCreate, FeedbackRead

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackRead)
def create_feedback(
    body: FeedbackCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    user_agent: str | None = Header(default=None),
) -> FeedbackSubmission:
    feedback = FeedbackSubmission(
        user_id=current_user.id,
        message=body.message,
        email=str(body.email) if body.email else None,
        source=body.source,
        user_agent=user_agent,
    )
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return feedback
```

- [ ] **Step 4: Register the router in the app**

Modify the imports and router includes in `backend/app/main.py`:

```python
from app.routers import auth, barcode, feedback, invites, items, lists, members, prices, receipt, share, suggestions
```

Add this include after the barcode or suggestions router include:

```python
app.include_router(feedback.router)
```

- [ ] **Step 5: Register the router in test app setup**

Modify the router import in `backend/tests/conftest.py`:

```python
from app.routers import auth, barcode, feedback, invites, items, lists, members, prices, receipt, suggestions
```

Add this include in `_make_client`:

```python
test_app.include_router(feedback.router)
```

- [ ] **Step 6: Add the Alembic migration**

Create `backend/alembic/versions/b6c7d8e9f0a1_add_feedback_submissions.py`:

```python
"""add_feedback_submissions

Revision ID: b6c7d8e9f0a1
Revises: 5ecb72b18efe
Create Date: 2026-05-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = "5ecb72b18efe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedback_submissions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("feedback_submissions")
```

- [ ] **Step 7: Run backend feedback tests to verify they pass**

Run:

```bash
cd backend
uv run pytest tests/test_feedback.py tests/test_models.py::test_feedback_submission_fields -v
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add backend/app/routers/feedback.py backend/app/main.py backend/tests/conftest.py backend/tests/test_feedback.py backend/alembic/versions/b6c7d8e9f0a1_add_feedback_submissions.py
git commit -m "feat: add feedback submission endpoint"
```

---

### Task 3: Frontend API Helper

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing API helper test**

Add this test to `frontend/src/lib/api.test.ts` near the other API helper tests:

```typescript
it('submitFeedback posts feedback payload', async () => {
  mockFetch.mockReturnValue(mockResponse({ id: 'fb-1', created_at: '2026-05-31T10:00:00' }))

  const result = await submitFeedback(mockGetToken, {
    message: 'Great app',
    email: 'alice@example.com',
    source: 'manual',
  })

  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:8000/feedback',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        message: 'Great app',
        email: 'alice@example.com',
        source: 'manual',
      }),
    }),
  )
  expect(result).toEqual({ id: 'fb-1', created_at: '2026-05-31T10:00:00' })
})
```

Update the import at the top of `frontend/src/lib/api.test.ts` to include `submitFeedback`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getLists, createList, createItem, updateItem, getListUpdatedAt, updateList, deleteList, getInvitePreview, acceptInvite, ApiError, submitFeedback } from './api'
```

- [ ] **Step 2: Run the API helper test to verify it fails**

Run:

```bash
cd frontend
npm run test -- src/lib/api.test.ts
```

Expected: fail because `submitFeedback` is not exported.

- [ ] **Step 3: Implement the API helper**

Add these types and function near the bottom of `frontend/src/lib/api.ts`:

```typescript
export interface FeedbackPayload {
  message: string
  email?: string | null
  source?: 'manual'
}

export interface FeedbackResponse {
  id: string
  created_at: string
}

export function submitFeedback(
  getToken: () => Promise<string>,
  payload: FeedbackPayload,
): Promise<FeedbackResponse> {
  return apiFetch(getToken, '/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<FeedbackResponse>
}
```

- [ ] **Step 4: Run the API helper test to verify it passes**

Run:

```bash
cd frontend
npm run test -- src/lib/api.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat: add feedback API helper"
```

---

### Task 4: Feedback Sheet Component

**Files:**
- Create: `frontend/src/components/FeedbackSheet.tsx`
- Create: `frontend/src/components/FeedbackSheet.css`
- Create: `frontend/src/components/FeedbackSheet.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `frontend/src/components/FeedbackSheet.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackSheet } from './FeedbackSheet'

describe('FeedbackSheet', () => {
  it('prefills the optional email field', () => {
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com')
  })

  it('keeps submit disabled for blank messages', () => {
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
  })

  it('submits trimmed message and nullable email', () => {
    const onSubmit = vi.fn()
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: '  Great app  ' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(onSubmit).toHaveBeenCalledWith({ message: 'Great app', email: null, source: 'manual' })
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <FeedbackSheet
        defaultEmail={null}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
cd frontend
npm run test -- src/components/FeedbackSheet.test.tsx
```

Expected: fail because `FeedbackSheet` does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/FeedbackSheet.tsx`:

```typescript
import { useMemo, useState } from 'react'
import type { FeedbackPayload } from '../lib/api'
import './FeedbackSheet.css'

interface Props {
  defaultEmail: string | null | undefined
  isSubmitting: boolean
  onSubmit: (payload: FeedbackPayload) => void
  onClose: () => void
}

export function FeedbackSheet({ defaultEmail, isSubmitting, onSubmit, onClose }: Props) {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const trimmedMessage = useMemo(() => message.trim(), [message])
  const canSubmit = trimmedMessage.length > 0 && !isSubmitting

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    const trimmedEmail = email.trim()
    onSubmit({
      message: trimmedMessage,
      email: trimmedEmail.length > 0 ? trimmedEmail : null,
      source: 'manual',
    })
  }

  return (
    <>
      <div className="feedback-sheet__overlay" onClick={onClose} />
      <form
        className="feedback-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Enviar feedback"
        onSubmit={handleSubmit}
      >
        <div className="feedback-sheet__handle" />
        <h2 className="feedback-sheet__title">Enviar feedback</h2>
        <label className="feedback-sheet__field">
          <span>Mensaje</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Cuéntanos qué funciona, qué falla o qué mejorarías"
          />
        </label>
        <label className="feedback-sheet__field">
          <span>Email opcional</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@email.com"
          />
        </label>
        <div className="feedback-sheet__actions">
          <button type="button" className="feedback-sheet__secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="feedback-sheet__primary" disabled={!canSubmit}>
            {isSubmitting ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </>
  )
}
```

- [ ] **Step 4: Add component styles**

Create `frontend/src/components/FeedbackSheet.css`:

```css
.feedback-sheet__overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: color-mix(in srgb, var(--ink-0) 10%, transparent);
}

.feedback-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 16px 28px;
  background: var(--paper-0);
  border-top: 1px solid var(--border);
}

.feedback-sheet__handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 4px;
  border-radius: 2px;
  background: var(--border);
}

.feedback-sheet__title {
  margin: 0;
  color: var(--ink-0);
  font-size: var(--fs-20);
}

.feedback-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--ink-1);
  font-size: var(--fs-14);
  font-weight: 600;
}

.feedback-sheet__field textarea,
.feedback-sheet__field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--paper-0);
  color: var(--ink-0);
  font: inherit;
  font-weight: 400;
}

.feedback-sheet__field textarea {
  resize: vertical;
  min-height: 116px;
}

.feedback-sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.feedback-sheet__secondary,
.feedback-sheet__primary {
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: var(--fs-14);
  font-weight: 700;
  cursor: pointer;
}

.feedback-sheet__secondary {
  background: var(--paper-1);
  color: var(--ink-0);
}

.feedback-sheet__primary {
  background: var(--accent);
  color: var(--accent-fg);
}

.feedback-sheet__primary:disabled {
  opacity: 0.55;
  cursor: default;
}
```

- [ ] **Step 5: Run component tests to verify they pass**

Run:

```bash
cd frontend
npm run test -- src/components/FeedbackSheet.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/components/FeedbackSheet.tsx frontend/src/components/FeedbackSheet.css frontend/src/components/FeedbackSheet.test.tsx
git commit -m "feat: add feedback sheet"
```

---

### Task 5: Dashboard Menu Integration

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Add these tests inside `describe('DashboardScreen — avatar menu and install banner', () => { ... })` in `frontend/src/components/DashboardScreen.test.tsx`:

```typescript
  it('opens feedback sheet from avatar menu with the user email prefilled', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /enviar feedback/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com')
  })

  it('submits feedback and shows success toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.submitFeedback).mockResolvedValue({ id: 'fb-1', created_at: '2026-05-31T10:00:00' } as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: 'Great app' } })
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() => expect(api.submitFeedback).toHaveBeenCalledWith(mockGetToken, {
      message: 'Great app',
      email: 'alice@example.com',
      source: 'manual',
    }))
    expect(screen.queryByRole('dialog', { name: /enviar feedback/i })).not.toBeInTheDocument()
    expect(screen.getByText(/feedback enviado/i)).toBeInTheDocument()
  })

  it('keeps feedback sheet open and shows failure toast when submit fails', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.submitFeedback).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: 'Great app' } })
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() => expect(screen.getByText(/no se pudo enviar el feedback/i)).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: /enviar feedback/i })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run dashboard tests to verify they fail**

Run:

```bash
cd frontend
npm run test -- src/components/DashboardScreen.test.tsx
```

Expected: fail because the feedback menu item and sheet are not wired.

- [ ] **Step 3: Wire feedback into DashboardScreen imports and state**

Modify imports in `frontend/src/components/DashboardScreen.tsx`:

```typescript
import { getLists, createList, updateList, deleteList, submitFeedback } from '../lib/api'
import type { FeedbackPayload } from '../lib/api'
import { FeedbackSheet } from './FeedbackSheet'
```

Add state near the existing menu/toast state:

```typescript
const [feedbackOpen, setFeedbackOpen] = useState(false)
const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
```

- [ ] **Step 4: Add the submit handler**

Add this callback inside `DashboardScreen`:

```typescript
const handleFeedbackSubmit = useCallback(
  async (payload: FeedbackPayload) => {
    if (!navigator.onLine) {
      setToast('No se pudo enviar el feedback')
      return
    }
    setFeedbackSubmitting(true)
    try {
      await submitFeedback(getToken, payload)
      setFeedbackOpen(false)
      setToast('Feedback enviado')
    } catch {
      setToast('No se pudo enviar el feedback')
    } finally {
      setFeedbackSubmitting(false)
    }
  },
  [getToken],
)
```

- [ ] **Step 5: Add the avatar menu item**

In the avatar menu, add this button above `Cerrar sesión`:

```tsx
<button
  className="dashboard-screen__avatar-menu-item"
  role="menuitem"
  onClick={() => { setFeedbackOpen(true); setMenuOpen(false) }}
>
  Enviar feedback
</button>
```

- [ ] **Step 6: Render the feedback sheet**

Add this near the other conditional overlays in `DashboardScreen`:

```tsx
{feedbackOpen && (
  <FeedbackSheet
    defaultEmail={user?.email}
    isSubmitting={feedbackSubmitting}
    onSubmit={payload => void handleFeedbackSubmit(payload)}
    onClose={() => setFeedbackOpen(false)}
  />
)}
```

- [ ] **Step 7: Run dashboard tests to verify they pass**

Run:

```bash
cd frontend
npm run test -- src/components/DashboardScreen.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/components/DashboardScreen.tsx frontend/src/components/DashboardScreen.test.tsx
git commit -m "feat: add dashboard feedback entry"
```

---

### Task 6: Full Verification

**Files:**
- Verify all modified backend and frontend files.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
cd backend
uv run pytest tests/test_feedback.py tests/test_models.py -v
```

Expected: all selected backend tests pass.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
cd frontend
npm run test -- src/lib/api.test.ts src/components/FeedbackSheet.test.tsx src/components/DashboardScreen.test.tsx
```

Expected: all selected frontend tests pass.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
cd frontend
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run backend test suite**

Run:

```bash
cd backend
uv run pytest
```

Expected: all backend tests pass.

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build completes successfully.

- [ ] **Step 6: Commit final verification adjustments if any**

If verification required code changes, first list the exact files:

```bash
git status --short
```

Then stage only files changed by this feature. For example, if the typecheck required a small fix in `DashboardScreen.tsx`, run:

```bash
git add frontend/src/components/DashboardScreen.tsx
git commit -m "fix: polish feedback flow"
```

If there are no code changes after verification, do not create an empty commit.
