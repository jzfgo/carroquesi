mod frontend
mod backend

frontend-port := env('FRONTEND_PORT', '5173')
backend-port := env('BACKEND_PORT', '8000')

default:
    @just --list

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

# Check formatting of both frontend and backend code
format-check:
    just backend format-check
    just frontend format-check

# Type-check frontend, lint
lint:
    just frontend typecheck
    just frontend lint
    just backend lint

# Run all tests (frontend + backend)
test:
    just frontend test
    just backend test

# Type-check, lint, and test
ci:
    just format-check
    just lint
    just test

# Update [Unreleased] section in CHANGELOG.md from commits since last tag (requires git-cliff)
changelog:
    python3 scripts/strip-unreleased.py
    git cliff --unreleased --prepend CHANGELOG.md

# Wire up lefthook (run once after cloning)
setup:
    -git config --unset core.hooksPath
    lefthook install

alias ss := servers-status
alias sk := servers-kill

# Check if the dev servers are currently active
servers-status:
    @lsof -niTCP:{{ frontend-port }},{{ backend-port }} -sTCP:LISTEN || echo "✅ No processes detected on ports {{ frontend-port }} or {{ backend-port }}"

# Kill only the listeners (works on macOS and Linux)
servers-kill:
    @echo "Stopping servers on {{ frontend-port }} and {{ backend-port }}..."
    @lsof -t -niTCP:{{ frontend-port }},{{ backend-port }} -sTCP:LISTEN | xargs kill -9 2>/dev/null || echo "⚠️ Nothing to kill."
