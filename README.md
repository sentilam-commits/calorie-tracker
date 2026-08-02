# Calorie Tracker

A tiny, private calorie tracker that **syncs across your devices** (phone + computer) automatically. One HTML file, no login, no build step.

## What it does

- Big, prominent **daily total**.
- Fast entry: type calories → optional note → **Enter** or **Add**. Total updates instantly.
- Each entry saves its **date and time** automatically.
- **Edit** or **delete** any entry; the total recalculates immediately.
- A **new day starts automatically** each calendar day. Old days are kept.
- Browse **previous days** with the ‹ / › arrows, the **calendar** (tap the date), or the **Today** button. Future days can't be selected.
- **Work on any past day**: add, edit and delete meals there. New entries stay on the day you're viewing, never jump to today, and the day's total recalculates on every change. A **Past day — Aug 1** badge and the total's caption ("calories on Aug 1") always show which date you're on. Everything syncs by itself — there's no save step.
- Each entry shows its **time as a tappable control** — change it straight from the list; the meal only moves within its own day.
- Optional **meal tolerance** — mark any meal **OK** or **Too much**, at any time after eating it (nothing is selected by default, and meals logged before this existed stay valid as unrated). The day then shows a small status under the total: *Within tolerance* (every meal rated OK), *Exceeded tolerance* (at least one "Too much"), *Partly rated* (some meals still unrated — never counted as a full "within tolerance"), or *Not rated*.
- Two short guidance notes derived from your own logs: **what to do after a "Too much" meal** (shown only on days that have one) and **when to step intake up by ~100 kcal** (after 3 consecutive days rated fully OK). Plus an **evening check** when the last meal of a day isn't the smallest one.
- Optional **daily target** — shows calories left, or how far over.
- **Cross-device sync** via Supabase (see below).
- **Export / Import** your data as a JSON file for backups.

## How syncing works (secret sync code)

There's no login. Instead, each browser gets a random **sync code** the first time you open the app. Any device using the **same sync code** shares the same data.

**To link a second device:**
1. On device A, tap the status pill or **🔗 Sync devices** and **Copy** your sync code.
2. On device B, open the app, tap **🔗 Sync devices**, paste the code, and tap **Link this device**.

That's it — both devices now stay in sync. Changes push immediately and the app also re-checks on open, on focus, and every ~15 seconds.

The status pill at the top shows: **Synced** (green), **Syncing…**, or **Offline — saved locally**. Offline changes are queued and sync automatically when you're back online.

> ⚠️ Keep your sync code private. Anyone who has it can read your entries. It is the only thing protecting your data. (Row-Level Security on the database ensures a request can only touch rows matching its code.)

## Backend (already set up)

- Supabase project: **calorie-tracker** (`gxzhaxhelnftyksjiedk`)
- Tables: `entries`, `settings`, `meals`, `days` — all with Row-Level Security keyed on the sync code.
- `entries.tolerance` is a nullable `text` column constrained to `'ok' | 'much'`. `NULL` means "not rated", so every pre-existing row stayed valid and older devices that don't send the column can't overwrite it.
- The app's `index.html` already contains the project URL and the **publishable** (anon) key. These are safe to ship in client code; your data is protected by the secret sync code + RLS.

## Running locally

Double-click `index.html`, or serve it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

(Sync works either way, as long as you're online.)

## Tests

```bash
node --test tests/app.test.mjs
```

No dependencies and no build. `tests/harness.mjs` extracts the inline app script from `index.html` and runs it in a `node:vm` context with a small DOM/localStorage stub, so the tests drive the exact code the browser runs (offline — the Supabase client is never created). Coverage: historical-date handling, total recalculation, tolerance and daily status, editing, deletion, persistence across reloads, backward compatibility with pre-tolerance data, and duplicate-submission guards.

## Deploying to Vercel (so both devices open the same URL)

From this folder, the fastest way (no install needed):

```bash
npx vercel --prod
```

- Log in when prompted (opens the browser once).
- Accept the defaults — it's a static site, no framework/build needed.
- You'll get a URL like `https://calorie-tracker-xxxx.vercel.app`. Open that on your phone and computer.

**Or** via GitHub (matches your usual auto-deploy flow):
1. Create a new empty repo on github.com.
2. `git remote add origin <repo-url>` then `git push -u origin main`.
3. On vercel.com → **Add New → Project → Import** that repo. No build settings needed. Deploy.

Tip: on your phone, open the Vercel URL and use **Share → Add to Home Screen** for an app-like full-screen icon.

## Backups

- **⬇ Export** downloads a JSON snapshot of your data.
- **⬆ Import** loads one back and pushes it to your synced devices (replaces current data, asks first).

## Tech

Single-file HTML + CSS + vanilla JS. Sync via `@supabase/supabase-js` (loaded from CDN). No framework, no build.
