# Test harness

Everything that has to pass before a release is packaged. It swaps the Supabase layer
(`src/db.js`) for an in-memory stub, so it runs with no network, no account and no real data.

It exists because a React hooks-ordering mistake once shipped a **blank page** on
"Finish workout" and "Discard" (v8).

## Run it

Playwright and ESLint are intentionally NOT in `package.json` — adding them would make
Vercel installs slower. Install them when you want to run the checks:

```bash
npm i --no-save playwright eslint@9 eslint-plugin-react-hooks@5 globals@15
npx playwright install chromium     # skip in the Claude sandbox (Chromium is preinstalled)

bash .testharness/run.sh
```

`run.sh` runs, in order, and stops at the first failure:

1. **Lint** (`eslint.config.js`) — `react-hooks/rules-of-hooks` (the v8 bug) and undefined names.
2. **Lint self-check** — `lint-fixtures/v8-hooks-bug.jsx` reproduces the v8 bug and must be rejected,
   proving the rule is switched on.
3. **Alias check** — every `ALIASES` target in `App.jsx` is a real exercise-database name.
4. **Offline-sync unit tests** (`sync-unit.mjs`) — the queue in `src/sync.js`: migration of the old
   queue format, lost replies, going offline mid-sync, refused writes, edits/deletes made mid-sync.
5. **Production build.**
6. **End-to-end** (`e2e.mjs`) — builds the stubbed app, serves it on port 4178, drives real Chromium.

Exits 0 when everything passes. As of v11: 21 unit checks + 84 browser checks.

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
- no unexpected console/page errors (external font/CDN failures are ignored)

## Stub controls (for writing new checks)

`db-stub.js` exposes `window.__stub` in the test build:
`offline = true` makes every call fail like a dropped connection; `loseNextReply = n` lets the next
n writes reach the "server" but loses the reply; `server()` returns my workouts as the server has
them. Open the app with `?signedout=1` to start on the sign-in screen; the valid invite code is
`lift-together`. `seed.js` (Srijan's 41 spreadsheet sessions) lives here now — the app no longer
ships it.

## Screenshots

`shots-v10.mjs` / `shots-v11.mjs` save PNGs of the newest screens (both themes) while the preview is
running. Look at them before packaging — the checks don't catch cramped labels.

## Note on `chromium.launch()`

The scripts pass an `executablePath` pointing at the sandbox's preinstalled Chromium. On your own
machine, after `npx playwright install chromium`, delete that option.
