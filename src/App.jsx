import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Music4, PlayCircle, ListMusic, X, Shuffle, RotateCcw, FileText, Copy } from "lucide-react";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KC15TiLOjsB3t6yOjyPiLGHgSVN_sq1qi9Zq9yMDNsA/gviz/tq?tqx=out:json&sheet=Sheet1";

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
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [onlyMissingLyrics, setOnlyMissingLyrics] = useState(false);
  const [queue, setQueue] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setStatus("loading");
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
        const text = await res.text();
        const parsed = parseGviz(text);
        if (!cancelled) {
          setSongs(parsed);
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e.message || "Could not load the sheet");
          setStatus("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs.filter((s) => {
      if (onlyLinked && !s.link) return false;
      if (onlyMissingLyrics && s.lyricsLink) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.series.toLowerCase().includes(q);
    });
  }, [songs, query, onlyLinked, onlyMissingLyrics]);

  const linkedCount = useMemo(() => songs.filter((s) => s.link).length, [songs]);
  const lyricsCount = useMemo(() => songs.filter((s) => s.lyricsLink).length, [songs]);

  async function copySongName(song) {
    try {
      await navigator.clipboard.writeText(song.name);
      showToast(`Copied "${song.name}"`);
    } catch {
      showToast("Couldn't copy song name");
    }
  }

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  function toggleQueue(song) {
    setQueue((prev) => {
      const exists = prev.find((s) => s.id === song.id);
      if (exists) {
        showToast(`Removed "${song.name}"`);
        return prev.filter((s) => s.id !== song.id);
      }
      showToast(`Queued — you're #${prev.length + 1}`);
      return [...prev, song];
    });
  }

  function clearQueue() {
    setQueue([]);
  }

  function shuffleQueue() {
    setQueue((prev) => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  }

  const queuedIds = new Set(queue.map((s) => s.id));

  return (
    <div className="kb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

        .kb-root {
          --bg: #0e0c17;
          --bg-alt: #131022;
          --surface: #1a1730;
          --surface-hi: #231f3f;
          --border: #2c2650;
          --pink: #ff4d8d;
          --pink-dim: #ff4d8d33;
          --cyan: #45f0e6;
          --cyan-dim: #45f0e633;
          --text: #f3f1fb;
          --muted: #9089b0;
          font-family: 'Inter', sans-serif;
          background: radial-gradient(ellipse at top, var(--bg-alt) 0%, var(--bg) 60%);
          color: var(--text);
          min-height: 100%;
          padding: 0;
          box-sizing: border-box;
        }
        .kb-root *, .kb-root *::before, .kb-root *::after { box-sizing: border-box; }

        .kb-shell {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          max-width: 1180px;
          margin: 0 auto;
        }
        @media (min-width: 900px) {
          .kb-shell { grid-template-columns: 1fr 340px; align-items: start; }
        }

        .kb-header {
          padding: 36px 24px 20px;
          position: relative;
          overflow: hidden;
        }
        .kb-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.18em;
          color: var(--cyan);
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kb-eyebrow::before {
          content: '';
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--pink);
          box-shadow: 0 0 10px 2px var(--pink);
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

        .kb-title {
          font-family: 'Unbounded', sans-serif;
          font-weight: 900;
          font-size: clamp(30px, 5vw, 48px);
          line-height: 1.05;
          margin: 10px 0 6px;
          background: linear-gradient(100deg, var(--text) 30%, var(--cyan) 70%, var(--pink) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .kb-sub {
          color: var(--muted);
          font-size: 14.5px;
          max-width: 520px;
        }

        .kb-stats {
          display: flex;
          gap: 18px;
          margin-top: 18px;
          font-family: 'JetBrains Mono', monospace;
        }
        .kb-stat {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 13px;
          color: var(--muted);
        }
        .kb-stat b { color: var(--text); font-size: 15px; }

        .kb-controls {
          padding: 8px 24px 18px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .kb-search {
          flex: 1;
          min-width: 220px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 14px;
        }
        .kb-search input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 14px;
          width: 100%;
          font-family: 'Inter', sans-serif;
        }
        .kb-search input::placeholder { color: var(--muted); }
        .kb-search svg { color: var(--muted); flex-shrink: 0; }

        .kb-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--muted);
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }
        .kb-toggle.active {
          color: var(--cyan);
          border-color: var(--cyan-dim);
          background: linear-gradient(0deg, var(--cyan-dim), var(--cyan-dim)), var(--surface);
        }
        .kb-toggle .dot {
          width: 9px; height: 9px; border-radius: 50%;
          border: 1.5px solid var(--muted);
        }
        .kb-toggle.active .dot { background: var(--cyan); border-color: var(--cyan); }

        .kb-list {
          padding: 4px 24px 40px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .kb-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;

          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;

          padding: 12px 14px;

          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            transform 0.1s ease;
        }

        .kb-row:hover {
          border-color: var(--pink-dim);
          background: var(--surface-hi);
        }
        .kb-row.in-queue {
          border-color: var(--pink);
          box-shadow: 0 0 0 1px var(--pink-dim);
        }

        .kb-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 400;
          color: var(--muted);
          text-align: right;
          font-variant-numeric: tabular-nums;
          opacity: 0.8;
        }

        .kb-meta { min-width: 0; text-align: left; }
        .kb-name {
          font-weight: 600;
          font-size: 14.5px;
          color: var(--text);
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.35;
        }
        .kb-series {
          font-size: 12.5px;
          color: var(--muted);
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.3;
          margin-top: 2px;
        }

        .kb-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .kb-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px; height: 34px;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--bg-alt);
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          text-decoration: none;
        }
        .kb-icon-btn:hover { color: var(--cyan); border-color: var(--cyan-dim); }

        .kb-add-btn {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          font-weight: 500;
          padding: 0 12px;
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--bg-alt);
          color: var(--muted);
          cursor: pointer;
          white-space: nowrap;
        }
        .kb-add-btn:hover { border-color: var(--pink-dim); color: var(--pink); }
        .kb-add-btn.active {
          background: var(--pink);
          border-color: var(--pink);
          color: #1a0810;
          font-weight: 700;
        }

        .kb-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--muted);
          font-size: 14px;
        }

        /* Queue sidebar */
        .kb-queue {
          position: sticky;
          top: 0;
          background: var(--bg-alt);
          border-left: 1px solid var(--border);
          min-height: 100vh;
          padding: 28px 20px;
        }
        @media (max-width: 899px) {
          .kb-queue { border-left: none; border-top: 1px solid var(--border); min-height: auto; }
        }
        .kb-queue-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .kb-queue-title {
          font-family: 'Unbounded', sans-serif;
          font-weight: 700;
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kb-queue-count {
          font-family: 'JetBrains Mono', monospace;
          background: var(--pink);
          color: #1a0810;
          font-size: 11px;
          font-weight: 700;
          border-radius: 999px;
          padding: 2px 9px;
        }
        .kb-queue-sub {
          font-size: 12px;
          color: var(--muted);
          margin: 4px 0 18px;
        }
        .kb-queue-tools {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
        }
        .kb-tool-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          padding: 8px 0;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
        }
        .kb-tool-btn:hover { color: var(--text); border-color: var(--cyan-dim); }

        .kb-queue-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 60vh;
          overflow-y: auto;
        }
        .kb-queue-item {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 9px 10px;
        }
        .kb-queue-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--cyan);
          width: 18px;
          flex-shrink: 0;
        }
        .kb-queue-item-name {
          flex: 1;
          min-width: 0;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .kb-queue-item-series {
          font-size: 11px;
          color: var(--muted);
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .kb-queue-remove {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          padding: 4px;
          flex-shrink: 0;
        }
        .kb-queue-remove:hover { color: var(--pink); }
        .kb-queue-empty {
          text-align: center;
          color: var(--muted);
          font-size: 12.5px;
          padding: 30px 10px;
          border: 1px dashed var(--border);
          border-radius: 10px;
        }

        .kb-toast {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface-hi);
          border: 1px solid var(--pink);
          color: var(--text);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          padding: 10px 18px;
          border-radius: 999px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
          z-index: 50;
        }

        .kb-loading, .kb-error {
          padding: 60px 24px;
          text-align: center;
          color: var(--muted);
        }
        .kb-spinner {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 3px solid var(--border);
          border-top-color: var(--pink);
          margin: 0 auto 16px;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="kb-shell">
        <div>
          <div className="kb-header">
            <div className="kb-eyebrow">Now Selecting</div>
            <h1 className="kb-title">Karaoke List</h1>
            <p className="kb-sub">
              Every song on the sheet, pulled live. Tap a track to line it up in the queue on the right.
            </p>
            <div className="kb-stats">
              <div className="kb-stat"><b>{songs.length}</b> songs</div>
              <div className="kb-stat"><b>{linkedCount}</b> with a link</div>
              {lyricsCount > 0 && <div className="kb-stat"><b>{lyricsCount}</b> with lyrics</div>}
              <div className="kb-stat"><b>{queue.length}</b> queued</div>
            </div>
          </div>

          <div className="kb-controls">
            <div className="kb-search">
              <Search size={16} />
              <input
                placeholder="Search song or series…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div
              className={`kb-toggle ${onlyLinked ? "active" : ""}`}
              onClick={() => setOnlyLinked((v) => !v)}
            >
              <span className="dot" />
              Has link only
            </div>
            {lyricsCount > 0 && (
              <div
                className={`kb-toggle ${onlyMissingLyrics ? "active" : ""}`}
                onClick={() => setOnlyMissingLyrics((v) => !v)}
              >
                <span className="dot" />
                Missing lyrics
              </div>
            )}
          </div>

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
              {filtered.length === 0 && (
                <div className="kb-empty">No songs match "{query}".</div>
              )}
              {filtered.map((song, i) => {
                const inQueue = queuedIds.has(song.id);
                return (
                  <div key={song.id} className={`kb-row ${inQueue ? "in-queue" : ""}`}>
                    <div className="kb-num">{String(i + 1).padStart(3, "0")}</div>
                    <div className="kb-meta">
                      <div className="kb-name">{song.name}</div>
                      {song.series && <div className="kb-series">{song.series}</div>}
                    </div>
                    <div className="kb-actions">
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
                          <FileText size={15} strokeWidth={1.75}/>
                        </a>
                      )}
                      <button
                        className={`kb-add-btn ${inQueue ? "active" : ""}`}
                        onClick={() => toggleQueue(song)}
                        style={{ display: "none" }}
                      >
                        {inQueue ? "Queued" : "+ Queue"}
                      </button>
                      <button
                          className="kb-icon-btn"
                          onClick={() => copySongName(song)}
                          title="Copy song name"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="kb-queue">
          <div className="kb-queue-head">
            <div className="kb-queue-title">
              <ListMusic size={17} />
              Queue
            </div>
            {queue.length > 0 && <div className="kb-queue-count">{queue.length}</div>}
          </div>
          <div className="kb-queue-sub">Your up-next list for tonight.</div>

          {queue.length > 0 && (
            <div className="kb-queue-tools">
              <button className="kb-tool-btn" onClick={shuffleQueue}>
                <Shuffle size={13} /> Shuffle
              </button>
              <button className="kb-tool-btn" onClick={clearQueue}>
                <RotateCcw size={13} /> Clear
              </button>
            </div>
          )}

          <div className="kb-queue-list">
            {queue.length === 0 && (
              <div className="kb-queue-empty">
                <Music4 size={18} style={{ marginBottom: 8, opacity: 0.6 }} />
                <div>Nothing queued yet — pick a few songs from the list.</div>
              </div>
            )}
            {queue.map((song, i) => (
              <div className="kb-queue-item" key={song.id}>
                <div className="kb-queue-num">{i + 1}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="kb-queue-item-name">{song.name}</span>
                  {song.series && <span className="kb-queue-item-series">{song.series}</span>}
                </div>
                <button className="kb-queue-remove" onClick={() => toggleQueue(song)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="kb-toast">{toast}</div>}
    </div>
  );
}
