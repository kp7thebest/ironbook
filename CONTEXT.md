# Ironbook — Project Context

> Hand this file to any future chat working on Ironbook. It describes the app **as it stands at v10
> (26 Sep 2026)** — what exists, how it's built, how changes get shipped, and the traps already hit.
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
| Backend | Supabase project `wexlnamaftgcmkjthgtv`, region ap-south-1 (Mumbai), free tier |
| Stack | React 18 + Vite, single-file UI (`src/App.jsx`), `@supabase/supabase-js`, SheetJS (lazy) |
| Maintainer | Karthik (GitHub `kp7thebest`) |

---

## 2. How changes get shipped (read this first)

The code is edited in a Claude sandbox, not on the Mac. The loop is:

1. Claude edits, **runs the test harness**, and delivers `ironbook-vNN.zip`.
2. Karthik unzips it in `~/Downloads`. macOS names it `ironbook 2` / `ironbook 3`… because
   `~/Downloads/ironbook` (the real git repo) already exists.
3. Copy into the repo and push:
   ```bash
   ls ~/Downloads | grep -i ironbook          # find the unzipped folder's name
   cd ~/Downloads/ironbook
   cp -R ~/Downloads/"ironbook 2"/. .         # note the /. and the quotes
   chmod +x push.sh                           # the copy drops the executable bit
   ./push.sh "short description"
   ```
4. Vercel builds in ~1 min. On each phone, **close and reopen the app twice** (first launch fetches
   the new service worker, second activates it).

