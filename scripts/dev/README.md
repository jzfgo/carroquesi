# Dev Scripts — Headless access for Claude Code

These scripts let Claude Code interact with the production app using your account
without needing an interactive browser.

## Setup (one-time)

1. Copy the environment template:

   ```
   cp .env.dev-scripts.example .env.dev-scripts
   ```

2. Fill in the values in `.env.dev-scripts` (see comments in the file).

3. Download the service account JSON from Firebase Console:
   - IAM & Admin → Service Accounts → your project → Generate new key
   - Save it to a path **outside the repo**, e.g. `~/.secrets/cqs-firebase-admin.json`
   - Set `FIREBASE_ADMIN_KEY_PATH` to that path

4. Install Python dependencies (run from `backend/`):

   ```
   uv sync --group scripts
   ```

   Or install directly into the active virtualenv:

   ```
   uv pip install firebase-admin requests python-dotenv playwright
   playwright install chromium
   ```

## Usage

### Get an ID token (for direct API calls)

```bash
TOKEN=$(python scripts/dev/get_token.py)
curl -H "Authorization: Bearer $TOKEN" $API_BASE_URL/dashboard
```

### Screenshot a page

```bash
python scripts/dev/browser_session.py screenshot https://your-app.com/dashboard debug.png
```

### Dump a page's HTML

```bash
python scripts/dev/browser_session.py dump https://your-app.com/dashboard
```

## Auth injection note

Firebase Auth on the web stores the session in `localStorage` under a project-specific
dynamic key. If the frontend validates the token against Firebase servers on startup
and the injected `dev_id_token` entry is not picked up, the most robust fallback is to
call `signInWithCustomToken` directly in the browser console with the token printed by
`get_token.py`. Claude Code can adjust `browser_session.py` based on actual behaviour.

## Security notes

- `.env.dev-scripts` is in `.gitignore` — never commit it
- The service account JSON must live outside the repo directory
- Generated tokens expire after 1 hour (Firebase limit)
