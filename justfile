mod frontend
mod backend

default:
    @just --list

# Install all app dependencies
install:
    just backend install
    just frontend install

# Start both frontend and backend dev servers in parallel
dev:
    @overmind start

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
    @lsof -niTCP:5173,8000 -sTCP:LISTEN || echo "✅ No processes detected on ports 5173 or 8000"

# Kill only the listeners (works on macOS and Linux)
servers-kill:
    @echo "Stopping servers on 5173 and 8000..."
    @lsof -t -niTCP:5173,8000 -sTCP:LISTEN | xargs kill -9 2>/dev/null || echo "⚠️ Nothing to kill."
