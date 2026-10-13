# Ironbook — Project Context

> Hand this file to any future chat working on Ironbook. It describes the app **as it stands at v14
> (13 Oct 2026)** — what exists, how it's built, how changes get shipped, and the traps already hit.
> It supersedes the older `PROJECT_CONTEXT.md`, which was an append-only changelog with stale parts.

---

## 1. What it is

A workout tracker for a small crew — **Srijan, Karthik, Nitant**. Log sets, see what you lifted last
time (and on similar exercises), chart progress per exercise, estimate 1-rep maxes, browse 870+
exercises with demo animations, and see each other's training.

| | |
|---|---|
| Live app | **https://ironbook-zeta.vercel.app** (installable PWA) |
| Code | **github.com/kp7thebest/ironbook** (personal account — push only here) |
| Hosting | Vercel, team "KP's team" (Hobby/free). Auto-deploys every push to `main` |
| CI | GitHub Actions runs the whole test harness on every push (`.github/workflows/test.yml`) |
| Backend | Supabase project `wexlnamaftgcmkjthgtv`, region ap-south-1 (Mumbai), free tier |
| Stack | React 18 + Vite (modules under `src/`), `@supabase/supabase-js`, `write-excel-file` (lazy) |
| Maintainer | Karthik (GitHub `kp7thebest`) |

---

## 2. How changes get shipped (read this first)

The code is edited in a Claude sandbox, not on the Mac. The loop is:

1. Claude edits, **runs `bash .testharness/run.sh`**, and delivers `ironbook-vNN.zip`.
2. Karthik unzips it in `~/Downloads`. macOS names it `ironbook 2` / `ironbook 3`… because
   `~/Downloads/ironbook` (the real git repo) already exists.
