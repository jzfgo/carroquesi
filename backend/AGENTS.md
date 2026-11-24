# Backend Guidelines

> Repo-wide guidance lives in the root `AGENTS.md`.

## Feature Flag Management

- **Registry** — all known flags and defaults live in `backend/app/services/feature_flags.py`. Adding a flag = one `FlagDef` entry in `REGISTRY`.
- **Adding a new flag**: add `FlagDef` to `REGISTRY` + add constant to `frontend/src/lib/featureFlags.ts` + seed test data in `backend/scripts/seed.py` + add tests + gate the endpoint/UI
- **Granting/revoking**: `just backend feature <firebase_uid> <flag> on|off|reset`
- **Setting admin**: `just backend set-admin <firebase_uid>` — sets Firebase custom claim; user must refresh their token (up to 1 hour wait, or force-refresh in the app)

## Mutation Testing (mutmut)

Run with `just backend mutation` (or scope to a module with `just backend mutation "app.routers.purchases.*"`). Configured under `[tool.mutmut]` in `backend/pyproject.toml`. The recipe ignores `test_store_key.py`, `test_e2e_contract.py`, and `test_quantity.py` because `mutmut` copies `backend/` into `mutants/` and cross-tree `../frontend/...` relative paths do not resolve there. Equivalent or deliberate best-effort survivors do not block; `/open-pr` runs it scoped to changed `app/services/**` and `app/routers/**` modules.

mutmut does not mutate decorated functions. Only `@staticmethod` and `@classmethod` are exempt, and no setting changes this. This is why routes are registered without a decorator (see Key conventions). The same limit applies in `app/services/`: a function under `@lru_cache` or a `@property` gets no mutants.

## Key conventions

- **Endpoints are registered without a decorator.** Write the endpoint as a plain function, then register it on the line after the function, with the same arguments a decorator would take. Keep the registration next to its function, because registration order is route-matching order. Never write `@router.get(...)`: mutmut would make no mutants for the endpoint, and `tests/test_routes_undecorated.py` fails on any route decorator under `app/routers/`.

  ```python
  def get_list(list_and_user: MemberDep, session: CurrentSession):
      lst, current_user = list_and_user
      return _read_with_default(lst, session, current_user.id)


  router.get("/{list_id}", response_model=ListRead)(get_list)
  ```

- Type-checked with **ty** (`just backend typecheck`); warnings fail too. SQLModel types a model's class attributes as plain values, so a column used as an expression (`.in_()`, `.desc()`, `.is_(None)`, a join's `==`) goes through `col()`: `col(ListItem.name).in_(names)`. Tests read rows with `session.get_one()`, which raises on a missing row, and keep `session.get()` for checking that a row is gone
- Layer and router-independence contracts live in `backend/pyproject.toml` (`[tool.importlinter]`) and run inside `just backend lint`: imports flow downward (`app.main → app.routers → app.dependencies → app.services → app.schemas → app.db → app.core`) and routers do not import each other
- ORM: **SQLModel** (canonical FastAPI approach). Migrations via **Alembic**. Local dev runs on SQLite, which cannot alter a column or add and drop constraints in place — wrap those in `op.batch_alter_table()`. The test suite builds its schema from the models and never runs migrations, so a green suite proves nothing here. Batch mode rebuilds the table with a `CAST`, which can corrupt a type change; migration `465041cfdecb` branches on the dialect instead, and explains when to do that.
- Spend insights come only from `app/services/insights` (`compute_report`): one list, one month, computed live and read-only. Surfaces render its records and never recompute money; a line's amount and unit price come from `services/quantity.py`, pinned to `frontend/src/lib/quantityVectors.json` with the frontend's `itemCost.ts`. `scripts/spend_report.py` prints a report from any `DATABASE_URL` in a read-only session
- `is_admin` is a transient Python attribute on `User`, read from Firebase JWT custom claim `decoded.get("is_admin", False)` — never stored in the DB
- Dockerized: `backend/Dockerfile` → deployed to Cloud Run; runs `alembic upgrade head` on startup
