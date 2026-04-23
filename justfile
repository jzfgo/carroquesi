mod frontend
mod backend

default:
    just --list

# Start both frontend and backend dev servers in parallel
dev:
    @overmind start

# Run all tests (frontend + backend)
test:
    just frontend test
    just backend test

# Type-check + lint frontend, then run backend tests
ci:
    just frontend typecheck
    just frontend lint
    just backend test

# Update [Unreleased] section in CHANGELOG.md from commits since last tag (requires git-cliff)
changelog:
    git cliff --unreleased --prepend CHANGELOG.md

# Configure git to use the repo's tracked hooks (run once after cloning)
setup:
    git config core.hooksPath hooks

alias ss := servers-status
alias sk := servers-kill

# Check if the dev servers are currently active
servers-status:
    @lsof -niTCP:5173,8000 -sTCP:LISTEN || echo "✅ No processes detected on ports 5173 or 8000"

# Kill only the listeners (works on macOS and Linux)
servers-kill:
    @echo "Stopping servers on 5173 and 8000..."
    @lsof -t -niTCP:5173,8000 -sTCP:LISTEN | xargs kill -9 2>/dev/null || echo "⚠️ Nothing to kill."
