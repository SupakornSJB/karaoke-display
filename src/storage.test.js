import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchSongs, loadCachedSongs, loadSuggestions, saveSuggestions, ONE_WEEK_MS } from "./storage.js";
import { makeSongId } from "./lib.js";

const CACHE_KEY = "karaoke-song-cache-v2";
const LEGACY_CACHE_KEY = "karaoke-song-cache-v1";
const SUGGEST_KEY = "karaoke-suggestions-v1";

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

let storage;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("loadCachedSongs", () => {
  it("returns a fresh cache and removes the legacy v1 cache", () => {
    storage.setItem(LEGACY_CACHE_KEY, "[]");
    storage.setItem(CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), songs: [{ id: "x" }] }));
    expect(loadCachedSongs().songs).toEqual([{ id: "x" }]);
    expect(storage.getItem(LEGACY_CACHE_KEY)).toBeNull();
  });

  it("drops an expired or malformed cache without touching suggestions", () => {
    storage.setItem(SUGGEST_KEY, "[]");
    storage.setItem(CACHE_KEY, JSON.stringify({ updatedAt: Date.now() - ONE_WEEK_MS - 1, songs: [] }));
    expect(loadCachedSongs()).toBeNull();
    expect(storage.getItem(CACHE_KEY)).toBeNull();

    storage.setItem(CACHE_KEY, "{not json");
    expect(loadCachedSongs()).toBeNull();
    expect(storage.getItem(CACHE_KEY)).toBeNull();
    expect(storage.getItem(SUGGEST_KEY)).toBe("[]");
  });

  it("returns null when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    });
    expect(loadCachedSongs()).toBeNull();
  });
});

describe("loadSuggestions", () => {
  it("migrates positional ids and writes them back", () => {
    storage.setItem(SUGGEST_KEY, JSON.stringify([{ id: "s1", name: "Song B", series: "Y" }]));
    const expected = [{ id: makeSongId("Song B", "Y"), name: "Song B", series: "Y" }];
    expect(loadSuggestions()).toEqual(expected);
    expect(JSON.parse(storage.getItem(SUGGEST_KEY))).toEqual(expected);
  });

  it("never overwrites malformed storage", () => {
    for (const raw of ["{not json", '{"a":1}']) {
      storage.setItem(SUGGEST_KEY, raw);
      expect(loadSuggestions()).toEqual([]);
      expect(storage.getItem(SUGGEST_KEY)).toBe(raw);
    }
  });

  it("returns [] when nothing is saved, and round-trips saveSuggestions", () => {
    expect(loadSuggestions()).toEqual([]);
    const list = [{ id: makeSongId("A", ""), name: "A", series: "" }];
    saveSuggestions(list);
    expect(loadSuggestions()).toEqual(list);
  });
});

describe("fetchSongs", () => {
  it("throws when VITE_SHEET_URL is missing", async () => {
    vi.stubEnv("VITE_SHEET_URL", "");
    await expect(fetchSongs()).rejects.toThrow(/VITE_SHEET_URL/);
  });

  it("parses the sheet and writes the cache", async () => {
    vi.stubEnv("VITE_SHEET_URL", "https://sheet.example/gviz");
    const table = { rows: [{ c: [{ v: "Name" }] }, { c: [{ v: "Song A" }, { v: "X" }] }] };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => `google.visualization.Query.setResponse(${JSON.stringify({ table })});`,
    })));
    const songs = await fetchSongs();
    expect(songs.map((s) => s.name)).toEqual(["Song A"]);
    expect(JSON.parse(storage.getItem(CACHE_KEY)).songs).toEqual(songs);
  });

  it("throws on a non-OK response without writing the cache", async () => {
    vi.stubEnv("VITE_SHEET_URL", "https://sheet.example/gviz");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(fetchSongs()).rejects.toThrow(/404/);
    expect(storage.getItem(CACHE_KEY)).toBeNull();
  });
});
