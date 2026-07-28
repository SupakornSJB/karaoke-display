import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Music4,
  PlayCircle,
  ListMusic,
  X,
  Shuffle,
  RotateCcw,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import "./App.css";

const SHEET_URL = import.meta.env.VITE_SHEET_URL;

const CACHE_KEY = "karaoke-song-cache-v1";
const SUGGEST_KEY = "karaoke-suggestions-v1";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseGviz(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error("Unexpected response shape from Sheets");
  const json = JSON.parse(match[1]);
  const rows = json.table?.rows || [];
  const songs = [];
  rows.slice(1).forEach((row, i) => {
    const cells = row.c || [];
    const name = cells[0]?.v?.toString().trim();
    if (!name) return;
    songs.push({
      id: `s${i}`,
      name,
      series: cells[1]?.v?.toString().trim() || "",
      link: cells[2]?.v?.toString().trim() || "",
      lyricsLink: cells[3]?.v?.toString().trim() || "",
    });
  });
  return songs;
}

export default function KaraokeApp() {
  const [songs, setSongs] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errMsg, setErrMsg] = useState("");
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // all | linked | missing-link | lyrics | missing-lyrics
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestPanel, setShowSuggestPanel] = useState(false);
  const [spotlight, setSpotlight] = useState(null);
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const toastTimer = useRef(null);
  const copyTimer = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  async function refreshSongs() {
    if (!SHEET_URL) {
      setErrMsg("VITE_SHEET_URL is not set — check your .env file or build config");
      setStatus("error");
      return;
    }
    try {
      setStatus("loading");
      const res = await fetch(SHEET_URL);
      if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
      const text = await res.text();
      const parsed = parseGviz(text);

      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ updatedAt: Date.now(), songs: parsed })
        );
      } catch {
        // storage might be full or unavailable — app still works without cache
      }

      setSongs(parsed);
      setStatus("ready");
      setLastUpdated(Date.now());
      showToast("Song list refreshed!");
    } catch (e) {
      setErrMsg(e.message || "Could not load sheet");
      setStatus("error");
    }
  }

  // Load song cache on mount, dropping it automatically if it's over a week old
  useEffect(() => {
    let usedCache = false;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        const age = Date.now() - (data.updatedAt || 0);
        if (age < ONE_WEEK_MS && Array.isArray(data.songs)) {
          setSongs(data.songs);
          setStatus("ready");
          setLastUpdated(data.updatedAt);
          usedCache = true;
        } else {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
    if (!usedCache) refreshSongs();
  }, []);

  // Load saved suggestions on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUGGEST_KEY);
      if (raw) setSuggestions(JSON.parse(raw));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const suggestedIds = useMemo(() => new Set(suggestions.map((s) => s.id)), [suggestions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = songs.filter((s) => {
      if (filterMode === "linked" && !s.link) return false;
      if (filterMode === "missing-link" && s.link) return false;
      if (filterMode === "lyrics" && !s.lyricsLink) return false;
      if (filterMode === "missing-lyrics" && s.lyricsLink) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.series.toLowerCase().includes(q);
    });
    // Starred songs bubble to the top, original order preserved within each group
    return [...base].sort((a, b) => {
      const aStar = suggestedIds.has(a.id) ? 0 : 1;
      const bStar = suggestedIds.has(b.id) ? 0 : 1;
      return aStar - bStar;
    });
  }, [songs, query, filterMode, suggestedIds]);

  const linkedCount = useMemo(() => songs.filter((s) => s.link).length, [songs]);
  const lyricsCount = useMemo(() => songs.filter((s) => s.lyricsLink).length, [songs]);

  function persist(next) {
    try {
      localStorage.setItem(SUGGEST_KEY, JSON.stringify(next));
    } catch {
      // storage might be full or unavailable
    }
  }

  function addSuggestion(song) {
    setSuggestions((prev) => {
      if (prev.find((s) => s.id === song.id)) return prev;
      const next = [...prev, song];
      persist(next);
      showToast(`Saved "${song.name}" for next time`);
      return next;
    });
  }

  function removeSuggestion(songId, name) {
    setSuggestions((prev) => {
      const next = prev.filter((s) => s.id !== songId);
      persist(next);
      if (name) showToast(`Removed "${name}"`);
      return next;
    });
  }

  function toggleSuggestion(song) {
    if (suggestedIds.has(song.id)) removeSuggestion(song.id, song.name);
    else addSuggestion(song);
  }

  function clearSuggestions() {
    setSuggestions([]);
    persist([]);
  }

  function shuffleSuggestions() {
    setSuggestions((prev) => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      persist(arr);
      return arr;
    });
  }

  function randomPick() {
    const pool = filtered.length ? filtered : songs;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSpotlight(pick);
    showToast("Picked a song for you");
  }

  async function copySongName(song) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(song.name);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = song.name;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedId(song.id);
      showToast(`Copied "${song.name}"`);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1400);
    } catch {
      showToast("Couldn't copy — try selecting manually");
    }
  }

  const spotlightSaved = spotlight ? suggestedIds.has(spotlight.id) : false;

  return (
    <div className="kb-root">
      <div className="kb-shell">
        <div className="kb-header">
          <div className="kb-eyebrow">Now Selecting</div>
          <h1 className="kb-title">Karaoke List</h1>
          <p className="kb-sub">
            Every song on the sheet, pulled live. Star anything you want to sing next time.
          </p>
          <div className="kb-stats">
            <div className="kb-stat"><b>{songs.length}</b> songs</div>
            <div className="kb-stat"><b>{linkedCount}</b> with a link</div>
            {lyricsCount > 0 && <div className="kb-stat"><b>{lyricsCount}</b> with lyrics</div>}
            <button
              type="button"
              className={`kb-stat kb-stat-toggle ${showSuggestPanel ? "active" : ""}`}
              onClick={() => setShowSuggestPanel((v) => !v)}
              title={showSuggestPanel ? "Hide Up Next" : "Show Up Next"}
            >
              <b>{suggestions.length}</b> up next
              {showSuggestPanel ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          </div>
        </div>

        {showSuggestPanel && (
          <div className="kb-suggest-panel">
            <div className="kb-suggest-head">
              <div className="kb-suggest-title">
                <ListMusic size={17} />
                Up Next
              </div>
              {suggestions.length > 0 && <div className="kb-suggest-count">{suggestions.length}</div>}
            </div>
            <p className="kb-suggest-sub">Songs you've starred to sing next time — saved on this device.</p>

            {suggestions.length > 0 && (
              <div className="kb-suggest-tools">
                <button className="kb-tool-btn" onClick={shuffleSuggestions}>
                  <Shuffle size={13} /> Shuffle
                </button>
                <button className="kb-tool-btn" onClick={clearSuggestions}>
                  <RotateCcw size={13} /> Clear
                </button>
              </div>
            )}

            {suggestions.length === 0 ? (
              <div className="kb-suggest-empty">
                <Music4 size={18} style={{ marginBottom: 8, opacity: 0.6 }} />
                <div>Nothing saved yet — tap the star on any song below.</div>
              </div>
            ) : (
              <div className="kb-suggest-chips">
                {suggestions.map((song) => (
                  <div className="kb-suggest-chip" key={song.id}>
                    <span className="kb-suggest-chip-name">{song.name}</span>
                    <button
                      className="kb-suggest-chip-remove"
                      onClick={() => removeSuggestion(song.id, song.name)}
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="kb-controls">
          <div className="kb-search">
            <Search size={16} />
            <input
              placeholder="Search song or series…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="kb-filter-select"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
          >
            <option value="all">All songs</option>
            <option value="linked">Has song link</option>
            <option value="missing-link">Missing song link</option>
            {lyricsCount > 0 && <option value="lyrics">Has lyrics</option>}
            {lyricsCount > 0 && <option value="missing-lyrics">Missing lyrics</option>}
          </select>
          <button className="kb-random-btn" onClick={randomPick}>
            <Sparkles size={15} /> Surprise me
          </button>
        </div>

        {spotlight && (
          <div className="kb-spotlight">
            <div className="kb-spotlight-badge">
              <Sparkles size={13} /> Tonight's pick
            </div>
            <button className="kb-spotlight-dismiss" onClick={() => setSpotlight(null)}>
              <X size={14} />
            </button>
            <div className="kb-spotlight-name">{spotlight.name}</div>
            {spotlight.series && <div className="kb-spotlight-series">{spotlight.series}</div>}
            <div className="kb-spotlight-actions">
              <button className="kb-tool-btn" onClick={randomPick}>
                <Sparkles size={13} /> Pick again
              </button>
              <button
                className={`kb-tool-btn ${spotlightSaved ? "active" : ""}`}
                onClick={() => toggleSuggestion(spotlight)}
              >
                <Star size={13} fill={spotlightSaved ? "currentColor" : "none"} />
                {spotlightSaved ? "Saved" : "Save for later"}
              </button>
              {spotlight.link && (
                <a className="kb-tool-btn" href={spotlight.link} target="_blank" rel="noopener noreferrer">
                  <PlayCircle size={13} /> Play
                </a>
              )}
              {spotlight.lyricsLink && (
                <a className="kb-tool-btn" href={spotlight.lyricsLink} target="_blank" rel="noopener noreferrer">
                  <FileText size={13} /> Lyrics
                </a>
              )}
            </div>
          </div>
        )}

        {status === "loading" && (
          <div className="kb-loading">
            <div className="kb-spinner" />
            Loading the sheet…
          </div>
        )}

        {status === "error" && (
          <div className="kb-error">
            Couldn't load the sheet: {errMsg}
            <br />
            Make sure it's shared as "Anyone with the link can view".
          </div>
        )}

        {status === "ready" && (
          <div className="kb-list">
            {filtered.length === 0 && <div className="kb-empty">No songs match "{query}".</div>}
            {filtered.map((song, i) => {
              const isSuggested = suggestedIds.has(song.id);
              const isCopied = copiedId === song.id;
              return (
                <div key={song.id} className={`kb-row ${isSuggested ? "suggested" : ""}`}>
                  <div className="kb-num">{String(i + 1).padStart(3, "0")}</div>
                  <div className="kb-meta">
                    <div className="kb-name">{song.name}</div>
                    {song.series && <div className="kb-series">{song.series}</div>}
                  </div>
                  <div className="kb-actions">
                    <button
                      className={`kb-icon-btn kb-star-btn ${isSuggested ? "active" : ""}`}
                      onClick={() => toggleSuggestion(song)}
                      title={isSuggested ? "Remove from Up Next" : "Save for next time"}
                    >
                      <Star size={15} strokeWidth={1.75} fill={isSuggested ? "currentColor" : "none"} />
                    </button>
                    <button
                      className={`kb-icon-btn ${isCopied ? "copied" : ""}`}
                      onClick={() => copySongName(song)}
                      title="Copy song name"
                    >
                      {isCopied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
                    </button>
                    {song.link && (
                      <a
                        className="kb-icon-btn"
                        href={song.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open song link"
                      >
                        <PlayCircle size={16} />
                      </a>
                    )}
                    {song.lyricsLink && (
                      <a
                        className="kb-icon-btn"
                        href={song.lyricsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open lyrics"
                      >
                        <FileText size={15} strokeWidth={1.75} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="kb-refresh" onClick={refreshSongs}>
              <div className="kb-refresh-left">
                <RefreshCw size={18} />
                <span>Refresh cache</span>
              </div>
              <div className="kb-refresh-right">
                {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleString()}` : "Never updated"}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="kb-toast">{toast}</div>}
    </div>
  );
}