### Known traps
| Symptom | Cause | Fix |
|---|---|---|
| `403 … denied to karthikperiasamy-nc` | Mac's git credential is Karthik's work account | `gh auth login` → GitHub.com → HTTPS → browser, sign in as **kp7thebest** (private window) → `gh auth setup-git` → `git push`. Still failing: delete `github.com` in Keychain Access |
| `permission denied: ./push.sh` | `cp` dropped the exec bit | `chmod +x push.sh`, or `bash push.sh "msg"` |
| `cp: … are identical` | Terminal is *inside* the unzipped copy, not the repo | `cd ~/Downloads/ironbook` first |
| `git status` shows nothing after copying | Wrong source folder name | Check `ls ~/Downloads \| grep -i ironbook` |
| zsh `accepts 0 arg(s), received N` | Pasted a command with an inline `# comment` | Paste commands without comments |
| Phone still shows old UI | Service worker cache | Relaunch twice; bump `CACHE` in `public/sw.js` when the shell changes |
| iPhone opens in Safari, not full-screen | Icon was added before the manifest existed | Delete icon, re-add from **Safari** (Chrome on iOS can't install PWAs) |

`push.sh` stages, commits, and pushes; if there's nothing to commit but unpushed commits exist, it
pushes those. Commits should be authored as `kp7thebest <kp7thebest@users.noreply.github.com>`.

---

## 3. Files

```
src/App.jsx        entire UI (~2.4k lines) — components, helpers, and the CSS string at the bottom
src/db.js          every Supabase call (auth, profiles, workouts, custom exercises)
src/exdb.js        873 exercises from free-exercise-db: [name, primaryMuscle, equipment, imageId]
src/seed.js        Srijan's original spreadsheet history (41 sessions), used by "Import history"
src/main.jsx       React entry
public/sw.js       service worker (cache name `ironbook-shell-vN`)
public/manifest.webmanifest, icon*.png, icon*.svg, apple-touch-icon.png   PWA assets (barbell icon)
supabase/schema.sql                   tables, signup trigger, RLS — the base schema
supabase/patch_signup_trigger.sql     defensive signup trigger (fixed "Database error saving new user")
supabase/patch_private_profiles.sql   is_private + visibility-aware RLS (transaction-wrapped)
.testharness/      end-to-end tests with an in-memory DB stub (see §8)
push.sh            one-command deploy
SETUP.md           first-time Supabase/Vercel setup
.env.example       VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (real values live in Vercel env vars)
```

Main components in `App.jsx`: `App` → `AuthScreen` / `ResetPasswordScreen` / `MainApp`.
`MainApp` tabs: `LogView` (+ `EntryCard`, `ExercisePicker`, `PickRow`), `HistoryView`,
`ProgressView` (+ `ProgressChart`, `PREstimator`), `CalendarView`, `FriendsView`,
`ExercisesView` (Library, + `CustomForm`), `SettingsView`. Shared: `ExerciseFilters`, `EquipTag`,
`ExerciseAnim`, `LoadingScreen`.

---

## 4. Data model (Supabase)

```sql
profiles         (id = auth.users.id, display_name unique, unit 'kg'|'lbs', is_private bool)
workouts         (id, user_id, date, name, entries jsonb, created_at)
custom_exercises (id, user_id, name, muscle, equipment, unique(user_id, name))
```
`entries` = `[{ exercise, muscle, sets: [{ weight, reps }] }]`
- **weight** is always stored in **kg** (number, or `null` = bodyweight). Converted at display time.
- **reps** is a **string** — `"8"`, or `"6,6"` for each side of a unilateral lift.
- Exercise identity is the normalized name (`norm()` = trimmed, lower-case, single spaces).

**Access (RLS, "crew" model):** everyone signed in can read everyone's profiles and workouts;
each user writes only their own rows. With `patch_private_profiles.sql` applied, a private user's
profile and workouts are hidden from others (`can_view()` helper). Custom exercises stay readable
by all (names/muscles only) so shared history always renders.

**Auth:** Supabase email/password. Session persisted in `localStorage` key `ironbook-auth` with
auto-refresh, so users stay signed in across PWA launches. Forgot-password sends a reset email that
returns to `/?reset=1` → `ResetPasswordScreen`.

**Local-only state:** in-progress draft (`ironbook:draft:<uid>`), offline save queue
(`ironbook:queue:<uid>`, flushed on next load), theme (`ironbook:theme`).

---

## 5. Features by tab

- **Log** — pick a day type (chips: your names + push/pull/legs/upper/…); it **pre-loads the
  exercises from your last session with that name** (a banner says so, or says there was none).
  Each exercise card shows *last time*, *similar work* for the same muscle, a "How it's done" demo,
  an equipment tag, and a **live 1-rep-max estimate** that flags a new estimated PR. Weights accept
  2 decimals; reps accept commas (iOS keyboard fixed). Reorder with the full-width grip bar or ▲▼.
- **History** — sessions newest-first; edit (full edit in the Log editor) or delete; Excel export in
  the original spreadsheet layout.
- **Progress** — per exercise: stat tiles (latest top set, heaviest, est. 1RM, with deltas),
  a two-panel chart (weight line above, reps columns below, shared date axis, linked crosshair,
  tap/drag/arrow-key inspection), a session readout, a data table, range filter (All/3M/1M),
  and the **PR estimator**. Bodyweight exercises get a reps-only chart.
- **Calendar** — month grid of workout days with names; view any (non-private) crew member.
- **Friends** — read-only view of others' history.
- **Library** — manage custom exercises (edit/delete your own; shows who added each), browse all
  exercises with filters, demos, and "View progress chart →" for anything you've logged.
- **Settings** — display name, email, password, privacy toggle, one-time history import, sign out.
- **Header** — kg/lbs toggle (per profile), light/dark theme (per device).

---

## 6. How key things work

**Exercise registry** (`buildRegistry`): merges your logged exercises, custom exercises, and the
873-entry DB. Everyday names are mapped to DB entries through `ALIASES` (e.g. "bench press" →
"Barbell Bench Press - Medium Grip") plus a singular/plural fallback, so your own exercises get
**equipment tags and demo images**. Only 4 of the 24 names in Srijan's sheet matched the DB exactly
before this. Aliases borrow equipment + demo only; nothing is renamed.

**Equipment** (`equipKind`): Bodyweight / Free weights / Machine / Cable / Bands / Other. DB entries
with blank equipment are bodyweight (push-ups, lunges, stretches). A logged name with no DB match
has unknown equipment and shows **no tag** rather than a guess. Custom exercises choose from a list
that uses the DB's vocabulary.

**Filters** (`ExerciseFilters`, used by the picker and Library): group chips (Chest, Back,
Shoulders, Arms, Legs, Core, Other) → specific-muscle chips (e.g. Arms → Biceps / Triceps /
Forearms) → equipment select.

**Top set & 1RM:** a session's *top set* is its heaviest set (ties → more reps). 1RM estimate =
average of Epley `w(1 + r/30)` and Brzycki `w·36/(37 − r)`; unilateral reps use the average of the
sides. 50 kg × 8 → 62.5 kg. Accuracy drops above ~10 reps (the UI warns). `weightForReps` inverts it
for the rep-max table.

**Progress chart design:** deliberately **two aligned panels, not one dual-y-axis plot** — two
scales on one plot make crossings and relative slopes an artifact of axis scaling. Chart colors
were run through the palette validator for both themes (all checks pass):

| | light (surface #FFFFFF) | dark (surface #1C1926) |
|---|---|---|
| weight (`--viz-w`) | `#7148b5` | `#9d7ee0` |
| reps (`--viz-r`) | `#0f8a68` | `#1f9e76` |

Delta colors always ship with ▲/▼ + text, never color alone. Every chart value is also in the data table.

**Theme:** "Violet Current". Tokens on `.wt-root.theme-dark/light`: `--bg --panel --panel2 --line
--text --dim --accent (#5F3687) --accent-soft --accent-ink`, plus `--viz-*` and `--tag-bw`. Muscle
colors (competition plates: legs red, chest blue, back green, shoulders yellow, arms silver) are fixed
in `MUSCLE_META` and don't change with theme.

**PWA:** manifest + service worker (network-first navigations, cache-first assets, Supabase never
cached). iOS safe-area insets are respected so the header clears the notch.

---

## 7. Rules for editing (learned the hard way)

1. **All React hooks go above any early `return`.** v8 put four hooks below `if (!current) return`
   in `LogView`; saving or discarding a workout then blanked the whole screen. `MainApp`,
   `LogView`, and `ProgressView` all have early returns — add state at the top.
2. **Run the test harness before packaging** (§8). A passing build proves nothing about runtime.
3. **Look at screenshots** of anything visual in both themes — the tests don't catch cramped labels.
4. Adding an alias? Run `node .testharness/check-aliases.mjs`; every target must be an exact DB name.
5. Changing the app shell or anything cached? Bump `CACHE` in `public/sw.js`.
6. Schema changes = a new `supabase/patch_*.sql`, wrapped in `begin; … commit;`, **no destructive
   statements** (no DROP TABLE/COLUMN, DELETE, TRUNCATE) unless explicitly agreed. The user runs it
   in the Supabase SQL editor.
7. Weights in kg in storage, reps as strings, convert only at the edges.

---

## 8. Test harness (`.testharness/`)

`db-stub.js` replaces the Supabase layer in memory (seeded with Srijan's 41 real sessions);
`vite.test.config.js` swaps it in; `e2e.mjs` drives real Chromium through 52 checks: boot, prefill,
reorder, decimal/comma input, **Finish**, **Discard**, every tab, edit-and-save, Progress chart
plotting/interaction/keyboard/table/range/bodyweight, PR estimator math, muscle and equipment
filters, alias-derived tags and demos, the live 1RM + PR badge, and the Library deep link.
Playwright is deliberately **not** in `package.json` (would slow Vercel installs). See
`.testharness/README.md` to run it.

---

## 9. Setup state — verify before assuming

| Item | Status |
|---|---|
| `schema.sql` | run (tables exist) |
| `patch_signup_trigger.sql` | run (Karthik + Srijan profiles created after it) |
| `import_srijan_history.sql` (41 sessions) | provided; confirm in Table Editor → workouts |
| `patch_private_profiles.sql` | **was not yet run as of 7 Sep** — the privacy toggle errors until it is |
| Auth → URL Configuration: Site URL + redirect `https://ironbook-zeta.vercel.app/**` | needed for password-reset links; confirm |
| Auth → "Confirm email" | turned off so friends can sign up instantly |

Supabase free projects **pause after ~7 idle days** — restore from the dashboard if the app can't load.

---

## 10. Known limitations and ideas

- Exercise identity is by name; renaming an exercise splits its history.
- Srijan's sheet had an undated trailing session in the "lower" and "upper" sheets — not imported.
- Lat pulldown shows 20–30 kg on three June back days (from the sheet) — possibly a different
  machine; editable via History → Edit.
- Seven tabs overflow on narrow phones (the bar scrolls); a bottom nav may be better.
- Crew visibility is all-or-nothing (private or visible to everyone signed in); no invite-only groups.
- Free-tier email is rate-limited, so reset emails can be slow or land in spam.
- Ideas: rest timer, per-exercise notes, volume/week charts, plate calculator, templates, compare
  progress with a friend on one exercise.

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
