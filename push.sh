#!/bin/bash
# Ironbook — one-step deploy script.
# Usage: from your repo folder, run  ./push.sh  "optional commit message"
# It stages everything, commits, and pushes to GitHub (which triggers Vercel).

set -e  # stop on first error

# Move to the folder this script lives in, so it works no matter where you call it from.
cd "$(dirname "$0")"

# Confirm this is a git repo pointing at your GitHub.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✋ This folder isn't a git repo. Run this from your ironbook repo folder."
  exit 1
fi

REMOTE=$(git remote get-url origin 2>/dev/null || echo "none")
echo "→ Repo remote: $REMOTE"

# Show what's about to be committed.
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "✓ Nothing to commit — everything is already up to date."
  exit 0
fi

echo "→ Changes to be pushed:"
git status --short

# Commit message: use the argument if given, otherwise a timestamped default.
MSG="${1:-"Update $(date '+%Y-%m-%d %H:%M')"}"

git add -A
git commit -m "$MSG"
echo "→ Pushing to GitHub…"
git push

echo ""
echo "✅ Pushed. Vercel will build and deploy automatically in ~1 minute."
echo "   Check: https://vercel.com  →  ironbook  →  Deployments"
