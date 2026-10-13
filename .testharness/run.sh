#!/bin/bash
# Run every Ironbook check in one go. Exits non-zero on the first failure.
#   bash .testharness/run.sh
# Needs (installed on demand, not in package.json):
#   npm i --no-save playwright eslint@9 eslint-plugin-react-hooks@5 globals@15
set -e
cd "$(dirname "$0")/.."

echo "== 1/6 lint (hooks order, undefined names)"
npx eslint -c .testharness/eslint.config.js src

echo "== 2/6 lint rule is live (the v8 bug fixture must FAIL)"
if npx eslint -c .testharness/eslint.config.js .testharness/lint-fixtures >/dev/null 2>&1; then
  echo "✗ rules-of-hooks did not flag the v8 fixture"; exit 1
fi
echo "  ✓ fixture rejected"

echo "== 3/6 alias targets"
node .testharness/check-aliases.mjs

echo "== 3b colour schemes (contrast checks; generated CSS up to date)"
python3 .testharness/schemes.py --check src/styles.css

echo "== 4/6 unit tests (offline sync; plate math, rename, notes)"
node .testharness/sync-unit.mjs
node .testharness/unit.mjs

echo "== 5/6 production build"
npx vite build --logLevel warn

echo "== 6/6 end-to-end (stubbed database, real Chromium)"
npx vite build --config .testharness/vite.test.config.js --logLevel warn
# The stub must replace db.js everywhere. "ironbook-auth" only appears in the real db.js.
if grep -q "ironbook-auth" .testharness/dist-test/assets/*.js; then
  echo "✗ the test build still contains the real db.js — a db.js import escaped the stub alias"; exit 1
fi
if curl -s -o /dev/null http://localhost:4178; then
  echo "✗ something is already serving on port 4178 (an old preview?) — stop it first"; exit 1
fi
# Run vite directly (not via npx) so $! is the server itself and the cleanup really stops it.
node node_modules/vite/bin/vite.js preview --config .testharness/vite.test.config.js --port 4178 --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:4178 && break; sleep 0.25; done
node .testharness/e2e.mjs
