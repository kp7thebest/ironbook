# Ironbook — Project Context

> Hand this file to any future chat working on Ironbook. It describes the app **as it stands at v11
> (7 Oct 2026)** — what exists, how it's built, how changes get shipped, and the traps already hit.
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

1. Claude edits, **runs `bash .testharness/run.sh`**, and delivers `ironbook-vNN.zip`.
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
   **`cp` never deletes.** When a release removes a file, delete it in the repo before pushing
   (each release's notes say which, e.g. v11: `rm src/seed.js`).
4. If the release includes a `supabase/patch_*.sql`, run it in the Supabase SQL editor (the notes say
   whether it must go before or after the push).
5. Vercel builds in ~1 min. From v11 on, an open app shows **"New version ready · Refresh"** and
   refreshes itself the next time it's reopened. (Getting *onto* v11 still takes the old two relaunches,
   because the phone is running v10 code until then.)

### Known traps
| Symptom | Cause | Fix |
|---|---|---|
| `403 … denied to karthikperiasamy-nc` | Mac's git credential is Karthik's work account | `gh auth login` → GitHub.com → HTTPS → browser, sign in as **kp7thebest** (private window) → `gh auth setup-git` → `git push`. Still failing: delete `github.com` in Keychain Access |
| `Password authentication is not supported` | git is asking for a password instead of using gh's token | `gh auth setup-git`, then `git push` |
| `permission denied: ./push.sh` | `cp` dropped the exec bit | `chmod +x push.sh`, or `bash push.sh "msg"` |
| `cp: … are identical` | Terminal is *inside* the unzipped copy, not the repo | `cd ~/Downloads/ironbook` first |
| `git status` shows nothing after copying | Wrong source folder name | Check `ls ~/Downloads \| grep -i ironbook` |
| zsh `accepts 0 arg(s), received N` | Pasted a command with an inline `# comment` | Paste commands without comments |
| Phone still shows old UI | Service worker cache | Relaunch twice (pre-v11) / tap Refresh on the banner; bump `CACHE` in `public/sw.js` when the shell changes |
| iPhone opens in Safari, not full-screen | Icon was added before the manifest existed | Delete icon, re-add from **Safari** (Chrome on iOS can't install PWAs) |

`push.sh` stages, commits, and pushes; if there's nothing to commit but unpushed commits exist, it
pushes those. Commits should be authored as `kp7thebest <kp7thebest@users.noreply.github.com>`.

---

## 3. Files

```
src/App.jsx        entire UI (~2.5k lines) — components, helpers, and the CSS string at the bottom
src/sync.js        offline write queue for workouts (no React; unit-tested) — see §6
src/db.js          every Supabase call (auth, profiles, workouts, custom exercises)
src/exdb.js        873 exercises from free-exercise-db: [name, primaryMuscle, equipment, imageId]
src/main.jsx       React entry
public/sw.js       service worker (cache name `ironbook-shell-vN`, v4 as of v11)
public/manifest.webmanifest, icon*.png, icon*.svg, apple-touch-icon.png   PWA assets (barbell icon)
supabase/schema.sql                   tables, signup trigger, RLS — the base schema
supabase/patch_signup_trigger.sql     defensive signup trigger (fixed "Database error saving new user")
supabase/patch_private_profiles.sql   is_private + visibility-aware RLS (transaction-wrapped)
supabase/patch_invite_code.sql        v11: invite-only sign-up (code in private.settings, BEFORE INSERT trigger)
.testharness/      all pre-release checks; `run.sh` runs them (see §8). Also holds seed.js (test data)
push.sh            one-command deploy
SETUP.md           first-time Supabase/Vercel setup
.env.example       VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (real values live in Vercel env vars)
```

Main components in `App.jsx`: `App` (+ `useAppUpdate` banner) → `AuthScreen` / `ResetPasswordScreen` /
`MainApp`. `MainApp` tabs: `LogView` (+ `EntryCard`, `ExercisePicker`, `PickRow`), `HistoryView`,
`ProgressView` (+ `ProgressChart`, `PREstimator`), `CalendarView`, `FriendsView`,
`ExercisesView` (Library, + `CustomForm`), `SettingsView`. Shared: `ExerciseFilters`, `EquipTag`,
`ExerciseAnim`, `LoadingScreen`.

---

## 4. Data model (Supabase)

```sql
profiles         (id = auth.users.id, display_name unique, unit 'kg'|'lbs', is_private bool)
workouts         (id uuid, user_id, date, name, entries jsonb, created_at)
custom_exercises (id, user_id, name, muscle, equipment, unique(user_id, name))
private.settings (key, value)  -- v11; holds 'invite_code'; not reachable through the app's API
```
`entries` = `[{ exercise, muscle, sets: [{ weight, reps }] }]`
- **weight** is always stored in **kg** (number, or `null` = bodyweight). Converted at display time.
- **reps** is a **string** — `"8"`, or `"6,6"` for each side of a unilateral lift.
- Exercise identity is the normalized name (`norm()` = trimmed, lower-case, single spaces).
- **workouts.id is made on the phone** (v11, `newId()` in sync.js) so a retried save can't duplicate.

**Access (RLS, "crew" model):** everyone signed in can read everyone's profiles and workouts;
each user writes only their own rows. With `patch_private_profiles.sql` applied, a private user's
profile and workouts are hidden from others (`can_view()` helper). Custom exercises stay readable
by all (names/muscles only) so shared history always renders.

**Auth:** Supabase email/password. Session persisted in `localStorage` key `ironbook-auth` with
auto-refresh, so users stay signed in across PWA launches. Forgot-password sends a reset email that
returns to `/?reset=1` → `ResetPasswordScreen`. **Sign-up needs the crew invite code** (v11, once
`patch_invite_code.sql` is run): the app sends it as `invite_code` in the sign-up metadata; the
trigger checks it, strips it, or refuses the sign-up ("Database error saving new user", which the
app shows as "That invite code didn't work").

**Local-only state:** in-progress draft (`ironbook:draft:<uid>`), offline write queue
(`ironbook:queue:<uid>`, see §6), theme (`ironbook:theme`).

---

## 5. Features by tab

- **Sign-up** — display name, **invite code**, email, password.
- **Log** — pick a day type (chips: your names + push/pull/legs/upper/…); it **pre-loads the
  exercises from your last session with that name** (a banner says so, or says there was none).
  Each exercise card shows *last time*, *similar work* for the same muscle, a "How it's done" demo,
  an equipment tag, and a **live 1-rep-max estimate** that flags a new estimated PR. Weights accept
  2 decimals; reps accept commas (iOS keyboard fixed). Reorder with the full-width grip bar or ▲▼.
- **History** — sessions newest-first; edit (full edit in the Log editor) or delete; Excel export in
  the original spreadsheet layout. Sessions not yet on the server say **"Waiting to sync"**.
- **Progress** — per exercise: stat tiles (latest top set, heaviest, est. 1RM, with deltas),
  a two-panel chart (weight line above, reps columns below, shared date axis, linked crosshair,
  tap/drag/arrow-key inspection), a session readout, a data table, range filter (All/3M/1M),
  and the **PR estimator**. Bodyweight exercises get a reps-only chart.
- **Calendar** — month grid of workout days with names; view any (non-private) crew member.
- **Friends** — read-only view of others' history.
- **Library** — manage custom exercises (edit/delete your own; shows who added each), browse all
  exercises with filters, demos, and "View progress chart →" for anything you've logged.
- **Settings** — display name, email, password, privacy toggle, sign out. (Import history was
  removed in v11; Srijan's sheet history is already in his account.)
- **Header** — kg/lbs toggle (per profile), light/dark theme (per device).
- **Update banner** (any screen) — "New version ready · Refresh / Later".

---

## 6. How key things work

**Offline sync** (`src/sync.js`, used by `MainApp.commit()` / `syncNow()`): every finish, edit and
delete becomes an op `{opId, kind: insert|update|delete, id, data}` that is saved to the phone's queue
*first*, applied to the screen at once (`applyOps`), then sent (`flushOps`). Rules:
- Inserts carry a phone-made UUID; a repeat is rejected by Postgres with **23505**, which counts as
  saved → a save whose reply was lost is never duplicated.
- Ops go in order and stop at the first network error, so an edit never overtakes its insert.
- A newer edit replaces an older queued edit; a delete drops queued ops for that workout and is
  always sent. Nothing already possibly in flight is ever merged, so changes made mid-sync survive
  (`settle()` removes exactly the ops that were sent, by `opId`).
- Update of a deleted row (**PGRST116**) or delete of a missing row → cleared. Any other refusal →
  kept (never silently dropped) and later ops for that workout wait behind it.
- Retries: at launch, on the browser `online` event, and whenever the app comes to the foreground.
  Toasts: "Workout saved" / "Saved offline · syncs when back online" / "Offline changes synced".
- v10's queue (a plain array of sessions) is migrated to ops on first v11 launch.

**App updates** (`useAppUpdate` in App.jsx): `sw.js` activates new versions immediately
(skipWaiting + clients.claim). The app asks for an update check each time it comes to the foreground;
when a new worker takes control (`controllerchange`, ignored on first install) it shows the banner,
and the next time the app is reopened it reloads by itself — unless a past session is open for
editing (`reloadBlocked`, set by MainApp). An in-progress workout is in localStorage, so it survives.

**Exercise registry** (`buildRegistry`): merges your logged exercises, custom exercises, and the
873-entry DB. Everyday names are mapped to DB entries through `ALIASES` (e.g. "bench press" →
"Barbell Bench Press - Medium Grip") plus a singular/plural fallback, so your own exercises get
**equipment tags and demo images**. Aliases borrow equipment + demo only; nothing is renamed.

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
in `MUSCLE_META` and don't change with theme. The update banner sits outside `.wt-root` and carries
its own small stylesheet (`UPDATE_CSS`, same accent in both themes).

**PWA:** manifest + service worker (network-first navigations, cache-first assets, Supabase never
cached). iOS safe-area insets are respected so the header clears the notch.

---

## 7. Rules for editing (learned the hard way)

1. **All React hooks go above any early `return`.** v8 put four hooks below `if (!current) return`
   in `LogView`; saving or discarding a workout then blanked the whole screen. Since v11 the lint
   step fails the harness on this (`react-hooks/rules-of-hooks`). `App` keeps its early returns inside
   the nested `renderScreen()` for the same reason.
2. **Run `bash .testharness/run.sh` before packaging** (§8). A passing build proves nothing about runtime.
3. **Look at screenshots** of anything visual in both themes — the tests don't catch cramped labels.
4. Adding an alias? Every target must be an exact DB name (`run.sh` checks).
5. Changing the app shell or anything cached? Bump `CACHE` in `public/sw.js`.
6. Schema changes = a new `supabase/patch_*.sql`, wrapped in `begin; … commit;`, **no destructive
   statements** (no DROP TABLE/COLUMN, DELETE, TRUNCATE) unless explicitly agreed. The user runs it
   in the Supabase SQL editor. Test it first against a local Postgres with a mock `auth.users`
   (the sandbox has Postgres 16).
7. Weights in kg in storage, reps as strings, convert only at the edges.
8. **Workout writes go through `commit(makeOp(...))`**, never straight to `insertWorkout` /
   `updateWorkout` / `deleteWorkout` — otherwise they skip the offline queue.
9. A release that deletes a file must say so in its push notes (`cp -R` won't remove it).

---

## 8. Test harness (`.testharness/`)

`bash .testharness/run.sh` runs lint (+ a fixture proving the hooks rule is live), the alias check,
21 unit tests of the sync queue, a production build, and 84 browser checks against a stubbed
database. `db-stub.js` replaces the Supabase layer in memory (seeded with Srijan's 41 real sessions
from `.testharness/seed.js`) and can simulate going offline (`window.__stub.offline`), a lost reply
(`loseNextReply`), and the invite check (`?signedout=1`, code `lift-together`). The browser checks
cover boot, prefill, reorder, decimal/comma input, Finish, Discard, every tab, edit-and-save,
Progress chart, PR estimator, filters, aliases, live 1RM, the Library deep link, and the v11 offline
sync, invite code, Import removal and update banner. Playwright and ESLint are deliberately **not**
in `package.json` (they'd slow Vercel installs) — see `.testharness/README.md`.

---

## 9. Setup state — verify before assuming

| Item | Status |
|---|---|
| `schema.sql` | run (tables exist) |
| `patch_signup_trigger.sql` | run (Karthik + Srijan profiles created after it) |
| `import_srijan_history.sql` (41 sessions) | provided; confirm in Table Editor → workouts |
| `patch_private_profiles.sql` | **was not yet run as of 7 Sep** — the privacy toggle errors until it is |
| `patch_invite_code.sql` | **v11 — not yet run.** Edit `CHANGE-ME` first; until it runs, sign-up stays open |
| Auth → URL Configuration: Site URL + redirect `https://ironbook-zeta.vercel.app/**` | needed for password-reset links; confirm |
| Auth → "Confirm email" | turned off so friends can sign up instantly (the invite code is now the gate) |

Supabase free projects **pause after ~7 idle days** — restore from the dashboard if the app can't load.

---

## 10. Known limitations and ideas

- Exercise identity is by name; renaming an exercise splits its history.
- Srijan's sheet had an undated trailing session in the "lower" and "upper" sheets — not imported.
- Lat pulldown shows 20–30 kg on three June back days (from the sheet) — possibly a different
  machine; editable via History → Edit.
- Seven tabs overflow on narrow phones (the bar scrolls); a bottom nav may be better.
- Crew visibility is all-or-nothing (private or visible to everyone signed in); no invite-only groups.
- The invite gate also blocks "Add user" in the Supabase dashboard (see the patch's footer).
- Launch still waits a fixed 3 s on the loading screen, and needs a connection (no offline launch).
- Free-tier email is rate-limited, so reset emails can be slow or land in spam.
- The improvement proposal (7 Oct 2026, Claude Docs) lists the backlog: P1–P5 speed, S1–S2 shipping,
  N1–N9 features. F1, F2, F4, F5 shipped in v11; F3 became "remove Import history".

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
| v11 | 7 Oct | Invite-only sign-up, offline-safe sync (no duplicates; edits/deletes queue), Import history removed, update banner, hooks lint in the harness |
