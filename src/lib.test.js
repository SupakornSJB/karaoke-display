import { describe, it, expect } from "vitest";
import { safeUrl, getLinkWarnings, isSafeLink, makeSongId, parseGviz, migrateSuggestions } from "./lib.js";

// Builds a gviz response; the first row is the header that parseGviz skips.
function gviz(rows) {
  const table = {
    rows: [
      { c: [{ v: "Name" }, { v: "Series" }, { v: "Link" }, { v: "Lyrics" }] },
      ...rows.map((r) => ({ c: r.map((v) => (v == null ? null : { v })) })),
    ],
  };
  return `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ table })});`;
}

describe("safeUrl / isSafeLink", () => {
  it("accepts http and https", () => {
    expect(safeUrl("https://youtube.com/watch?v=x")?.hostname).toBe("youtube.com");
    expect(isSafeLink("http://example.com")).toBe(true);
  });

  it("rejects other protocols, malformed and empty input", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.com", "not a url", "", null, undefined, 42]) {
      expect(isSafeLink(url)).toBe(false);
    }
  });
});

describe("getLinkWarnings", () => {
  it("returns no warnings for a plain link", () => {
    expect(getLinkWarnings(new URL("https://youtube.com/watch"))).toEqual([]);
  });

  it("flags embedded credentials", () => {
    expect(getLinkWarnings(new URL("https://youtube.com@evil.com/"))).toHaveLength(1);
  });

  it("flags punycode hostnames", () => {
    // URL normalizes non-ASCII hosts to punycode, so this exercises the xn-- check
    expect(getLinkWarnings(new URL("https://yоutube.com/")).join(" ")).toMatch(/internationalized/);
  });
});

describe("makeSongId", () => {
  it("ignores case, surrounding and repeated whitespace", () => {
    expect(makeSongId("  Song   A ", "Series")).toBe(makeSongId("song a", "series"));
  });

  it("treats NFC and NFD forms as the same", () => {
    expect(makeSongId("é", "")).toBe(makeSongId("é", ""));
  });

  it("does not collide when a separator-like char moves between fields", () => {
    expect(makeSongId("a|b", "")).not.toBe(makeSongId("a", "b"));
  });

  it("suffixes later occurrences only", () => {
    expect(makeSongId("x", "y", 1)).toBe(makeSongId("x", "y"));
    expect(makeSongId("x", "y", 2)).toBe(`${makeSongId("x", "y")}#2`);
  });
});

describe("parseGviz", () => {
  it("skips the header row and empty names, and maps columns", () => {
    const songs = parseGviz(gviz([["Song A", "X", "https://a", "https://l"], [null], ["  ", "Y"]]));
    expect(songs).toEqual([
      { id: makeSongId("Song A", "X"), name: "Song A", series: "X", link: "https://a", lyricsLink: "https://l" },
    ]);
  });

  it("keeps ids stable when rows are inserted above", () => {
    const before = parseGviz(gviz([["Song A", "X"], ["Song B", "Y"]]));
    const after = parseGviz(gviz([["New", "Z"], [null], ["Song A", "X"], ["Song B", "Y"]]));
    const idOf = (list, name) => list.find((s) => s.name === name).id;
    expect(idOf(after, "Song A")).toBe(idOf(before, "Song A"));
    expect(idOf(after, "Song B")).toBe(idOf(before, "Song B"));
  });

  it("gives duplicate rows unique ids", () => {
    const ids = parseGviz(gviz([["Dup", ""], ["dup ", ""], ["Dup", ""]])).map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("throws on an unexpected response shape", () => {
    expect(() => parseGviz("<html>login</html>")).toThrow(/Unexpected response/);
  });
});

describe("migrateSuggestions", () => {
  it("re-derives positional ids from name and series", () => {
    const out = migrateSuggestions([{ id: "s3", name: "Song B", series: "Y", link: "https://b" }]);
    expect(out).toEqual([{ id: makeSongId("Song B", "Y"), name: "Song B", series: "Y", link: "https://b" }]);
  });

  it("returns null for non-array input so storage is left untouched", () => {
    for (const raw of [null, {}, 5, "x"]) expect(migrateSuggestions(raw)).toBeNull();
  });

  it("drops invalid entries, fills missing series, and dedupes", () => {
    const out = migrateSuggestions([null, 5, { id: "s0" }, { name: "A" }, { id: "s9", name: "a " }]);
    expect(out).toEqual([{ name: "A", series: "", id: makeSongId("A", "") }]);
  });
});
