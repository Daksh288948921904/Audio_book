import { useEffect, useState } from "react";
import {
  listBooks, listBookChapters, getSegments, clearAll, getMe, clearAuthToken,
  type Book, type Chapter, type Segment,
} from "./api/client";
import LandingPage from "./components/LandingPage";
import NewBookModal from "./components/NewBookModal";
import RecordZone from "./components/RecordZone";
import AssignModal from "./components/AssignModal";
import ChapterCard from "./components/ChapterCard";
import ChapterViewer from "./components/ChapterViewer";

interface PendingRec { blob: Blob; filename: string; }
interface AuthUser { email: string; name: string; }

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminPending, setAdminPending] = useState<AuthUser | null>(null);

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [segsMap, setSegsMap] = useState<Record<number, Segment[]>>({});
  const [pending, setPending] = useState<PendingRec | null>(null);
  const [viewingChapter, setViewingChapter] = useState<Chapter | null>(null);
  const [showNewBook, setShowNewBook] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session from localStorage on mount ──────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("ink_token");
    if (!token) { setAuthChecked(true); return; }
    getMe()
      .then((u) => {
        if (u.is_admin) {
          setAdminPending({ email: u.email, name: u.name });
        } else {
          setAuthUser({ email: u.email, name: u.name });
        }
        setAuthChecked(true);
      })
      .catch(() => { clearAuthToken(); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    if (authUser) loadBooks();
  }, [authUser]);

  useEffect(() => {
    if (activeBookId == null) { setChapters([]); setSegsMap({}); return; }
    loadBookChapters(activeBookId);
  }, [activeBookId]);

  async function loadBooks() {
    try {
      const bs = await listBooks();
      setBooks(bs);
      if (bs.length > 0 && activeBookId == null) setActiveBookId(bs[0].id);
    } catch (e) { setGlobalError(String(e)); }
    finally { setLoading(false); }
  }

  async function loadBookChapters(bookId: number) {
    try {
      const chs = await listBookChapters(bookId);
      setChapters(chs);
      const entries = await Promise.all(
        chs.map(async (ch) => [ch.id, await getSegments(ch.id)] as [number, Segment[]])
      );
      setSegsMap(Object.fromEntries(entries));
    } catch (e) { setGlobalError(String(e)); }
  }

  function handleLogin(user: AuthUser) {
    setAuthUser(user);
  }

  function handleSignOut() {
    clearAuthToken();
    setAuthUser(null);
    setBooks([]);
    setActiveBookId(null);
    setChapters([]);
    setSegsMap({});
    setViewingChapter(null);
    setPending(null);
    setLoading(true);
  }

  function handleBookCreated(book: Book) {
    setBooks((prev) => [...prev, book]);
    setActiveBookId(book.id);
    setShowNewBook(false);
  }

  function handleSelectBook(id: number) {
    if (id === activeBookId) return;
    setActiveBookId(id);
    setChapters([]);
    setSegsMap({});
    setViewingChapter(null);
    setPending(null);
  }

  async function handleClearAll() {
    if (!window.confirm("Delete ALL your books and chapters permanently? This cannot be undone.")) return;
    try {
      await clearAll();
      setBooks([]);
      setActiveBookId(null);
      setChapters([]);
      setSegsMap({});
      setViewingChapter(null);
    } catch (e) { setGlobalError(String(e)); }
  }

  function handleRecorded(blob: Blob, filename: string) {
    setPending({ blob, filename });
  }

  function handleAssigned(chapterId: number, seg: Segment) {
    setSegsMap((prev) => ({ ...prev, [chapterId]: [...(prev[chapterId] ?? []), seg] }));
    setBooks((prev) => prev.map((b) => b.id === activeBookId ? { ...b } : b));
    setPending(null);
  }

  function handleChapterUpdated(ch: Chapter) {
    setChapters((prev) => prev.map((c) => c.id === ch.id ? ch : c));
    if (viewingChapter?.id === ch.id) setViewingChapter(ch);
    setBooks((prev) => prev.map((b) => {
      if (b.id !== activeBookId) return b;
      const updated = chapters.map((c) => c.id === ch.id ? ch : c);
      return { ...b, done_count: updated.filter((c) => c.status === "done").length };
    }));
  }

  function handleChapterDeleted(id: number) {
    setChapters((prev) => prev.filter((c) => c.id !== id));
    setSegsMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (viewingChapter?.id === id) setViewingChapter(null);
  }

  function handleSegmentDeleted(chapterId: number, segId: number) {
    setSegsMap((prev) => ({ ...prev, [chapterId]: (prev[chapterId] ?? []).filter((s) => s.id !== segId) }));
  }

  async function handleViewManuscript(ch: Chapter) {
    setViewingChapter(ch.generated_text ? ch : await import("./api/client").then(({ getChapter }) => getChapter(ch.id)));
  }

  // ── Show nothing while checking stored token ────────────────────────────
  if (!authChecked) return null;

  // ── Admin role picker (existing session or fresh login routed here) ────
  if (adminPending) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0a0a14",
      }}>
        <div style={{
          background: "#13131f", border: "1px solid #2a2a42", borderRadius: 16,
          padding: 40, width: 360, textAlign: "center",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13, background: "linear-gradient(135deg,#6d28d9,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 auto 16px",
          }}>I</div>
          <h2 style={{ color: "#e4e4f0", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Where to?</h2>
          <p style={{ color: "#9898b8", fontSize: 14, marginBottom: 24 }}>
            Welcome back, {adminPending.name || adminPending.email}.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => { window.location.href = "/cms"; }}
              style={{
                background: "linear-gradient(135deg,#6d28d9,#8b5cf6)", color: "#fff",
                border: "none", borderRadius: 10, padding: "14px 20px",
                fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left",
              }}
            >
              <div>⚙ Admin Panel</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 3 }}>
                Manage users, generate chapters, compile books
              </div>
            </button>
            <button
              onClick={() => { setAuthUser(adminPending); setAdminPending(null); }}
              style={{
                background: "rgba(255,255,255,0.06)", color: "#e4e4f0",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                padding: "14px 20px", fontSize: 15, fontWeight: 700,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <div>📖 User Panel</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>
                Record segments, view your own books
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login gate ──────────────────────────────────────────────────────────
  if (!authUser) return <LandingPage onLogin={handleLogin} />;

  const activeBook = books.find((b) => b.id === activeBookId) ?? null;
  const totalSegs = Object.values(segsMap).reduce((a, s) => a + s.length, 0);
  const doneCount = chapters.filter((c) => c.status === "done").length;
  const segCounts = Object.fromEntries(Object.entries(segsMap).map(([k, v]) => [Number(k), v.length]));

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">I</div>
          <div>
            <div className="logo-text">Inkwell</div>
            <div className="logo-sub">Writing Studio</div>
          </div>
        </div>

        <div className="sidebar-section">Books</div>

        <div className="sidebar-books">
          {loading ? (
            <div style={{ padding: "16px 14px", display: "flex", gap: 10, alignItems: "center", color: "var(--text-3)", fontSize: 12 }}>
              <div className="spinner" style={{ width: 12, height: 12 }} /> Loading…
            </div>
          ) : books.length === 0 ? (
            <div style={{ padding: "12px 14px", color: "var(--text-3)", fontSize: 12, lineHeight: 1.6 }}>
              No books yet.<br />Create your first one below.
            </div>
          ) : (
            books.map((b, i) => (
              <button
                key={b.id}
                className={`book-item ${b.id === activeBookId ? "active" : ""}`}
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => handleSelectBook(b.id)}
              >
                <span className="book-icon">📖</span>
                <span className="book-name">{b.title}</span>
                <span className="book-count">{b.chapter_count}</span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {/* User info + sign out */}
          <div className="sidebar-user">
            <div className="user-avatar">{authUser.name[0]?.toUpperCase() ?? "?"}</div>
            <div className="user-info">
              <div className="user-name">{authUser.name}</div>
              <div className="user-email">{authUser.email}</div>
            </div>
            <button className="btn-signout" title="Sign out" onClick={handleSignOut}>↩</button>
          </div>
          <button className="btn-new-book" onClick={() => setShowNewBook(true)}>
            + New Book
          </button>
          <button className="btn-clear-db" onClick={handleClearAll}>
            ⚠ Clear All Data
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        {globalError && (
          <div className="error-bar" style={{ margin: "12px 20px 0" }}>
            {globalError}
            <button onClick={() => setGlobalError(null)}>×</button>
          </div>
        )}

        {!activeBook ? (
          <div className="welcome">
            <div className="welcome-orb">✍</div>
            <h1>Start your first book</h1>
            <p>Record your voice, assign segments to chapters, and watch them become a finished manuscript.</p>
            <button className="btn-create-first" onClick={() => setShowNewBook(true)}>
              + Create a Book
            </button>
          </div>
        ) : (
          <div className="book-workspace">
            <div className="book-header">
              <div className="book-header-left">
                <div className="book-header-eyebrow">Current Book</div>
                <div className="book-header-title">{activeBook.title}</div>
              </div>
              <div className="book-header-stats">
                <div className="stat-pill">
                  <div className="stat-n blue">{chapters.length}</div>
                  <div className="stat-label">Chapters</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-n amber">{totalSegs}</div>
                  <div className="stat-label">Recordings</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-n green">{doneCount}</div>
                  <div className="stat-label">Complete</div>
                </div>
              </div>
            </div>

            <div className="book-content">
              <RecordZone onRecorded={handleRecorded} />

              <div className="feed-section">
                <div className="feed-head">
                  <div className="feed-label">Chapters</div>
                  <div className="feed-tally">{doneCount}/{chapters.length} complete</div>
                </div>
                <div className="chapter-list">
                  {chapters.map((ch, i) => (
                    <ChapterCard
                      key={ch.id}
                      chapter={ch}
                      segments={segsMap[ch.id] ?? []}
                      index={i}
                      onChapterUpdated={handleChapterUpdated}
                      onChapterDeleted={handleChapterDeleted}
                      onSegmentDeleted={handleSegmentDeleted}
                      onViewManuscript={handleViewManuscript}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Assign Modal ── */}
      {pending && (
        <AssignModal
          blob={pending.blob}
          filename={pending.filename}
          chapters={chapters}
          segmentCounts={segCounts}
          onAssigned={handleAssigned}
          onCancel={() => setPending(null)}
        />
      )}

      {/* ── Manuscript Overlay ── */}
      {viewingChapter && viewingChapter.generated_text && (
        <div className="ms-overlay">
          <div className="ms-bar">
            <div className="ms-bar-title">
              {viewingChapter.title
                ? `Chapter ${viewingChapter.number}: ${viewingChapter.title}`
                : `Chapter ${viewingChapter.number}`}
            </div>
          </div>
          <div className="ms-body">
            <ChapterViewer
              chapterId={viewingChapter.id}
              chapterNumber={viewingChapter.number}
              title={viewingChapter.title}
              text={viewingChapter.generated_text}
              summary={viewingChapter.summary ?? ""}
              onClose={() => setViewingChapter(null)}
              onReopen={async () => {
                const { reopenChapter } = await import("./api/client");
                await reopenChapter(viewingChapter.id);
                handleChapterUpdated({ ...viewingChapter, status: "recording", generated_text: undefined, summary: undefined });
                setViewingChapter(null);
              }}
            />
          </div>
        </div>
      )}

      {/* ── New Book Modal ── */}
      {showNewBook && (
        <NewBookModal
          onCreated={handleBookCreated}
          onClose={() => setShowNewBook(false)}
        />
      )}
    </div>
  );
}
