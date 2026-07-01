import { useState } from "react";
import { createBook, createBookChapters, type Book } from "../api/client";

interface Props {
  onCreated: (book: Book) => void;
  onClose: () => void;
}

const COUNTS = [3, 5, 8, 10, 15, 20];

const FRONT_MATTER = {
  memoir:  ["Dedication", "Epigraph", "Foreword", "Preface", "Author's Note"],
  fiction: ["Dedication", "Epigraph", "Foreword"],
};
const BACK_MATTER = {
  memoir:  ["Acknowledgements", "A Note on Sources", "About the Author"],
  fiction: ["Acknowledgements", "About the Author"],
};

export default function NewBookModal({ onCreated, onClose }: Props) {
  const [title, setTitle]   = useState("");
  const [genre, setGenre]   = useState<"fiction" | "memoir">("fiction");
  const [prologue, setPrologue] = useState(false);
  const [epilogue, setEpilogue] = useState(false);
  const [count, setCount]   = useState(5);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const finalCount = custom ? Math.max(1, Math.min(50, parseInt(custom) || 1)) : count;

  function selectGenre(g: "fiction" | "memoir") {
    setGenre(g);
    if (g === "memoir") { setPrologue(true); setEpilogue(true); }
    else { setPrologue(false); setEpilogue(false); }
  }

  async function handleCreate() {
    if (!title.trim()) { setError("Book title is required."); return; }
    setLoading(true);
    setError(null);
    try {
      const book = await createBook(title.trim(), genre);
      const chapters = await createBookChapters(book.id, finalCount, prologue, epilogue);
      onCreated({ ...book, chapter_count: chapters.length, done_count: 0 });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-box">
        <div className="modal-title">New Book</div>

        {/* Title */}
        <div className="field">
          <label>Title</label>
          <input
            autoFocus
            type="text"
            placeholder="e.g. The Last Signal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>

        {/* Genre */}
        <div className="field">
          <label>Genre</label>
          <div className="nb-genre-row">
            <button
              className={`nb-genre-btn ${genre === "fiction" ? "sel" : ""}`}
              onClick={() => selectGenre("fiction")}
            >
              <span className="nb-genre-icon">📖</span>
              <span className="nb-genre-name">Fiction</span>
              <span className="nb-genre-hint">Numbered chapters, optional prologue & epilogue</span>
            </button>
            <button
              className={`nb-genre-btn ${genre === "memoir" ? "sel" : ""}`}
              onClick={() => selectGenre("memoir")}
            >
              <span className="nb-genre-icon">✍</span>
              <span className="nb-genre-name">Memoir</span>
              <span className="nb-genre-hint">Titled chapters with emotional weight, prologue & epilogue</span>
            </button>
          </div>
        </div>

        {/* Structure */}
        <div className="field">
          <label>Structure</label>
          <div className="nb-structure-row">
            <label className="nb-check">
              <input type="checkbox" checked={prologue} onChange={(e) => setPrologue(e.target.checked)} />
              <span className="nb-check-box" />
              <span className="nb-check-label">
                <span className="nb-check-name">Prologue</span>
                <span className="nb-check-desc">
                  {genre === "memoir" ? "Dramatic hook before chronology" : "World-building or flash-forward"}
                </span>
              </span>
            </label>
            <label className="nb-check">
              <input type="checkbox" checked={epilogue} onChange={(e) => setEpilogue(e.target.checked)} />
              <span className="nb-check-box" />
              <span className="nb-check-label">
                <span className="nb-check-name">Epilogue</span>
                <span className="nb-check-desc">
                  {genre === "memoir" ? "Where you are now — closure" : "Aftermath after the climax"}
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Chapter count */}
        <div className="field">
          <label>Main Chapters</label>
          <div className="count-row">
            {COUNTS.map((n) => (
              <button
                key={n}
                className={`count-btn ${!custom && count === n ? "sel" : ""}`}
                onClick={() => { setCount(n); setCustom(""); }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>or enter:</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="e.g. 24"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={{ width: 80, textAlign: "center" }}
            />
          </div>
        </div>

        {/* Auto-included sections preview */}
        <div className="nb-sections-preview">
          <div className="nb-sections-row">
            <div className="nb-sections-col">
              <div className="nb-sections-heading">Front Matter</div>
              {FRONT_MATTER[genre].map((s) => <div key={s} className="nb-section-item">· {s}</div>)}
              {prologue && <div className="nb-section-item nb-section-body">· Prologue</div>}
            </div>
            <div className="nb-sections-col nb-sections-mid">
              <div className="nb-sections-heading">Chapters</div>
              <div className="nb-section-item nb-section-body">
                · {finalCount} chapter{finalCount !== 1 ? "s" : ""}
              </div>
              {epilogue && <div className="nb-section-item nb-section-body">· Epilogue</div>}
            </div>
            <div className="nb-sections-col">
              <div className="nb-sections-heading">Back Matter</div>
              {BACK_MATTER[genre].map((s) => <div key={s} className="nb-section-item">· {s}</div>)}
            </div>
          </div>
          <div className="nb-sections-total">
            {FRONT_MATTER[genre].length + (prologue ? 1 : 0) + finalCount + (epilogue ? 1 : 0) + BACK_MATTER[genre].length} total recordable sections
          </div>
        </div>

        {error && (
          <div className="error-bar">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-launch" onClick={handleCreate} disabled={loading}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span className="spinner" style={{ borderTopColor: "#fff" }} />
                Creating…
              </span>
            ) : `Create Book →`}
          </button>
        </div>
      </div>
    </div>
  );
}
