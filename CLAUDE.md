# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build (outputs to `dist/`)
- `npm run preview` — serve the production build locally
- `npm run lint` — run ESLint over the repo (flat config in `eslint.config.js`)

There is no test runner configured — the project ships without a test suite.

## Environment

The app requires `VITE_SHEET_URL` (the Google Sheets `gviz` JSON endpoint for a public sheet). It must be present at **build time**, not runtime — Vite inlines `import.meta.env.*` into the bundle, so `.env` changes need a rebuild. The GitHub Actions workflow (`.github/workflows/deploy.yml`) reads this value from a repo secret of the same name and deploys to GitHub Pages.

`vite.config.js` sets `base: "/karaoke-display/"` because the app is served from a GitHub Pages subpath — changing the repo name means changing this.

## Architecture

The app is intentionally single-file: **all UI, state, and data logic live in `src/App.jsx`** (~570 lines). `main.jsx` is only a mount point. There is no router, no state management library, no backend, and no server-side code. Prefer extending `App.jsx` before introducing new module boundaries — the project's design point is that the sheet *is* the database and the app is a thin renderer over it.

### Data flow

1. **Fetch** — `refreshSongs()` fetches `VITE_SHEET_URL` (Google Sheets `gviz` JSON endpoint, no auth). The response is JSONP-shaped, wrapped in `google.visualization.Query.setResponse(...)`; `parseGviz()` strips that wrapper before `JSON.parse`.
2. **Shape** — Row 0 of the sheet is skipped (assumed header). Columns A–D map to `name`, `series`, `link`, `lyricsLink`. Rows with an empty name are dropped. IDs are assigned positionally (`s0`, `s1`, ...) — they are **not stable across sheet edits**, which is why the cache has a hard weekly expiry rather than a merge strategy.
3. **Cache** — Two independent `localStorage` keys:
   - `karaoke-song-cache-v1` — the fetched song list plus `updatedAt` timestamp. Auto-invalidated after `ONE_WEEK_MS` (7 days). On mount, a fresh-enough cache short-circuits the network fetch.
   - `karaoke-suggestions-v1` — the user's starred "Up Next" list.
   These keys are **deliberately separate** so that clearing/expiring the song cache never wipes the user's saved suggestions. Keep this invariant if you touch storage.
4. **Render** — `filtered` (memoized) applies the search query + filter mode, then re-sorts so starred songs bubble to the top while preserving original order within each group.

### Link safety

Sheet data is untrusted user-authored input, so every outbound link goes through a safety pipeline before it can open:

- `safeUrl()` parses the URL and rejects anything that isn't `http:` or `https:` or fails `new URL()`.
- `isSafeLink()` gates whether the Play/Lyrics buttons render at all.
- `requestOpenLink()` populates `pendingLink` state, which triggers a portal-rendered confirmation modal. The user must confirm before `window.open(..., "_blank", "noopener,noreferrer")` fires.
- `getLinkWarnings()` surfaces heuristic phishing flags (embedded userinfo, Punycode `xn--` hostnames, non-ASCII hostname chars) inside the confirm dialog.

If you add a new place that opens a sheet-provided URL, route it through `requestOpenLink()` — don't call `window.open` directly and don't bypass the modal.

### Styling

Plain CSS in `src/App.css` (component styles) and `src/index.css` (globals). All class names are prefixed `kb-*`. No CSS framework, no CSS-in-JS. Icons come from `lucide-react`.