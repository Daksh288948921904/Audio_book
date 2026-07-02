import { useEffect, useState } from "react";
import { cmsListUsers, type CmsUser } from "../api/adminClient";

interface Props {
  onSelect: (user: CmsUser) => void;
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6d28d9, #8b5cf6)",
  "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  "linear-gradient(135deg, #047857, #10b981)",
  "linear-gradient(135deg, #b45309, #f59e0b)",
  "linear-gradient(135deg, #be185d, #ec4899)",
  "linear-gradient(135deg, #0e7490, #06b6d4)",
  "linear-gradient(135deg, #c2410c, #f97316)",
  "linear-gradient(135deg, #4c1d95, #a78bfa)",
];

function avatarGradient(seed: string) {
  const idx = (seed.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function UsersPage({ onSelect }: Props) {
  const [users, setUsers]     = useState<CmsUser[]>([]);
  const [query, setQuery]     = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    cmsListUsers()
      .then(setUsers)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      (u.name ?? "").toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  const totalBooks = users.reduce((s, u) => s + u.book_count, 0);

  return (
    <div className="up-root">
      {/* ── Page header ── */}
      <div className="up-header">
        <div className="up-header-left">
          <h1 className="up-title">Users</h1>
          <p className="up-subtitle">Everyone who has signed into Inkwell Studio</p>
        </div>
        <div className="up-header-right">
          <div className="up-stat-pill">
            <span className="up-stat-val">{users.length}</span>
            <span className="up-stat-lbl">Users</span>
          </div>
          <div className="up-stat-pill">
            <span className="up-stat-val" style={{ color: "#f59e0b" }}>{totalBooks}</span>
            <span className="up-stat-lbl">Books total</span>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="up-search-wrap">
        <svg className="up-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="#5a5a78" strokeWidth="1.5"/>
          <path d="M11 11l3 3" stroke="#5a5a78" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="up-search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="up-search-clear" onClick={() => setQuery("")}>×</button>
        )}
      </div>

      {error && (
        <div className="cms-error-bar">
          {error}<button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ── User list ── */}
      {loading ? (
        <div className="up-loading">
          <div className="cms-spinner" />
          <span>Loading users…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="up-empty">
          <div className="up-empty-icon">👤</div>
          <div className="up-empty-text">{query ? "No users match your search." : "No users yet."}</div>
        </div>
      ) : (
        <div className="up-list">
          {/* Header row */}
          <div className="up-list-header">
            <span style={{ flex: 1 }}>User</span>
            <span style={{ width: 100, textAlign: "center" }}>Books</span>
            <span style={{ width: 130 }}>Joined</span>
            <span style={{ width: 28 }} />
          </div>

          {filtered.map((u, i) => {
            const initials = (u.name ?? u.email).slice(0, 2).toUpperCase();
            const gradient = avatarGradient(u.name ?? u.email);
            return (
              <div
                key={u.google_id}
                className="up-row"
                onClick={() => onSelect(u)}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* Avatar */}
                <div className="up-avatar" style={{ background: gradient }}>
                  {initials}
                </div>

                {/* Info */}
                <div className="up-info">
                  <div className="up-name">{u.name ?? "—"}</div>
                  <div className="up-email">{u.email}</div>
                </div>

                {/* Book count */}
                <div className="up-books" style={{ width: 100 }}>
                  {u.book_count > 0 ? (
                    <div className="up-books-tip-wrap">
                      <div className="up-books-badge">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M3.5 4h5M3.5 6h5M3.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        {u.book_count} book{u.book_count !== 1 ? "s" : ""}
                      </div>
                      <div className="up-books-tooltip">
                        {(u.book_titles ?? []).map((t, i) => (
                          <div key={i} className="up-books-tooltip-item">📖 {t}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="up-no-books">No books</span>
                  )}
                </div>

                {/* Date */}
                <div className="up-date" style={{ width: 130 }}>{fmt(u.created_at)}</div>

                {/* Arrow */}
                <div className="up-arrow">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
