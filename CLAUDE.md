# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules for changes

These are the repo's invariants. The Claude PR review checks every PR against this list, so update it here (not in the workflow) when a rule changes.

- **Links:** every sheet-provided URL opens only through `requestOpenLink()` and its confirm modal. Never call `window.open` directly.
- **Storage:** the song cache and suggestions `localStorage` keys stay separate. Nothing may wipe saved suggestions: no `localStorage.clear()`, no prefix scans, and malformed suggestions storage is left untouched.
- **IDs:** song ids stay content-based via `makeSongId()`, never positional.
- **File layout:** pure logic goes in `src/lib.js`, network/`localStorage` I/O in `src/storage.js`, UI and state in `src/App.jsx`. New logic in `lib.js`/`storage.js` comes with tests in the matching `*.test.js`.
- **Checks:** `npm run lint` and `npm test` must pass.
- **Docs:** if a change makes this file inaccurate (new file, moved function, changed behaviour), update it in the same PR.
- **Commits:** do not add `Co-Authored-By` trailers to commit messages.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build (outputs to `dist/`)
- `npm run preview` — serve the production build locally
- `npm run lint` — run ESLint over the repo (flat config in `eslint.config.js`). It must pass with zero errors; CI blocks on it. Note `react-hooks/set-state-in-effect` follows calls into local functions, so load initial state with lazy `useState` initializers and only set state from promise callbacks (`.then(...)`) inside effects
- `npm test` — run the Vitest suite once (`npx vitest` for watch mode, `npx vitest run -t "<name>"` for a single test)

Tests live next to the code as `*.test.js` and run in Vitest's default Node environment (no jsdom/React Testing Library yet), so they cover `src/lib.js` and `src/storage.js` but not the component. Storage tests stub `localStorage`/`fetch` with `vi.stubGlobal` and the sheet URL with `vi.stubEnv`.

## CI

- `.github/workflows/ci.yml` — on every PR: `npm ci`, `npm run lint`, `npm test`, `npm run build`. All steps are blocking, and its `test` job is a required status check on `main`. It does not run on pushes to `main` — `deploy.yml` re-checks instead.
- `.github/workflows/claude-review.yml` — Claude (`anthropics/claude-code-action@v1`) reviews non-draft PRs from this repo against the **Rules for changes** above and posts PR/inline comments. Authenticates with a Claude subscription via the `CLAUDE_CODE_OAUTH_TOKEN` repo secret (create with `claude setup-token` or `/install-github-app`); skipped for fork PRs (no secrets). The prompt is deliberately generic — don't edit it to add rules. Any PR that changes this workflow file gets its own review skipped (the action requires the file to match `main`).
- `.github/workflows/deploy.yml` — on push to `main`: lint, test, then build and deploy to GitHub Pages. A failing check stops the deploy, which covers direct pushes that bypass PRs.

## Environment

The app requires `VITE_SHEET_URL` (the Google Sheets `gviz` JSON endpoint for a public sheet); copy `.env-example` to `.env` for local dev. It must be present at **build time**, not runtime — Vite inlines `import.meta.env.*` into the bundle, so `.env` changes need a rebuild. The GitHub Actions workflow (`.github/workflows/deploy.yml`) reads this value from a repo secret of the same name and deploys to GitHub Pages.

`vite.config.js` sets `base: "/karaoke-display/"` because the app is served from a GitHub Pages subpath — changing the repo name means changing this.

## Architecture

The app is intentionally small, with three source files:
- `src/App.jsx` — **all UI and React state**, and nothing else.
- `src/lib.js` — pure, React-free, I/O-free helpers (`safeUrl`, `getLinkWarnings`, `isSafeLink`, `makeSongId`, `parseGviz`, `migrateSuggestions`).
- `src/storage.js` — the only code that touches the network or `localStorage` (`fetchSongs`, `loadCachedSongs`, `loadSuggestions`, `saveSuggestions`, and the storage keys).

`main.jsx` is only a mount point. There is no router, no state management library, no backend, and no server-side code. Prefer extending these files before introducing new module boundaries — the project's design point is that the sheet *is* the database and the app is a thin renderer over it. New logic goes in `lib.js` (pure) or `storage.js` (I/O), each with a matching `*.test.js`.

### Data flow

1. **Fetch** — `fetchSongs()` (in `storage.js`; called on mount when there's no fresh cache, and by the component's `refreshSongs()`) fetches `VITE_SHEET_URL` (Google Sheets `gviz` JSON endpoint, no auth). The response is JSONP-shaped, wrapped in `google.visualization.Query.setResponse(...)`; `parseGviz()` strips that wrapper before `JSON.parse`.
2. **Shape** — Row 0 of the sheet is skipped (assumed header). Columns A–D map to `name`, `series`, `link`, `lyricsLink`. Rows with an empty name are dropped. IDs are **content-based** via `makeSongId(name, series)`: `JSON.stringify` of the NFC-normalized, whitespace-collapsed, lowercased name and series, so they survive rows being inserted/deleted. Rows with the same normalized name+series get `#2`, `#3`, ... by occurrence order (needed for unique React keys). Consequences: rows differing only in case/spacing count as duplicates, and renaming a song or its series in the sheet changes its id (its star is lost).
3. **Cache** — Two independent `localStorage` keys:
   - `karaoke-song-cache-v2` — the fetched song list plus `updatedAt` timestamp. Auto-invalidated after `ONE_WEEK_MS` (7 days). `loadCachedSongs()` runs as a lazy `useState` initializer; a fresh-enough cache short-circuits the network fetch. The old `karaoke-song-cache-v1` (positional `s0`, `s1` ids) is removed there by exact key (`LEGACY_CACHE_KEY`). Bump the version again if the song/id shape changes.
   - `karaoke-suggestions-v1` — the user's starred "Up Next" list (full song objects, never expires). `loadSuggestions()` (lazy `useState` initializer) re-derives each entry's `id` from its stored `name`/`series` (migrating old positional ids) and dedupes them. Malformed or non-array storage is left untouched rather than overwritten.
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