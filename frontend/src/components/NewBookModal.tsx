import { useState } from "react";
import { createBook, createBookChapters, type Book } from "../api/client";

interface Props {
  onCreated: (book: Book) => void;
  onClose: () => void;
}

const COUNTS = [3, 5, 8, 10, 15, 20];

export default function NewBookModal({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(5);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalCount = custom ? Math.max(1, Math.min(50, parseInt(custom) || 1)) : count;

  async function handleCreate() {
    if (!title.trim()) { setError("Book title is required."); return; }
    setLoading(true);
    setError(null);
    try {
      const book = await createBook(title.trim());
      await createBookChapters(book.id, finalCount);
      onCreated({ ...book, chapter_count: finalCount, done_count: 0 });
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

        <div className="field">
          <label>Number of Chapters</label>
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
            ) : `Create ${finalCount} Chapters →`}
          </button>
        </div>
      </div>
    </div>
  );
}
