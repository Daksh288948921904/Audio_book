import { useEffect, useState } from "react";
import { cmsListBooks, type CmsBook, type CmsUser } from "../api/adminClient";

interface Props {
  user: CmsUser;
  onSelect: (book: CmsBook) => void;
}

export default function UserBooksPage({ user, onSelect }: Props) {
  const [books, setBooks]     = useState<CmsBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    cmsListBooks(user.google_id)
      .then(setBooks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [user.google_id]);

  return (
    <>
      <div className="cms-section-head">
        <div>
          <div className="cms-section-title">{user.name ?? user.email}'s Books</div>
          <div className="cms-section-meta">{books.length} book{books.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {error && (
        <div className="cms-error-bar">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="cms-loading">
          <div className="cms-spinner" /> Loading books…
        </div>
      ) : books.length === 0 ? (
        <div className="cms-empty">This user has no books yet.</div>
      ) : (
        <div className="cms-book-grid">
          {books.map((b) => {
            const pct = b.chapter_count > 0
              ? Math.round((b.done_count / b.chapter_count) * 100)
              : 0;
            return (
              <div key={b.id} className="cms-book-card" onClick={() => onSelect(b)}>
                <div className="book-title">{b.title}</div>
                <div className="book-stats">
                  <div className="stat"><strong>{b.chapter_count}</strong> chapters</div>
                  <div className="stat"><strong>{b.done_count}</strong> done</div>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
