#!/usr/bin/env bash
# Ensure CHANGELOG.md is up to date before pushing.
# Requires git-cliff: https://git-cliff.org/docs/installation
#
# See lefthook.yml
set -euo pipefail

if ! command -v git-cliff &>/dev/null; then
  echo "⚠️  git-cliff not found — skipping changelog check (install: brew install git-cliff)"
  exit 0
fi

# Only act if there are unreleased commits that would produce visible sections
if ! git cliff --unreleased | grep -q '^### '; then
  exit 0
fi

# Run changelog and check if anything changed; always restore original to
# preserve any manual edits the developer may have in the working tree
tmp=$(mktemp)
cp CHANGELOG.md "$tmp"
just changelog
changed=0
diff -q "$tmp" CHANGELOG.md >/dev/null 2>&1 || changed=1
cp "$tmp" CHANGELOG.md
rm "$tmp"

if [ "$changed" -eq 0 ]; then
  exit 0
fi

echo ""
echo "📋 Unreleased commits are not yet in CHANGELOG.md. Run before pushing:"
echo "   just changelog && git add CHANGELOG.md && git commit -m 'chore: update changelog'"
echo ""
exit 1
