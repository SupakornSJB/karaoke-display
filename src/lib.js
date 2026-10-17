// Pure helpers with no React/DOM dependencies, kept here so they can be unit tested.

// Only allow http/https, well-formed URLs. Returns a parsed URL object or null.
export function safeUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed;
    }
  } catch {
    // malformed URL — treat as unsafe
  }
  return null;
}

// Flags a few classic link-spoofing patterns so the confirm dialog can warn about them.
export function getLinkWarnings(parsed) {
  const warnings = [];
  if (parsed.username || parsed.password) {
    warnings.push("This link has a username/password embedded in it — a common phishing trick to disguise the real destination.");
  }
  if (parsed.hostname.includes("xn--")) {
    warnings.push("This domain uses internationalized characters that can be made to visually resemble a different, trusted site.");
  }
  // eslint-disable-next-line no-control-regex -- intentionally matches the full non-ASCII range
  if (/[^\x00-\x7F]/.test(parsed.hostname)) {
    warnings.push("This domain contains non-standard characters.");
  }
  return warnings;
}

export function isSafeLink(url) {
  return safeUrl(url) !== null;
}

function normalizeIdPart(value) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Content-based id so stars survive rows being inserted/deleted in the sheet.
// Identical (name, series) rows are told apart by occurrence order: #2, #3, ...
export function makeSongId(name, series, occurrence = 1) {
  const base = JSON.stringify([normalizeIdPart(name), normalizeIdPart(series)]);
  return occurrence > 1 ? `${base}#${occurrence}` : base;
}

export function parseGviz(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error("Unexpected response shape from Sheets");
  const json = JSON.parse(match[1]);
  const rows = json.table?.rows || [];
  const songs = [];
  const seenCounts = new Map();
  rows.slice(1).forEach((row) => {
    const cells = row.c || [];
    const name = cells[0]?.v?.toString().trim();
    if (!name) return;
    const series = cells[1]?.v?.toString().trim() || "";
    const baseId = makeSongId(name, series);
    const occurrence = (seenCounts.get(baseId) || 0) + 1;
    seenCounts.set(baseId, occurrence);
    songs.push({
      id: makeSongId(name, series, occurrence),
      name,
      series,
      link: cells[2]?.v?.toString().trim() || "",
      lyricsLink: cells[3]?.v?.toString().trim() || "",
    });
  });
  return songs;
}

// Re-derives ids for saved suggestions (migrating old positional s0, s1, ... ids),
// dropping invalid entries and duplicates. Returns null if `raw` isn't an array,
// so callers can leave malformed storage untouched.
export function migrateSuggestions(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const migrated = [];
  raw.forEach((s) => {
    if (!s || typeof s !== "object" || typeof s.name !== "string") return;
    const series = String(s.series ?? "");
    const id = makeSongId(s.name, series);
    if (seen.has(id)) return;
    seen.add(id);
    migrated.push({ ...s, series, id });
  });
  return migrated;
}
