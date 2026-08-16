mod frontend
mod backend

frontend-port := env('FRONTEND_PORT', '5173')
backend-port := env('BACKEND_PORT', '8000')

default:
    @just --list

# Wire up lefthook (run once after cloning)
setup:
    -git config --unset core.hooksPath
    lefthook install

# Install all app dependencies
install:
    just backend install
    just frontend install

# Start both frontend and backend dev servers in parallel with hot-reload
[arg('scope', pattern='local|network')]
dev scope="local":
    @overmind start {{ if scope == "network" { "-f Procfile.network" } else { "-f Procfile.local" } }}

# Format both frontend and backend code
format:
    just backend format
    just frontend format

# Check formatting of both frontend and backend code (used in CI)
format-check:
    just backend format-check
    just frontend format-check

# Type-check frontend, lint (frontend + backend)
lint:
    just frontend typecheck
    just frontend lint
    just backend lint

# Run all tests (frontend + backend)
test:
    just frontend test
    just backend test

# Test repo tooling: agent guardrail hooks + the CI changed-area filter
# (no deps — runs on a bare checkout, same as the CI job)
test-tooling:
    python3 .claude/hooks/test_hooks.py
    python3 scripts/test-ci-changed-areas.py

# Regenerate the OpenAPI snapshot and the frontend types derived from it
openapi:
    just backend openapi
    just frontend openapi-types

# Check formatting, type-check, lint, and test
ci:
    just format-check
    just lint
    just test
    just test-tooling

# Update [Unreleased] section in CHANGELOG.md from commits since last tag (requires git-cliff)
changelog:
    python3 scripts/strip-unreleased.py
    git cliff --unreleased --prepend CHANGELOG.md

# Reset the staging DB from production and scrub device tokens. The copy
# holds real FCM tokens and staging shares the prod sender — without the
# DELETE, staging tests could notify real phones. The next staging deploy
# re-runs alembic against the fresh branch (the migration rehearsal).
staging-db-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${NEON_PROJECT_ID:?set NEON_PROJECT_ID (Neon console → project settings)}"
    neonctl branches reset staging --project-id "$NEON_PROJECT_ID" --parent
    # The URL comes from the branch just reset — guaranteed staging, so the
    # DELETE cannot be pointed at production by a mistyped variable. A failed
    # run leaves staging unscrubbed: re-run before using staging.
    staging_url="$(neonctl connection-string staging --project-id "$NEON_PROJECT_ID")"
    psql "$staging_url" -c 'DELETE FROM push_tokens;'

alias ss := servers-status
alias sk := servers-kill

# Check if the dev servers are currently active
servers-status:
    @lsof -niTCP:{{ frontend-port }},{{ backend-port }} -sTCP:LISTEN || echo "✅ No processes detected on ports {{ frontend-port }} or {{ backend-port }}"

# Kill only the listeners (works on macOS and Linux)
servers-kill:
    @echo "Stopping servers on {{ frontend-port }} and {{ backend-port }}..."
    @lsof -t -niTCP:{{ frontend-port }},{{ backend-port }} -sTCP:LISTEN | xargs kill -9 2>/dev/null || echo "⚠️ Nothing to kill."
