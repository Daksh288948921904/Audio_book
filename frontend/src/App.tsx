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
import PublishedSection from "./components/PublishedSection";
import WelcomeScreen from "./components/WelcomeScreen";
import ManuscriptButton from "./components/ManuscriptButton";
import "./dashboard-theme.css";
import CommandPalette, { isMac, type Command } from "./components/ui/CommandPalette";
import ProgressRing from "./components/ui/ProgressRing";
import ChapterTimeline from "./components/ui/ChapterTimeline";
import RolePicker from "./components/ui/RolePicker";
import { AnimatedNumber } from "./components/landing/primitives";
import "./components/ui/ui.css";

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
  const [showWelcome, setShowWelcome] = useState(false);

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

  // While the CMS turns an uploaded manuscript into chapters, poll for progress
  // and show the new chapters once it finishes.
  const activeManuscriptStatus = books.find((b) => b.id === activeBookId)?.manuscript_status;
  useEffect(() => {
    if (activeManuscriptStatus !== "processing" || activeBookId == null) return;
    const bookId = activeBookId;
    const t = setInterval(async () => {
      try {
        const bs = await listBooks();
        setBooks(bs);
        if (bs.find((b) => b.id === bookId)?.manuscript_status !== "processing") loadBookChapters(bookId);
      } catch { /* transient — retry next tick */ }
    }, 10_000);
    return () => clearInterval(t);
  }, [activeManuscriptStatus, activeBookId]);

  // Chapters are written in the background — refresh while any is being written.
  const anyGenerating = chapters.some((c) => c.status === "generating");
  useEffect(() => {
    if (!anyGenerating || activeBookId == null) return;
    const bookId = activeBookId;
    const t = setInterval(async () => {
      try {
        const chs = await listBookChapters(bookId);
        setChapters((prev) => chs.map((c) => prev.find((p) => p.id === c.id && p.status === c.status) ?? c));
      } catch { /* transient — retry next tick */ }
    }, 10_000);
    return () => clearInterval(t);
  }, [anyGenerating, activeBookId]);

  // ⌘K / Ctrl+K opens the command palette anywhere in the dashboard
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    setShowWelcome(true);
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

  function handleBookCreated(book: Book, warning?: string) {
    if (warning) setGlobalError(warning);
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

  function handleSegmentAdded(chapterId: number, seg: Segment) {
    setSegsMap((prev) => ({ ...prev, [chapterId]: [...(prev[chapterId] ?? []), seg] }));
    setBooks((prev) => prev.map((b) => b.id === activeBookId ? { ...b } : b));
  }

  function handleAssigned(chapterId: number, seg: Segment) {
    handleSegmentAdded(chapterId, seg);
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

  function handleSegmentMoved(segId: number, fromChapterId: number, toChapterId: number) {
    setSegsMap((prev) => {
      const seg = (prev[fromChapterId] ?? []).find((s) => s.id === segId);
      if (!seg) return prev;
      const fromSegs = (prev[fromChapterId] ?? []).filter((s) => s.id !== segId);
      const toSegs   = [...(prev[toChapterId] ?? []), { ...seg, chapter_id: toChapterId }];
      return { ...prev, [fromChapterId]: fromSegs, [toChapterId]: toSegs };
    });
  }

  async function handleViewManuscript(ch: Chapter) {
    setViewingChapter(ch.generated_text ? ch : await import("./api/client").then(({ getChapter }) => getChapter(ch.id)));
  }

  // ── Show nothing while checking stored token ────────────────────────────
  if (!authChecked) return null;

  // ── Admin role picker (existing session or fresh login routed here) ────
  if (adminPending) {
    return (
      <RolePicker
        name={adminPending.name || adminPending.email}
        onAdmin={() => { window.location.href = "/cms"; }}
        onUser={() => { setAuthUser(adminPending); setAdminPending(null); }}
      />
    );
  }

  // ── Login gate ──────────────────────────────────────────────────────────
  if (!authUser) return <LandingPage onLogin={handleLogin} />;

  const activeBook = books.find((b) => b.id === activeBookId) ?? null;
  const totalSegs  = Object.values(segsMap).reduce((a, s) => a + s.length, 0);
  const mainChapters = chapters.filter((c) => c.section_type === "chapter");
  const frontMatter  = chapters.filter((c) => c.section_type === "front_matter");
  const backMatter   = chapters.filter((c) => c.section_type === "back_matter");
  const doneCount = mainChapters.filter((c) => c.status === "done").length;
  const segCounts = Object.fromEntries(Object.entries(segsMap).map(([k, v]) => [Number(k), v.length]));

  // Display number for each chapter-type section (excludes Prologue/Epilogue)
  const numberedIds = mainChapters
    .filter((c) => c.title !== "Prologue" && c.title !== "Epilogue")
    .map((c) => c.id);
  function openChapter(ch: Chapter) {
    const card = document.querySelector<HTMLElement>(`[data-chapter-id="${ch.id}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => card?.click(), 350);
  }
  const clickEl = (sel: string) => document.querySelector<HTMLElement>(sel)?.click();

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Writing late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const commands: Command[] = [
    { id: "new-book", group: "Books", label: "New book", icon: "✚", hint: "Create", keywords: "create add start", run: () => setShowNewBook(true) },
    ...books.map((b): Command => ({
      id: `book-${b.id}`, group: "Books", label: b.title, icon: b.genre === "memoir" ? "✍" : "📖",
      hint: b.id === activeBookId ? "Current" : `${b.chapter_count} chapters`, keywords: "open switch book",
      run: () => handleSelectBook(b.id),
    })),
    ...(activeBook ? [
      { id: "record", group: "Write", label: "Record a segment", icon: "🎙", hint: "Mic", keywords: "voice audio speak", run: () => clickEl(".record-zone .rec-btn") },
      { id: "upload-audio", group: "Write", label: "Upload an audio file", icon: "⬆", keywords: "mp3 m4a wav", run: () => clickEl(".record-zone .upload-link") },
      { id: "upload-ms", group: "Write", label: "Upload manuscript PDF", icon: "📄", keywords: "pdf book written", run: () => clickEl(".ms-upload-btn") },
    ] : []),
    ...chapters.map((c): Command => ({
      id: `ch-${c.id}`, group: "Chapters", label: chapterLabel(c), icon: c.status === "done" ? "✓" : c.status === "generating" ? "✦" : "●",
      hint: c.status === "done" ? (c.published_at ? "Published" : "Written") : c.status === "generating" ? "Writing…" : `${segsMap[c.id]?.length ?? 0} recordings`,
      keywords: "chapter open", run: () => openChapter(c),
    })),
    { id: "signout", group: "Account", label: "Sign out", icon: "↩", keywords: "logout exit", run: handleSignOut },
  ];

  function chapterLabel(ch: Chapter): string {
    const n = displayNum(ch);
    if (n == null) return ch.title ?? `Section ${ch.number}`;
    return ch.title ? `Chapter ${n}: ${ch.title}` : `Chapter ${n}`;
  }

  function displayNum(ch: { id: number; section_type: string; title: string | null }): number | null {
    if (ch.section_type !== "chapter") return null;
    if (ch.title === "Prologue" || ch.title === "Epilogue") return null;
    const idx = numberedIds.indexOf(ch.id);
    return idx === -1 ? null : idx + 1;
  }

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
                <span className="book-icon">{b.genre === "memoir" ? "✍" : "📖"}</span>
                <span className="book-name">{b.title}</span>
                <span className="book-genre-badge">{b.genre === "memoir" ? "Memoir" : "Fiction"}</span>
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
        <div className="ux-topbar">
          <div className="ux-greet">{greeting}, <b>{authUser.name.split(" ")[0] || "author"}</b></div>
          <button className="ux-cmdk-trigger" onClick={() => setPaletteOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span>Search books, chapters, actions…</span>
            <kbd className="ux-kbd">{isMac ? "⌘" : "Ctrl"}</kbd><kbd className="ux-kbd">K</kbd>
          </button>
        </div>
        {globalError && (
          <div className="error-bar" style={{ margin: "12px 20px 0" }}>
            {globalError}
            <button onClick={() => setGlobalError(null)}>×</button>
          </div>
        )}

        {!activeBook ? (
          <div className="welcome">
            <div className="welcome-orb">✍</div>
            <h1>Start your <em className="dash-accent">first book.</em></h1>
            <p>Record your voice, assign segments to chapters, and watch them become a finished manuscript.
              Already written it? Upload your manuscript PDF when you create the book.</p>
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
                <ProgressRing value={mainChapters.length ? doneCount / mainChapters.length : 0} size={74}>
                  <div>
                    <div className="ux-ring-pct"><AnimatedNumber value={mainChapters.length ? Math.round((doneCount / mainChapters.length) * 100) : 0} suffix="%" /></div>
                    <span className="ux-ring-lbl">written</span>
                  </div>
                </ProgressRing>
                <div className="stat-pill">
                  <div className="stat-n blue"><AnimatedNumber value={chapters.length} /></div>
                  <div className="stat-label">Chapters</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-n amber"><AnimatedNumber value={totalSegs} /></div>
                  <div className="stat-label">Recordings</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-n green"><AnimatedNumber value={doneCount} /></div>
                  <div className="stat-label">Complete</div>
                </div>
              </div>
            </div>

            <ManuscriptButton
              book={activeBook}
              onUploaded={(patch) => setBooks((prev) => prev.map((b) => b.id === activeBook.id ? { ...b, ...patch } : b))}
            />

            <PublishedSection
              chapters={chapters.filter((c) => c.published_at && c.status === "done")}
              labelFor={chapterLabel}
              bookTitle={activeBook.title}
            />

            <div className="book-content">
              <RecordZone onRecorded={handleRecorded} />

              <div className="feed-section">
                {/* Front Matter */}
                {frontMatter.length > 0 && (
                  <>
                    <div className="feed-head">
                      <div className="feed-label feed-label-matter">Front Matter</div>
                    </div>
                    <div className="chapter-list">
                      {frontMatter.map((ch, i) => (
                        <ChapterCard key={ch.id} chapter={ch} segments={segsMap[ch.id] ?? []}
                          allChapters={chapters} index={i} displayNum={displayNum(ch)}
                          onChapterUpdated={handleChapterUpdated} onChapterDeleted={handleChapterDeleted}
                          onSegmentDeleted={handleSegmentDeleted} onSegmentMoved={handleSegmentMoved}
                          onViewManuscript={handleViewManuscript} onSegmentAdded={handleSegmentAdded}
                          bookTitle={activeBook.title} />
                      ))}
                    </div>
                  </>
                )}

                <ChapterTimeline chapters={mainChapters} labelFor={chapterLabel} onOpen={openChapter} />

                {/* Main Chapters */}
                <div className="feed-head">
                  <div className="feed-label">Chapters</div>
                  <div className="feed-tally">{doneCount}/{mainChapters.length} complete</div>
                </div>
                <div className="chapter-list">
                  {mainChapters.map((ch, i) => (
                    <ChapterCard key={ch.id} chapter={ch} segments={segsMap[ch.id] ?? []}
                      allChapters={chapters} index={i} displayNum={displayNum(ch)}
                      onChapterUpdated={handleChapterUpdated} onChapterDeleted={handleChapterDeleted}
                      onSegmentDeleted={handleSegmentDeleted} onSegmentMoved={handleSegmentMoved}
                      onViewManuscript={handleViewManuscript} onSegmentAdded={handleSegmentAdded}
                          bookTitle={activeBook.title} />
                  ))}
                </div>

                {/* Back Matter */}
                {backMatter.length > 0 && (
                  <>
                    <div className="feed-head">
                      <div className="feed-label feed-label-matter">Back Matter</div>
                    </div>
                    <div className="chapter-list">
                      {backMatter.map((ch, i) => (
                        <ChapterCard key={ch.id} chapter={ch} segments={segsMap[ch.id] ?? []}
                          allChapters={chapters} index={i} displayNum={displayNum(ch)}
                          onChapterUpdated={handleChapterUpdated} onChapterDeleted={handleChapterDeleted}
                          onSegmentDeleted={handleSegmentDeleted} onSegmentMoved={handleSegmentMoved}
                          onViewManuscript={handleViewManuscript} onSegmentAdded={handleSegmentAdded}
                          bookTitle={activeBook.title} />
                      ))}
                    </div>
                  </>
                )}
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
                ? `Chapter ${displayNum(viewingChapter) ?? viewingChapter.number}: ${viewingChapter.title}`
                : `Chapter ${displayNum(viewingChapter) ?? viewingChapter.number}`}
            </div>
          </div>
          <div className="ms-body">
            <ChapterViewer
              chapterId={viewingChapter.id}
              chapterNumber={displayNum(viewingChapter) ?? viewingChapter.number}
              title={viewingChapter.title ?? null}
              text={viewingChapter.generated_text}
              summary={viewingChapter.summary ?? ""}
              fromManuscript={viewingChapter.from_manuscript}
              publishedAt={viewingChapter.published_at}
              bookTitle={activeBook?.title}
              onClose={() => setViewingChapter(null)}
              onReopen={async () => {
                const { reopenChapter } = await import("./api/client");
                await reopenChapter(viewingChapter.id);
                handleChapterUpdated({ ...viewingChapter, status: "recording", generated_text: undefined, summary: undefined, published_at: null });
                setViewingChapter(null);
              }}
            />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands}
        placeholder="Search books, chapters, or type an action…" />

      {/* ── New Book Modal ── */}
      {showNewBook && (
        <NewBookModal
          onCreated={handleBookCreated}
          onClose={() => setShowNewBook(false)}
        />
      )}

      {/* ── Welcome Screen — fresh login only ── */}
      {showWelcome && (
        <WelcomeScreen
          name={authUser.name}
          hasBooks={books.length > 0}
          onDone={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
}
