# Backend Guidelines

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` directly.
> Repo-wide guidance lives in the root `AGENTS.md`, which every harness loads.
> This file is loaded automatically only by harnesses that discover nested
> guidance (Claude Code). The root file points here by path, so harnesses that
> read a single instructions file — OpenCode and Codex pin `AGENTS.md` — should
> open it directly when working on the backend.

## Feature Flag Management

- **Registry** — all known flags and defaults live in `backend/app/services/feature_flags.py`. Adding a flag = one `FlagDef` entry in `REGISTRY`.
- **Adding a new flag**: add `FlagDef` to `REGISTRY` + add constant to `frontend/src/lib/featureFlags.ts` + seed test data in `backend/scripts/seed.py` + add tests + gate the endpoint/UI
- **Granting/revoking**: `just backend feature <firebase_uid> <flag> on|off|reset`
- **Setting admin**: `just backend set-admin <firebase_uid>` — sets Firebase custom claim; user must refresh their token (up to 1 hour wait, or force-refresh in the app)
