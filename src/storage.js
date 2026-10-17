// Network and localStorage I/O for the song list and saved suggestions.
// Pure logic lives in lib.js; this file is the only place that touches storage.
import { parseGviz, migrateSuggestions } from "./lib.js";

// v1 cached songs with positional ids; it's removed on load so it can't be reused.
const LEGACY_CACHE_KEY = "karaoke-song-cache-v1";
const CACHE_KEY = "karaoke-song-cache-v2";
// Deliberately separate from the song cache so expiring the cache never wipes suggestions.
const SUGGEST_KEY = "karaoke-suggestions-v1";
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Fetches and parses the sheet, then writes the song cache. Throws on failure.
export async function fetchSongs() {
  const sheetUrl = import.meta.env.VITE_SHEET_URL;
  if (!sheetUrl) {
    throw new Error("VITE_SHEET_URL is not set — check your .env file or build config");
  }
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
  const parsed = parseGviz(await res.text());

  try {
    localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ updatedAt: Date.now(), songs: parsed })
    );
  } catch {
    // storage might be full or unavailable — app still works without cache
  }
  return parsed;
}

// Reads the song cache, dropping it automatically if it's over a week old.
// Returns { songs, updatedAt } or null. Used as a lazy state initializer, so it
// may run twice under StrictMode — its storage writes are idempotent.
export function loadCachedSongs() {
  try {
    localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // storage unavailable — nothing to clean up
  }
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    const age = Date.now() - (data.updatedAt || 0);
    if (age < ONE_WEEK_MS && Array.isArray(data.songs)) {
      return { songs: data.songs, updatedAt: data.updatedAt };
    }
    localStorage.removeItem(CACHE_KEY);
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // storage unavailable
    }
  }
  return null;
}

// Reads saved suggestions, re-deriving ids so entries saved with old positional
// ids (s0, s1, ...) match the content-based ids, and writes the migrated list
// back. Malformed storage is never overwritten. Idempotent (lazy initializer).
export function loadSuggestions() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(SUGGEST_KEY));
  } catch {
    return [];
  }
  const migrated = migrateSuggestions(raw);
  if (!migrated) return [];
  if (JSON.stringify(migrated) !== JSON.stringify(raw)) saveSuggestions(migrated);
  return migrated;
}

export function saveSuggestions(next) {
  try {
    localStorage.setItem(SUGGEST_KEY, JSON.stringify(next));
  } catch {
    // storage might be full or unavailable
  }
}
