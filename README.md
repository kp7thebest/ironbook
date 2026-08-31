# 🏋️ Ironbook

**A workout tracker for our crew.** Log sets, instantly see what you lifted last time (and how similar exercises went), browse 870+ exercises with demo animations, and check your friends' training logs.

Built with **React + Vite**, synced with **Supabase**, deployable free on **Vercel**. Works in any browser — add it to your phone's home screen for an app-like experience.

## Features

- **Smart logging** — every exercise card shows your last performance for that exact movement, plus recent numbers for similar exercises in the same muscle group (color-coded by competition-plate colors: legs red, chest blue, back green, shoulders yellow, arms silver).
- **873-exercise database** with two-frame "how it's done" demo animations, plus custom exercises.
- **Friends** — everyone in the crew can browse each other's logs, read-only. You write only your own.
- **Offline-friendly** — in-progress workouts are kept locally; finished sessions queue and sync when you're back online.
- **kg / lbs**, dark / light mode (deep violet theme), Excel export in the original spreadsheet layout, workout-day presets (push / pull / legs / upper / lower…).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, single-file app (`src/App.jsx`) |
| Auth + DB | Supabase (Postgres, row-level security, email/password auth) |
| Hosting | Vercel (or Netlify / Cloudflare Pages) |
| Exercise data | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), demo images served from its GitHub CDN |
| Excel export | SheetJS |

## Getting started

See **[SETUP.md](./SETUP.md)** for the full walkthrough (Supabase project → schema → env vars → Vercel deploy). Short version:

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev
```

## Data model

- `profiles` — one row per user (display name, kg/lbs preference), auto-created on signup.
- `workouts` — `{date, name, entries}` where `entries` is JSON: `[{exercise, muscle, sets: [{weight, reps}]}]`. Weights stored in **kg**; reps are strings (supports `6,6` unilateral notation).
- `custom_exercises` — per-user additions to the exercise database.
- **Access model ("crew")**: any signed-in user can read all rows; each user can insert/update/delete only their own. Enforced by Postgres row-level security — see [`supabase/schema.sql`](./supabase/schema.sql).

## Credits & licenses

Exercise names, muscles, and demo images from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain / unlicense). Typeface: Barlow (OFL) via Google Fonts.
