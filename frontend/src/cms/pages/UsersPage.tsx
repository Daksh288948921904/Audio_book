import { useEffect, useState } from "react";
import { cmsListUsers, type CmsUser } from "../api/adminClient";

interface Props {
  onSelect: (user: CmsUser) => void;
}

export default function UsersPage({ onSelect }: Props) {
  const [users, setUsers]   = useState<CmsUser[]>([]);
  const [query, setQuery]   = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

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

  return (
    <>
      <div className="cms-section-head">
        <div>
          <div className="cms-section-title">All Users</div>
          <div className="cms-section-meta">{users.length} total</div>
        </div>
        <input
          className="cms-search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="cms-error-bar">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="cms-loading">
          <div className="cms-spinner" /> Loading users…
        </div>
      ) : filtered.length === 0 ? (
        <div className="cms-empty">No users found.</div>
      ) : (
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Books</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.google_id} className="clickable" onClick={() => onSelect(u)}>
                  <td>
                    <div className="name">{u.name ?? "—"}</div>
                    <div className="email">{u.email}</div>
                  </td>
                  <td>
                    <span className="num">{u.book_count}</span>
                  </td>
                  <td>
                    <span className="date">{new Date(u.created_at).toLocaleDateString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
