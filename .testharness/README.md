# Test harness

End-to-end smoke test for the screens that are easy to break. It swaps the Supabase
layer (`src/db.js`) for an in-memory stub, so it runs with no network, no account and
no real data.

It exists because a React hooks-ordering mistake once shipped a **blank page** on
"Finish workout" and "Discard". This suite walks those exact paths.

## Run it

Playwright is intentionally NOT a dependency in `package.json` — adding it would make
Vercel installs slower and riskier. Install it locally when you want to run the tests:

```bash
npm i --no-save playwright
npx playwright install chromium

# build the stubbed bundle and serve it
npx vite build --config .testharness/vite.test.config.js
npx vite preview --config .testharness/vite.test.config.js --port 4178 --strictPort &

# run the checks
node .testharness/e2e.mjs
```

Exits 0 when everything passes, 1 otherwise.

## What it covers

- app boots past the loading screen, tabs render
- starting a named workout pre-loads the previous split of that name
- reorder: grip bar is a large touch target; ▲▼ actually move an exercise
- decimal weights (`62.25`) and comma reps (`6,6`) are accepted
- **Finish workout** → lands on History, screen not blank
- **Discard** → returns to the start screen, screen not blank
- every tab renders without crashing
- editing a past session from History and saving returns to History
- no unexpected console/page errors (external font/CDN failures are ignored)

## Note on `chromium.launch()`

`e2e.mjs` passes an `executablePath` pointing at a preinstalled Chromium. If you run
this on your own machine after `npx playwright install chromium`, delete that option
so Playwright uses its own download.
