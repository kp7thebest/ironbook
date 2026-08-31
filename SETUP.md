# Ironbook — Setup & Deployment Guide

Everything below is free-tier. Total time: ~15 minutes. Steps 1–2 are one-time; after that, updates are just `git push`.

## 1. Push this repo to GitHub (github.com/kp7thebest)

1. On GitHub, create a **new empty repository** named `ironbook` under your account (**kp7thebest**). Don't add a README/.gitignore — this folder already has them. Suggested description: *"Workout tracker for our crew — React + Vite + Supabase"*. Suggested topics: `workout-tracker`, `fitness`, `react`, `vite`, `supabase`, `pwa`.
2. In this project folder (git is already initialized with a commit), run:

```bash
git remote add origin https://github.com/kp7thebest/ironbook.git
git push -u origin main
```

GitHub will prompt for your credentials (use a personal access token or the GitHub CLI / browser auth).

## 2. Create the Supabase backend

1. Go to [supabase.com](https://supabase.com) → sign up (free) → **New project**. Pick any name (e.g. `ironbook`), a strong database password (save it somewhere), and a region near you.
2. Once the project is ready: **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql), and **Run**. This creates the tables, the signup trigger, and the crew read/write rules.
3. **Authentication → Sign In / Up → Email**: turn **OFF** "Confirm email". (This lets your friends sign up and use the app immediately without email verification — fine for a private crew app. Leave it on if you prefer, but then each person must click a confirmation link before first sign-in.)
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 3. Run locally

```bash
npm install
cp .env.example .env
# edit .env — paste the URL and anon key from step 2.4
npm run dev
```

Open the shown localhost URL, create your account (display name **Srijan**), then in **Settings → Import spreadsheet history** to pull in your original Excel data (the import button only shows while your log is empty).

## 4. Deploy free on Vercel

1. [vercel.com](https://vercel.com) → sign up with your GitHub → **Add New Project** → import `kp7thebest/ironbook`.
2. Framework is auto-detected (Vite). Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. **Deploy.** You'll get a URL like `ironbook.vercel.app` (rename the project in Vercel settings if it's taken — e.g. `ironbook-kp7`).
4. Send the URL to Karthik and Nitant. Each signs up with their own email/password and display name. Everyone then appears in each other's **Friends** tab.

On phones: open the URL in the browser → share/menu → **Add to Home Screen**. It launches full-screen like a native app.

## 5. Things worth knowing

- **The anon key is safe to expose** — it's designed to be public; row-level security in Postgres is what protects the data. Never expose the `service_role` key.
- **Free-tier pause**: Supabase pauses free projects after ~7 days with no activity. If the app errors after a quiet week, open the Supabase dashboard and click **Restore**. Regular use prevents this.
- **Updates**: edit code → `git push` → Vercel auto-deploys in ~1 minute.
- **Passwords**: real Supabase auth now — the old `<Name>@2026` scheme is gone. Password changes live in the app's Settings tab. Forgot-password flows can be added later via Supabase's reset email.
- **Backups**: any user can export their full log as .xlsx from the History tab, which doubles as a manual backup.
