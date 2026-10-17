# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build (outputs to `dist/`)
- `npm run preview` — serve the production build locally
- `npm run lint` — run ESLint over the repo (flat config in `eslint.config.js`). `App.jsx` currently has pre-existing errors (unused `React` import, `react-hooks/set-state-in-effect` in the mount effects)
- `npm test` — run the Vitest suite once (`npx vitest` for watch mode, `npx vitest run -t "<name>"` for a single test)

Tests live next to the code as `*.test.js` and run in Vitest's default Node environment (no jsdom/React Testing Library yet), so they cover the pure helpers in `src/lib.js` only.

## CI

- `.github/workflows/ci.yml` — on every PR and push to `main`: `npm ci`, lint (**non-blocking** via `continue-on-error` until the existing lint errors are fixed), `npm test`, `npm run build`.
- `.github/workflows/claude-review.yml` — Claude (`anthropics/claude-code-action@v1`) reviews non-draft PRs from this repo and posts PR/inline comments. Needs the `ANTHROPIC_API_KEY` repo secret; skipped for fork PRs (no secrets). Its prompt lists this file's invariants — keep them in sync.
- `.github/workflows/deploy.yml` — builds and deploys `main` to GitHub Pages.

## Environment

The app requires `VITE_SHEET_URL` (the Google Sheets `gviz` JSON endpoint for a public sheet); copy `.env-example` to `.env` for local dev. It must be present at **build time**, not runtime — Vite inlines `import.meta.env.*` into the bundle, so `.env` changes need a rebuild. The GitHub Actions workflow (`.github/workflows/deploy.yml`) reads this value from a repo secret of the same name and deploys to GitHub Pages.

`vite.config.js` sets `base: "/karaoke-display/"` because the app is served from a GitHub Pages subpath — changing the repo name means changing this.

## Architecture

The app is intentionally near single-file: **all UI and state live in `src/App.jsx`** (~530 lines), and the pure, React-free helpers (`safeUrl`, `getLinkWarnings`, `isSafeLink`, `makeSongId`, `parseGviz`, `migrateSuggestions`) live in `src/lib.js` so they can be unit tested. `main.jsx` is only a mount point. There is no router, no state management library, no backend, and no server-side code. Prefer extending these two files before introducing new module boundaries — the project's design point is that the sheet *is* the database and the app is a thin renderer over it. New pure logic goes in `lib.js` with tests in `lib.test.js`.

### Data flow

1. **Fetch** — `refreshSongs()` fetches `VITE_SHEET_URL` (Google Sheets `gviz` JSON endpoint, no auth). The response is JSONP-shaped, wrapped in `google.visualization.Query.setResponse(...)`; `parseGviz()` strips that wrapper before `JSON.parse`.
2. **Shape** — Row 0 of the sheet is skipped (assumed header). Columns A–D map to `name`, `series`, `link`, `lyricsLink`. Rows with an empty name are dropped. IDs are **content-based** via `makeSongId(name, series)`: `JSON.stringify` of the NFC-normalized, whitespace-collapsed, lowercased name and series, so they survive rows being inserted/deleted. Rows with the same normalized name+series get `#2`, `#3`, ... by occurrence order (needed for unique React keys). Consequences: rows differing only in case/spacing count as duplicates, and renaming a song or its series in the sheet changes its id (its star is lost).
3. **Cache** — Two independent `localStorage` keys:
   - `karaoke-song-cache-v2` — the fetched song list plus `updatedAt` timestamp. Auto-invalidated after `ONE_WEEK_MS` (7 days). On mount, a fresh-enough cache short-circuits the network fetch. The old `karaoke-song-cache-v1` (positional `s0`, `s1` ids) is removed on mount by exact key (`LEGACY_CACHE_KEY`). Bump the version again if the song/id shape changes.
   - `karaoke-suggestions-v1` — the user's starred "Up Next" list (full song objects, never expires). On mount each entry's `id` is re-derived from its stored `name`/`series` (migrating old positional ids) and deduped. Malformed or non-array storage is left untouched rather than overwritten.
   These keys are **deliberately separate** so that clearing/expiring the song cache never wipes the user's saved suggestions. Never clear storage by prefix scan or `localStorage.clear()`. Keep this invariant if you touch storage.
   Starred state (`suggestedIds`) is matched by `id`. A starred song that is removed or renamed in the sheet stays in Up Next (removable from its chip) but shows no star in the list.
4. **Render** — `filtered` (memoized) applies the search query + filter mode, then re-sorts so starred songs bubble to the top while preserving original order within each group.

### Link safety

Sheet data is untrusted user-authored input, so every outbound link goes through a safety pipeline before it can open:

- `safeUrl()` parses the URL and rejects anything that isn't `http:` or `https:` or fails `new URL()`.
- `isSafeLink()` gates whether the Play/Lyrics buttons render at all.
- `requestOpenLink()` populates `pendingLink` state, which triggers a portal-rendered confirmation modal. The user must confirm before `window.open(..., "_blank", "noopener,noreferrer")` fires.
- `getLinkWarnings()` surfaces heuristic phishing flags (embedded userinfo, Punycode `xn--` hostnames, non-ASCII hostname chars) inside the confirm dialog.

If you add a new place that opens a sheet-provided URL, route it through `requestOpenLink()` — don't call `window.open` directly and don't bypass the modal.

### Styling

Plain CSS in `src/App.css` (component styles) and `src/index.css` (globals). App class names are prefixed `kb-*` (`.counter` in `index.css` and the files in `src/assets/` are unused Vite template leftovers). No CSS framework, no CSS-in-JS. Icons come from `lucide-react`.