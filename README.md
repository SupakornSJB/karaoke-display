# Karaoke List

A live song-list web app that reads directly from a Google Sheet and turns it into a searchable, filterable karaoke book — with a persistent "sing next time" list and a random-pick feature for when you can't decide.

No backend, no database. The sheet *is* the database.

## What it is

Point it at a public Google Sheet with your song list, and it renders that list as a fast, searchable app. Edit the sheet, refresh the app (or wait for the weekly auto-refresh), and the list updates — no redeploy needed.

## Features

- **Live sheet sync** — pulls song data straight from Google Sheets via the `gviz` JSON endpoint, no API key required.
- **Search** — filter by song name or series as you type.
- **Dropdown filter** — narrow the list to songs with/without a link, or with/without lyrics.
- **Up Next (suggestions)** — star any song to save it for next time. Saved to `localStorage`, so it survives reloads and isn't tied to a single session. The panel is collapsible via a toggle in the stats bar, and starred songs automatically sort to the top of the list.
- **Surprise me** — randomly picks a song from the current filtered/search results and shows it in a spotlight card, with quick actions to play, view lyrics, save it, or pick again.
- **Copy song name** — one-click copy for pasting into a karaoke machine search.
- **Local caching with weekly expiry** — the song list is cached in `localStorage` so reloads are instant; the cache auto-clears and refetches if it's more than 7 days old. A manual "Refresh cache" control is also available.

## Tech stack

- React + Vite
- [lucide-react](https://lucide.dev) for icons
- Plain CSS (`KaraokeList.css`) — no Tailwind/CSS framework dependency
- Google Sheets `gviz` endpoint for data (no backend, no API key)

## Setup (if you forked this)

### 1. Prepare your Google Sheet

Create a sheet with these columns, in this order:

| Column | Purpose |
|---|---|
| A — Song Name | Required |
| B — Series | Optional, shown under the song name |
| C — Song Link | Optional, e.g. a YouTube link |
| D — Lyrics Link | Optional |

Share it as **"Anyone with the link can view"** — the app fetches it client-side with no authentication, so it needs to be publicly viewable.

Grab the sheet ID from its URL:
```
https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
```

### 2. Clone and install

```bash
git clone <your-fork-url>
cd karaoke-list
npm install
```

### 3. Set the sheet URL

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and set `VITE_SHEET_URL` to your sheet's `gviz` endpoint:

```
VITE_SHEET_URL=https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/gviz/tq?tqx=out:json&sheet=Sheet1
```

Replace `Sheet1` with your actual sheet/tab name if different.

> `.env` is gitignored — this keeps your sheet URL out of version control if you'd rather not commit it, though note it's still visible in the built JS bundle since it's fetched client-side (see [Notes](#notes) below).

### 4. Run it locally

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

### 6. Deploy via GitHub Actions (optional)

A sample workflow is included at `.github/workflows/deploy.yml`. To use it:

1. Go to your repo's **Settings → Secrets and variables → Actions**.
2. Add a new repository secret named `VITE_SHEET_URL` with your sheet's `gviz` URL as the value.
3. Push to `main` — the workflow builds the app with that value injected at build time.

Add your actual deploy step (Pages, Netlify, S3, wherever) at the bottom of the workflow — the included file only covers the build.

## Notes

- Vite env vars are baked into the client bundle at build time, not read at runtime — after changing `.env` or the GitHub secret, you need to rebuild for the change to take effect.
- Because the sheet URL is embedded in the shipped JS, treat it as *configuration*, not a secret. Anyone who opens dev tools can see it — which is fine, since the sheet itself is already public for the app to read it.
- "Up Next" and the song cache use separate `localStorage` keys, so clearing the stale weekly cache never touches your saved suggestions.
