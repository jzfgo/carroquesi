# In-App Feedback Design

## Context

CarroQueSí needs a lightweight way for signed-in users to send feedback without leaving the app. The backlog item originally mentioned both an unobtrusive post-purchase prompt and a permanent user-menu entry. For this first pass, the approved scope is manual-only feedback: a permanent "Enviar feedback" entry in the dashboard avatar menu. There is no post-purchase prompt in this iteration.

## Goals

- Let authenticated users submit feedback from inside the app at any time.
- Keep the interface low-friction: free-text message plus optional email.
- Store feedback in the backend database for later review or export.
- Avoid adding notification delivery, admin screens, or prompt logic in this pass.

## Non-Goals

- No post-purchase feedback prompt.
- No rating scale or category selector.
- No admin UI for reading feedback.
- No email, Slack, or webhook delivery.
- No offline queueing for feedback submissions.

## Product Surface

The dashboard avatar menu gets a new `Enviar feedback` menu item above `Cerrar sesión`. Selecting it closes the menu and opens a feedback sheet. The sheet contains:

- a required message textarea
- an optional email input, prefilled from the signed-in user's email when available
- `Enviar` and `Cancelar` actions

The submit button is disabled while the message is blank or while the request is in flight. On success, the sheet closes and the dashboard shows `Feedback enviado`. On failure, the sheet remains open and the dashboard shows `No se pudo enviar el feedback`. If the browser is offline, the app shows the failure toast immediately and does not queue the submission.

## Backend Design

Add a `FeedbackSubmission` SQLModel table:

- `id: str`
- `user_id: str`, foreign key to `users.id`
- `message: str`
- `email: str | None`
- `source: str`, default `manual`
- `user_agent: str | None`
- `created_at: datetime`

Add schemas in `app/schemas/feedback.py`:

- `FeedbackCreate`
  - `message: str`, required, trimmed, non-empty
  - `email: str | None`, optional, trimmed; blank becomes `None`
  - `source: str`, optional, default `manual`
- `FeedbackRead`
  - `id`
  - `created_at`

Add `app/routers/feedback.py` with `POST /feedback`. The endpoint requires `get_current_user`, reads the `User-Agent` header, persists the feedback row for the current user, and returns `FeedbackRead`. It does not require list membership because feedback is app-level, not list-level.

Add an Alembic migration creating `feedback_submissions`.

## Frontend Design

Add `submitFeedback(getToken, payload)` in `frontend/src/lib/api.ts`.

Add a reusable `FeedbackSheet` component with local form state:

- props: `defaultEmail`, `isSubmitting`, `onSubmit`, `onClose`
- trims the message before submit
- allows editing or clearing the prefilled email
- uses existing sheet overlay/container conventions

`DashboardScreen` owns the sheet state because the entry point lives in the dashboard avatar menu. When the user clicks `Enviar feedback`, it closes the avatar menu and opens `FeedbackSheet`. On submit, `DashboardScreen` checks `navigator.onLine`, calls `submitFeedback`, closes the sheet on success, and sets the dashboard toast for success or failure.

## Data Flow

1. User opens dashboard avatar menu.
2. User clicks `Enviar feedback`.
3. `DashboardScreen` renders `FeedbackSheet`.
4. User writes a message and optionally edits email.
5. Frontend calls `POST /feedback`.
6. Backend stores the row with current user id and user agent.
7. Frontend closes the sheet and shows a success toast.

## Error Handling

- Empty or whitespace-only messages cannot be submitted from the frontend.
- Backend also rejects blank messages so API callers cannot bypass validation.
- Failed network or server responses keep the sheet open and show a failure toast.
- Offline submissions are rejected immediately on the client rather than queued.

## Testing

Backend tests:

- `POST /feedback` persists a row for the authenticated user.
- Blank messages return validation error and do not persist.
- Optional email can be omitted or provided.
- User agent is stored when present.

Frontend tests:

- Dashboard avatar menu shows `Enviar feedback`.
- Clicking it opens the feedback sheet and closes the avatar menu.
- Email is prefilled from the current user when available.
- Submit is disabled for blank messages.
- Successful submit calls `submitFeedback`, closes the sheet, and shows `Feedback enviado`.
- Failed submit leaves the sheet open and shows `No se pudo enviar el feedback`.

## Implementation Notes

Follow the repository's existing TDD flow. Start with backend endpoint/model tests, then frontend API/component tests, then implementation. Keep this manual-only scope separate from a future post-purchase prompt so prompt timing, rate-limiting, and dismissal state can be designed independently later.
