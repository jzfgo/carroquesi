# Backend Guidelines

> Repo-wide guidance lives in the root `AGENTS.md`.

## Feature Flag Management

- **Registry** — all known flags and defaults live in `backend/app/services/feature_flags.py`. Adding a flag = one `FlagDef` entry in `REGISTRY`.
- **Adding a new flag**: add `FlagDef` to `REGISTRY` + add constant to `frontend/src/lib/featureFlags.ts` + seed test data in `backend/scripts/seed.py` + add tests + gate the endpoint/UI
- **Granting/revoking**: `just backend feature <firebase_uid> <flag> on|off|reset`
- **Setting admin**: `just backend set-admin <firebase_uid>` — sets Firebase custom claim; user must refresh their token (up to 1 hour wait, or force-refresh in the app)

## Mutation Testing (mutmut)

Run with `just backend mutation` (or scope to a module with `just backend mutation "app.routers.purchases.*"`). Configured under `[tool.mutmut]` in `backend/pyproject.toml`. The recipe ignores `test_store_key.py`, `test_e2e_contract.py`, and `test_quantity.py` because `mutmut` copies `backend/` into `mutants/` and cross-tree `../frontend/...` relative paths do not resolve there. Equivalent or deliberate best-effort survivors do not block; `/ship` runs it scoped to changed `app/services/**` and `app/routers/**` modules.
