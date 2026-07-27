# Calorie Tracker

A tiny, private, offline calorie tracker. One HTML file, no accounts, no build step, no internet required. Your data lives only in your browser.

## What it does

- Big, prominent **daily total**.
- Fast entry: type calories → optional note → **Enter** or **Add**. Total updates instantly.
- Each entry saves its **date and time** automatically.
- **Edit** or **delete** any entry; the total recalculates immediately.
- A **new day starts automatically** each calendar day. Old days are kept.
- Browse **previous days** with the ‹ / › arrows (or the **Today** button).
- Optional **daily target** — shows how many calories you have left, or how far over.
- **Export / Import** your data as a JSON file for backups.

## How to run

**Easiest:** double-click `index.html` — it opens in your default browser and just works.

That's it. No install, no server, no dependencies.

### Put it on your phone's home screen (optional)

Open the file in your phone browser, then use **Share → Add to Home Screen**. It opens full-screen like an app. (To get the file onto your phone, email it to yourself, use AirDrop, or a cloud drive.)

### Run it as a local site (optional)

If you prefer a `http://localhost` address, from this folder run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/index.html

## Where is my data?

Everything is stored in your browser's **localStorage** on this device, as JSON. It survives refreshing and reopening the browser.

Notes:
- Data is **per-browser and per-device**. It does not sync. Use Export to move it or back it up.
- Clearing your browser's site data / history will erase it — keep a backup with **Export**.
- To restore or move data: **Import** a previously exported `.json` file (this replaces current data).

## Backups

- **⬇ Export backup** downloads a file like `calorie-tracker-backup-2026-07-26.json`.
- **⬆ Import backup** loads one back (asks for confirmation first, since it replaces everything).

## Tech

Plain HTML + CSS + vanilla JavaScript in a single file. No frameworks, no network calls.