3. Copy into the repo and push (paste without `#` comments — zsh rejects them):
   ```bash
   ls ~/Downloads | grep -i ironbook
   cd ~/Downloads/ironbook
   cp -R ~/Downloads/"ironbook 2"/. .
   chmod +x push.sh
   ./push.sh "short description"
   ```
   **`cp` never deletes.** When a release removes a file, delete it in the repo before pushing
   (each release's notes say which, e.g. v11: `rm src/seed.js`).
4. If the release includes a `supabase/patch_*.sql`, run it in the Supabase SQL editor (the notes say
   whether it must go before or after the push).
5. GitHub runs the tests (a ✓ or ✗ appears next to the commit on github.com; a failure emails you).
   Vercel deploys regardless, in ~1 min. Open apps show **"New version ready · Refresh"** and refresh
   themselves the next time they're reopened.

### Pushing as kp7thebest (one-time setup per Mac)
```bash
gh auth status
gh auth switch --hostname github.com --user kp7thebest
gh auth setup-git
git remote set-url origin https://kp7thebest@github.com/kp7thebest/ironbook.git
git config user.name "kp7thebest"
git config user.email "kp7thebest@users.noreply.github.com"
gh api user --jq .login
git push --dry-run
```
(`gh auth login --hostname github.com --git-protocol https --web` if kp7thebest isn't listed.)

### Known traps
| Symptom | Cause | Fix |
|---|---|---|
| `403 … denied to karthikperiasamy-nc` | Mac's git credential is Karthik's work account | Setup above. Still failing: delete `github.com` in Keychain Access |
| `Password authentication is not supported` | git is asking for a password instead of using gh's token | `gh auth setup-git`, then `git push` |
| `permission denied: ./push.sh` | `cp` dropped the exec bit | `chmod +x push.sh`, or `bash push.sh "msg"` |
| `cp: … are identical` | Terminal is *inside* the unzipped copy, not the repo | `cd ~/Downloads/ironbook` first |
| `git status` shows nothing after copying | Wrong source folder name | Check `ls ~/Downloads \| grep -i ironbook` |
| zsh `accepts 0 arg(s), received N` | Pasted a command with an inline `# comment` | Paste commands without comments |
| Phone still shows old UI | Service worker cache | Tap Refresh on the banner / reopen; bump `CACHE` in `public/sw.js` when the shell changes |
| iPhone opens in Safari, not full-screen | Icon was added before the manifest existed | Delete icon, re-add from **Safari** (Chrome on iOS can't install PWAs) |

`push.sh` stages, commits, and pushes; if there's nothing to commit but unpushed commits exist, it
pushes those.

---

## 3. Files

Split out of the old single `App.jsx` in v12 (S2). Rule of thumb: pure logic in `lib/` (unit-tested
in Node), shared UI in `components/`, one screen per file in `views/`.

```
src/main.jsx              React entry; imports styles.css
src/App.jsx               auth gate + update banner (useAppUpdate) + sign-out cleanup
src/MainApp.jsx           signed-in shell: data loading/caching, offline sync, tabs, all write actions
src/sync.js               offline write queue for workouts (pure, unit-tested) — §6
src/db.js                 every Supabase call (auth, profiles, workouts, custom exercises)
src/exdb.js               873 exercises [name, primaryMuscle, equipment, imageId] — loaded after first paint
src/styles.css            all CSS (theme tokens on .wt-root.theme-dark/light; banner styles at the end)
src/lib/constants.js      storage keys, MUSCLE_META colours, COMMON_DAYS
src/lib/helpers.js        dates, norm(), kg<->display conversion
src/lib/storage.js        lsGet/lsSet/lsDel (localStorage, never throws)
src/lib/registry.js       exercise registry, ALIASES, loadExdb, lastPerformance, lastNote, similarPerformances
src/lib/strength.js       1RM maths (Epley/Brzycki), repsValue, fmtLoad
src/lib/equipment.js      equipKind/equipLabel;  src/lib/filters.js  muscle/equipment filter logic
src/lib/plates.js         plate math (v12)          src/lib/rename.js   rename/merge across the log (v12)
src/lib/crewCache.js      useCached(): in-memory cache for other people's data (v12)
src/lib/excel.js          buildWorkbook (pure) + exportToExcel
src/lib/series.js         exerciseSeries, niceTicks, shortDate/fmtNum/toDisp (pure; v13)
src/lib/volume.js         weekly work sets per muscle group (v13)   src/lib/routines.js  routine helpers (v13)
src/lib/rest.js           rest-timer storage, clock format, chime (v13)
src/lib/session.js        cardio detection (kindFor), parseDuration, blankSet, cleanSession (v14)
src/lib/effort.js         effort labels/validation + withOptionalColumn fallback (v14)
src/lib/scheme.js         colour schemes list, ironbook:scheme storage, useScheme (v14)
src/lib/updates.js        reloadBlocked flag shared by MainApp and the update banner
src/components/           BottomNav, RestTimer, RoutineSaver, Shell, LoadingScreen, EquipTag, ExerciseFilters,
                          ExerciseAnim, CustomForm, EffortPicker (v14), SchemePicker (v14)
src/views/                Log, EntryCard, ExercisePicker, History, Progress (+ Volume, Compare), Calendar, Friends,
                          More, Library, Settings, Auth, ResetPassword
public/sw.js              service worker (cache name `ironbook-shell-vN`, v8 as of v15)
public/manifest.webmanifest, icon*.png, icon*.svg, apple-touch-icon.png   PWA assets
supabase/schema.sql                   tables, signup trigger, RLS — the base schema
supabase/patch_signup_trigger.sql     defensive signup trigger
supabase/patch_private_profiles.sql   is_private + visibility-aware RLS
supabase/patch_invite_code.sql        v11: invite-only sign-up (code in private.settings, BEFORE INSERT trigger)
supabase/patch_routines.sql           v13: routines table + owner-only RLS
supabase/patch_workout_effort.sql     v14: workouts.effort smallint (1–10 check), reloads the API schema
.github/workflows/test.yml            v12: runs .testharness/run.sh on every push / PR
.testharness/                         all pre-release checks (§8); seed.js = test data
push.sh  SETUP.md  .env.example
```

---

## 4. Data model (Supabase)

```sql
profiles         (id = auth.users.id, display_name unique, unit 'kg'|'lbs', is_private bool)
workouts         (id uuid, user_id, date, name, entries jsonb, effort smallint 1–10 null, created_at)  -- effort: v14
custom_exercises (id, user_id, name, muscle, equipment, unique(user_id, name))
private.settings (key, value)  -- v11; holds 'invite_code'; not reachable through the app's API
routines         (id, user_id default auth.uid(), name 1–60 chars, entries jsonb, unique(user_id, name))  -- v13, owner-only
```
`entries` = `[{ exercise, muscle, kind?, sets: [{ weight, reps, warmup? }], note? }]`
- **kind: "cardio"** (v14) — sets are `{ time, distance?, warmup? }`: **time in seconds**, **distance in km**
  (shown as mi in lbs mode). Typed as `25` (min), `25:30` or `25.30`. New exercises default to cardio when the
  name looks like cardio (`isCardioName`); after that the last logged kind wins. "Use time" / "Use weight × reps"
  on the card switches it. Cardio is kept out of 1RM, PRs, similar work and set counts; weekly volume shows
  it as minutes; Progress charts minutes.
- **effort** (v14, workouts column, optional 1–10) — how hard the session felt. If the column is missing
  (patch not run) `db.js` retries without it (`withOptionalColumn`) and the picker says it won't be saved yet.
- **weight** is always stored in **kg** (number, or `null` = bodyweight). Converted at display time.
- **reps** is a **string** — `"8"`, or `"6,6"` for each side of a unilateral lift.
- **warmup** (v13, optional `true`) — a warm-up set: shown in brackets "(40×12)", never a top set,
  1RM, PR or volume. Excel export marks its reps "12 w".
- **note** (v12, optional) — free text per exercise per session ("seat 4, pin 7"). Visible to the crew
  like the rest of the log.
- Exercise identity is the normalized name (`norm()` = trimmed, lower-case, single spaces). Renaming is
  done with Library → "Rename across my log" (rewrites every session; can merge two names).
- **workouts.id is made on the phone** (v11, `newId()` in sync.js) so a retried save can't duplicate.

**Access (RLS, "crew" model):** everyone signed in can read everyone's profiles and workouts;
each user writes only their own rows. With `patch_private_profiles.sql` applied, a private user's
profile and workouts are hidden from others. Custom exercises stay readable by all.

**Auth:** Supabase email/password, session in `localStorage` key `ironbook-auth`. Forgot-password
returns to `/?reset=1`. **Sign-up needs the crew invite code** once `patch_invite_code.sql` is run
(wrong code → "Database error saving new user" → shown as "That invite code didn't work").

**Local-only state (localStorage):** draft (`ironbook:draft:<uid>`), offline write queue
(`ironbook:queue:<uid>`), **last-known profile/customs/workouts for instant launch**
(`ironbook:cache:<uid>`, incl. routines; removed on sign-out), bar weight for plate math (`ironbook:bar:kg|lbs`),
rest timer (`ironbook:rest` running timer, `ironbook:restsec` seconds per exercise, `ironbook:resttimer` on/off),
theme (`ironbook:theme`), colour scheme (`ironbook:scheme`, v14).

---

## 5. Features by tab

Bottom navigation (v12): **Log · History · Progress · Crew · More**.

- **Sign-up** — display name, invite code, email, password.
- **Log** — start from a **saved routine** (▶ list, Manage to delete) or pick a day type; it **pre-loads the
  exercises from your last session with that name** (warm-up positions included).
  Each exercise card: *last time*, your **last note** for it, *similar work*, demo, equipment tag,
  **live 1RM** with a new-PR flag, **+ Note**, and for barbell lifts **Plates** (what to load per side
  for each set, 20/15/10 kg or 45/35/25 lb bar). **Tap a set's plate number to mark a warm-up** (W).
  Entering a set's reps starts the **rest timer** (bar above the nav: −15 / +15 / ✕; per-exercise length,
  default 90 s; vibrates/chimes at 0). **Cardio** exercises take time (min:sec) + optional distance instead,
  with total and pace. **Effort 1–10** for the session (optional; tap again to clear). **Save as routine**. Weights 2 decimals; reps accept commas.
- **History** — sessions newest-first with notes and effort (7/10); edit, delete or **save as routine**; "Waiting to sync";
  Excel export in the original spreadsheet layout.
- **Progress** — *By exercise*: stat tiles, two-panel chart (weight line / reps columns, linked crosshair,
  keyboard), readout, data table, range filter, **Compare with** a crew member (est. 1RM on a date axis),
  **PR estimator**. *Weekly volume*: heatmap of work sets per muscle group × last 8 weeks (tap a cell).
- **Crew** — Friends (read-only logs) | Calendar (month grid; anyone non-private). Both cached.
- **Header** — IRONBOOK, theme, kg/lbs, and your initial (opens Settings).
- **More** — Library (custom exercises, 870+ exercise browser with filters and demos, "View progress
  chart", **"Rename across my log"**) and Settings (name, email, password, **colour scheme**, **rest timer on/off**, privacy, sign out).
- **Update banner** (any screen) — "New version ready · Refresh / Later".

---

## 6. How key things work

**Launch (v12, P1):** no fixed wait. With a saved copy (`ironbook:cache:<uid>`) the app renders it at
once and refreshes in the background — so it also opens **offline** ("Offline — showing the log saved
on this phone"). Without one (first launch on a device) the loading screen shows until data arrives.
The 873-exercise list (`exdb.js`) is a separate chunk fetched right after first paint (`loadExdb`);
until it lands, the registry just lacks DB entries. Main bundle: 127 KB gzipped (was 147 KB in v10).

**Offline sync** (`src/sync.js`, `MainApp.commit()` / `flushLocked()` / `syncNow()`): every finish, edit,
delete and rename becomes an op `{opId, kind, id, data}` saved to the queue *first*, applied to the
screen, then sent. Inserts carry phone-made UUIDs (repeat → 23505 = saved). Ops go in order and stop
at the first network error. A newer edit replaces an older queued edit; a delete is always sent.
Update of a deleted row (PGRST116) → cleared; other refusals are kept. **All flushes — launch,
commits, reconnects — share one lock** so ops for a workout can't overtake each other. Retries at
launch, on `online`, and on app resume.

**Crew cache** (`lib/crewCache.js`, P5): `useCached(key, fetcher)` shows the last copy of the crew list
or a friend's workouts instantly and refreshes behind it; cleared on sign-out.

**App updates** (`useAppUpdate`): update check on every resume; banner on `controllerchange` (not on
first install); auto-reload on the next resume unless a past session is being edited (`lib/updates.js`).

**Exercise registry** (`buildRegistry(custom, workouts, exdb)`): merges logged, custom and DB exercises.
`ALIASES` maps everyday names to DB entries (equipment + demo only; nothing renamed).

**Plate math** (`lib/plates.js`): greedy per side from 25/20/15/10/5/2.5/1.25 kg or 45/35/25/10/5/2.5 lb;
reports weight that can't be loaded. Shown only when the exercise's equipment says barbell.

**Rename/merge** (`lib/rename.js`): `renameInWorkouts` returns one update per affected session; MainApp
queues them all, then syncs once. Merging into an existing name adopts that exercise's muscle. A custom
exercise of the old name is renamed too when the new name is free.

**Excel export** (`lib/excel.js`): `buildWorkbook` (pure) → `write-excel-file/universal` → Blob → download.
Replaced npm `xlsx` 0.18.5 in v12 (unmaintained on npm, known advisories); a cell-by-cell comparison
of 1,801 cells on Srijan's data matched exactly. `npm audit --omit=dev` → 0 vulnerabilities.

**Top set & 1RM:** heaviest *work* set (ties → more reps; warm-ups excluded via `workSets`); 1RM = average
of Epley and Brzycki; 50 kg × 8 → 62.5.

**Weekly volume** (`lib/volume.js`): Monday-start weeks in UTC; a work set needs reps or a weight. Heatmap
ramp is one violet hue, light→dark (light mode) / dark→bright (dark mode), `--vol-1…5`; lightness checked
monotonic and in-cell numbers ≥ 4.5:1. Empty cells are outlined, not filled.

**Compare** (`views/Compare.jsx`): its own chart on a real date axis (the main chart spaces sessions by
index). You = `--viz-w` violet, them = `--viz-c` orange (`#eb6834` / `#d95926`), validated CVD ΔE 27 / 25.
Exercises match by name.

**Rest timer** (`lib/rest.js`, `components/RestTimer.jsx`): stored as `{endsAt,total,exercise}` so it
survives tab switches and reopening; keyed by `endsAt` so a new rest re-mounts it; chime needs one tap to
unlock audio on iOS; vibration works on Android only. Not started while editing a past session.

**Routines** (`lib/routines.js`): store exercise names, muscles, set count and warm-up flags only. Missing
table (patch not run) → `isMissingTable` → the save form explains which patch to run.

**Progress chart:** two aligned panels, not a dual-axis plot. Palette (validated both themes):
weight `#7148b5` / `#9d7ee0`, reps `#0f8a68` / `#1f9e76` (light / dark).

**Look (v13 refresh, same layout as before):** "Violet Current" tokens on `.wt-root.theme-*`:
dark `--bg #0F0D14 --panel #1A1722 --panel2 #24202F --accent #7E50C4 --accent-soft #B394EA --dim #A39BB5`;
light `--bg #F4F2F8 --panel #FFF --accent #5F3687 --accent-soft #6A43A0 --dim #5F5772`; plus `--edge`
(card outline), `--lift` (card shadow), `--glow` (primary button shadow). All text pairs ≥ 4.5:1; the dark
accent is 3.5:1 against the background. Type: Barlow body, Barlow Condensed for titles and numbers;
labels are sentence case (no tracked caps). Radius by level: cards 16–20, inner blocks 12, inputs 12–14,
chips pill. **Signature: each set number is a plate** — outlined until the set has reps, then a thick ring
in the muscle's competition-plate colour (`MUSCLE_META`) with the number in the hole; warm-ups are a
dashed ring with W. Set inputs are 48 px tall with 22 px condensed numbers. Bottom nav is translucent
(backdrop blur). Header fits 360 px phones (checked by the harness).

**Colour schemes (v15):** Violet (the base tokens, no class) plus Rust, Turf, Pool, Oxblood, Neon, Chalk — each a
pairing (surfaces in one colour, accent in another, its own ink on the accent, `--mark` wordmark bar, `--art`
faint background layer). Replaced v14's Blue/Red/Gold/Green/Iron (a saved old id falls back to Violet). Per phone, independent of light/dark: `.wt-root.scheme-<id>.theme-<mode>`. Their CSS is
**generated** by `.testharness/schemes.py` (OKLCH; checks text ≥ 4.5:1, accent ≥ 3:1, chart pairs incl.
colour-blind separation) between the "v14 colour schemes" markers in styles.css — edit the script and run
`python3 .testharness/schemes.py --write src/styles.css`; `run.sh` fails if the CSS is stale. Each scheme
swaps the chart weight/reps colours too. Muscle plate colours don't change.

**PWA:** network-first navigations, cache-first assets, Supabase never cached; safe-area aware
(header, bottom nav, toast).

---

## 7. Rules for editing (learned the hard way)

1. **All React hooks go above any early `return`.** The lint step (`react-hooks/rules-of-hooks`) fails
   the harness on this. `App` keeps its early returns inside the nested `renderScreen()`.
2. **Run `bash .testharness/run.sh` before packaging** (§8). CI runs it again on GitHub.
3. **Look at screenshots** of anything visual in both themes (`shots-v12.mjs` etc.).
4. Adding an alias? Every target must be an exact DB name (`run.sh` checks; it fails below 60 aliases).
5. Changing the app shell or anything cached? Bump `CACHE` in `public/sw.js`.
6. Schema changes = a new `supabase/patch_*.sql`, `begin; … commit;`, **no destructive statements**
   unless agreed. Test against local Postgres 16 with a mock `auth.users` first.
7. Weights in kg in storage, reps as strings, convert only at the edges.
8. **Workout writes go through `commit(makeOp(...))`** (or the queue directly, as rename does) — never
   straight to `insertWorkout` / `updateWorkout` / `deleteWorkout`.
9. A release that deletes a file must say so in its push notes (`cp -R` won't remove it).
10. Pure logic goes in `src/lib/` with a unit test in `.testharness/unit.mjs` or `sync-unit.mjs`.
11. Any new module that imports `db.js` is covered by the test stub automatically (the alias matches
    any relative path); `run.sh` fails if the real `db.js` ever leaks into the test build.
12. `npm uninstall` prunes the `--no-save` test tools — reinstall them afterwards (README).

---

## 8. Test harness (`.testharness/`)

`bash .testharness/run.sh`: lint (+ a fixture proving the hooks rule is live) → alias check →
colour-scheme contrast check → unit tests (30 sync-queue + 60 plate/rename/note/warm-up/series/volume/routine/rest/cardio/effort) → production build →
stubbed test build (fails if the real db.js leaked in) → **187 browser checks** in real Chromium (incl. a
fake clock for the rest timer, and a 360 px layout pass in both themes). `shots-all.mjs <dir>` screenshots
every screen in both themes. `db-stub.js` replaces Supabase in
memory (Srijan's 41 sessions from `seed.js`) and can simulate offline (`window.__stub.offline`, also
settable before load), a lost reply (`loseNextReply`), counts reads (`reads`), and the invite check
(`?signedout=1`, code `lift-together`), a missing routines table (`noRoutinesTable`), a missing effort column (`noEffortColumn`); Srijan has 5 lat
pulldown sessions for Compare. `browser.mjs` finds Chromium (CHROME_PATH → sandbox → Playwright's
own). Playwright and ESLint are **not** in `package.json` — see `.testharness/README.md`.

---

## 9. Setup state — verify before assuming

| Item | Status |
|---|---|
| `schema.sql` | run (tables exist) |
| `patch_signup_trigger.sql` | run |
| `import_srijan_history.sql` (41 sessions) | provided; confirm in Table Editor → workouts |
| `patch_private_profiles.sql` | **was not yet run as of 7 Sep** — the privacy toggle errors until it is |
| `patch_invite_code.sql` | **v11 — not confirmed run.** Edit `CHANGE-ME` first; until it runs, sign-up stays open |
| `patch_routines.sql` | **v13 — not yet run.** Until it is, "Save as routine" explains it's needed |
| `patch_workout_effort.sql` | **v14 — not yet run.** Until it is, effort isn't saved (the picker says so); everything else works |
| GitHub Actions | v12 adds the workflow; the first push turns it on (nothing to configure) |
| Auth → URL Configuration: Site URL + redirect `https://ironbook-zeta.vercel.app/**` | needed for password-reset links; confirm |
| Auth → "Confirm email" | off (the invite code is the gate) |

Supabase free projects **pause after ~7 idle days** — restore from the dashboard if the app can't load.

---

## 10. Known limitations and ideas

- Srijan's sheet had an undated trailing session in "lower" and "upper" — not imported.
- Lat pulldown shows 20–30 kg on three June back days (from the sheet) — possibly a different machine.
- Crew visibility is all-or-nothing (private or visible to everyone signed in).
- The invite gate also blocks "Add user" in the Supabase dashboard (see the patch's footer).
- Notes are per exercise per session; there's no whole-session note (would need a column).
- Plate math assumes standard plates; collars aren't counted.
- Free-tier email is rate-limited, so reset emails can be slow or land in spam.
- Rest timer can't notify while the phone is locked (no push); it shows "Rest over" when you return.
- Compare and rename match exercises by name; two people's different names for one lift won't line up.
- Cardio has one time + distance per set; no heart rate, incline or calories.
- Everything in the 7 Oct proposal (Claude Docs) has shipped as of v13 (F3 became "remove Import history").

---

## 11. Version history (short)

| Ver | Date | Summary |
|---|---|---|
| v1–v5 | Aug 2026 | Claude artifact → React/Vite + Supabase + Vercel; auth, crew sync, PWA, icon, editing |
| v6 | 31 Aug | Calendar, decimal weights, safe-area fix, forgot password |
| v7 | 6 Sep | push.sh, picker demos, split prefill, private profiles, iOS comma fix |
| v8 | 21 Sep | Drag reorder — **introduced the blank-page bug** |
| v9 | 21 Sep | Bug fixed, grip bar + ▲▼, test harness |
| v10 | 26 Sep | Progress charts, PR estimator, muscle sub-filters, equipment tags, name aliases, live 1RM |
| v11 | 7 Oct | Invite-only sign-up, offline-safe sync, Import history removed, update banner, hooks lint |
| v12 | 13 Oct | Instant/offline launch, lazy exercise list, crew cache, xlsx replaced, CI, App.jsx split, bottom nav, exercise notes, rename/merge, plate calculator |
| v13 | 13 Oct | Warm-up sets, rest timer, saved routines, weekly volume heatmap, compare with crew; visual refresh (plate set numbers, sentence-case labels, deeper surfaces, bigger numbers) |
| v14 | 13 Oct | Colour schemes (6), cardio logged as time + distance, effort 1–10 per workout |
| v15 | 13 Oct | Colour schemes redone: Rust, Turf, Pool, Oxblood, Neon, Chalk (Violet stays default) |
