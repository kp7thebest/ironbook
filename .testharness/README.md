# Test harness

Everything that has to pass before a release is packaged. It swaps the Supabase layer
(`src/db.js`) for an in-memory stub, so it runs with no network, no account and no real data.

It exists because a React hooks-ordering mistake once shipped a **blank page** on
"Finish workout" and "Discard" (v8).

## Run it

Playwright and ESLint are intentionally NOT in `package.json` — adding them would make
Vercel installs slower. Install them when you want to run the checks:

```bash
npm i --no-save playwright@1.63.0 eslint@9 eslint-plugin-react-hooks@5 globals@15
npx playwright install chromium     # skip in the Claude sandbox (Chromium is preinstalled)

bash .testharness/run.sh
```

`run.sh` runs, in order, and stops at the first failure:

1. **Lint** (`eslint.config.js`) — `react-hooks/rules-of-hooks` (the v8 bug) and undefined names
   (which also catches a missing import after moving code between modules).
2. **Lint self-check** — `lint-fixtures/v8-hooks-bug.jsx` reproduces the v8 bug and must be rejected,
   proving the rule is switched on.
3. **Alias check** — every `ALIASES` target in `src/lib/registry.js` is a real exercise-database
   name (and there are 60+, so a moved table can't make the check pass vacuously).
3b. **Colour schemes** — `schemes.py --check` recomputes every scheme's colours, re-checks contrast
   (text 4.5:1, accent 3:1, chart pairs incl. colour-blind separation) and fails if the generated block
   in `src/styles.css` is out of date. Change a scheme in the script, then run `--write src/styles.css`.
4. **Unit tests** — `sync-unit.mjs` (the offline queue in `src/sync.js`) and `unit.mjs` (plate math,
   rename/merge, last note, cardio parsing, effort fallback).
5. **Production build.**
6. **End-to-end** (`e2e.mjs`) — builds the stubbed app (and fails if the real `db.js` leaked into it),
   serves it on port 4178, drives real Chromium.

Exits 0 when everything passes. As of v14: 30 + 60 unit checks + 187 browser checks.
GitHub Actions runs the same script on every push (`.github/workflows/test.yml`).

Note: `npm uninstall <pkg>` removes `--no-save` packages too — reinstall the tools afterwards.

## What the browser checks cover

- app boots past the loading screen, tabs render
- starting a named workout pre-loads the previous split of that name
- reorder: grip bar is a large touch target; ▲▼ actually move an exercise
- decimal weights (`62.25`) and comma reps (`6,6`) are accepted
- **Finish workout** → lands on History, screen not blank; **Discard** → start screen
- every tab renders; editing a past session from History and saving returns to History
- Progress tab: plotting, tap/keyboard inspection, data table, range filter, bodyweight chart
- PR estimator math (50 kg × 8 → 62.5 kg), rep table, high-rep warning
- muscle sub-filters, equipment filter, Bodyweight tags, alias-derived demos/tags, live 1RM + PR badge
- Library → "View progress chart" deep link
- **v11** offline: finish and edit while offline → "waiting to sync" → reconnect → exactly one copy on
  the server with the edit; a save whose reply is lost is not duplicated on retry; delete while offline;
  a v10-format queue is migrated and sent on launch
- **v11** Import history is gone from Settings
- **v11** sign-up: invite code required; a wrong code shows a readable message
- **v11** update banner: none on first install; appears when a new `sw.js` ships; Later hides it;
  reopening the app refreshes it, except while a past session is open for editing
- **v12** launch: no fixed wait; reopening offline shows the saved log; exercise list loads after first
  paint; sign-out removes the saved copy; crew data shown from cache and refreshed
- **v12** Excel export downloads a real multi-sheet .xlsx
- **v12** bottom navigation: five tabs, pinned, 44px+ targets, content never hidden behind it; More
  remembers its place
- **v12** notes saved, shown in History and on the next session's card; plate math (bar switch);
  rename across the log and merge into another exercise
- **v13** warm-ups excluded from 1RM and volume; volume heatmap counts match the data; compare chart
  (legend, values, tap, table); rest timer (start, ±15, stays across tabs, off switch, fake-clock end and
  auto-clear); routines (save from Log and History, start, warm-ups kept, delete, missing-table message)
- **layout** at 360 px in both themes: no sideways scroll, header controls on screen, set row fits
- no unexpected console/page errors (external font/CDN failures are ignored)

## Finding Chromium

`browser.mjs` uses `CHROME_PATH` if set, else the Claude sandbox's preinstalled Chromium, else
Playwright's own download (`npx playwright install chromium`, as CI does).

## Stub controls (for writing new checks)

`db-stub.js` exposes `window.__stub` in the test build:
`offline = true` makes every call fail like a dropped connection (set `window.__stub = { offline: true }`
in an init script to start offline); `loseNextReply = n` lets the next
n writes reach the "server" but loses the reply; `server()` returns my workouts as the server has
them. Open the app with `?signedout=1` to start on the sign-in screen; the valid invite code is
`lift-together`. `seed.js` (Srijan's 41 spreadsheet sessions) lives here now — the app no longer
ships it.

## Screenshots

`shots-all.mjs <dir>` saves every screen in both themes; `shots-v10/11/12/14.mjs` save PNGs of the newest screens (both themes) while the preview is
running. Look at them before packaging — the checks don't catch cramped labels.

