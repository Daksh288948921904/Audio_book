import { useEffect, useRef, useState } from "react";
import {
  cmsListChapters, cmsGetSegments, cmsCompileBook, cmsUpdateChapterText, cmsDownloadPdf,
  cmsFetchAudioBlob,
  type CmsChapter, type CmsBook, type CmsUser, type CmsSegment, type CompileResult,
} from "../api/adminClient";
import AdminChapterCard from "../components/AdminChapterCard";

interface Props {
  user: CmsUser;
  book: CmsBook;
}

// ── Manuscript slide-in panel ──────────────────────────────────────────────────
function ManuscriptPanel({
  chapter, onClose, onChapterUpdated,
}: {
  chapter: CmsChapter;
  onClose: () => void;
  onChapterUpdated: (ch: CmsChapter) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(chapter.generated_text ?? "");
  const [saving,  setSaving]    = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const heading = chapter.title
    ? `Chapter ${chapter.number}: ${chapter.title}`
    : `Chapter ${chapter.number}`;

  const paragraphs = (chapter.generated_text ?? "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^chapter\s+\d+/i.test(p));

  function startEdit() {
    setDraft(chapter.generated_text ?? "");
    setSaveErr(null);
    setEditing(true);
    setTimeout(() => taRef.current?.focus(), 50);
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    try {
      await cmsUpdateChapterText(chapter.id, draft);
      onChapterUpdated({ ...chapter, generated_text: draft });
      setEditing(false);
    } catch (e) { setSaveErr(String(e)); }
    finally { setSaving(false); }
  }

  async function handlePdf() {
    try { await cmsDownloadPdf(chapter.id, chapter.number); }
    catch (e) { setSaveErr(String(e)); }
  }

  return (
    <div className="cms-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cms-ms-panel">
        <div className="cms-ms-head">
          <h2>{heading}</h2>
          <div className="cms-ms-head-actions">
            {editing ? (
              <>
                <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="cms-btn cms-btn-primary" style={{ fontSize: 12 }}
                  onClick={handleSave} disabled={saving}>
                  {saving ? <><div className="cms-spinner" style={{ width: 12, height: 12 }} /> Saving</> : "Save"}
                </button>
              </>
            ) : (
              <>
                <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12 }} onClick={startEdit}>✏ Edit</button>
                <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12 }} onClick={handlePdf}>↓ PDF</button>
              </>
            )}
            <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {saveErr && (
          <div className="cms-error-bar" style={{ margin: "0 20px 0", borderRadius: 6 }}>
            {saveErr}
            <button onClick={() => setSaveErr(null)}>×</button>
          </div>
        )}

        <div className="cms-ms-body">
          {editing ? (
            <textarea
              ref={taRef}
              className="cms-ms-editor"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              spellCheck
            />
          ) : (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          )}
        </div>
      </div>
    </div>
  );
}

// ── Segment audio player row ───────────────────────────────────────────────────
function SegmentRow({ seg }: { seg: CmsSegment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadAudio() {
    if (src || !seg.has_audio) return;
    setLoading(true);
    setSrc(await cmsFetchAudioBlob(seg.id));
    setLoading(false);
  }

  return (
    <div className="cms-seg" onClick={loadAudio}>
      <div className="cms-seg-head">
        <span className="cms-seg-idx">#{seg.order_index}</span>
        {seg.intent && <span className="cms-intent-badge">{seg.intent}</span>}
      </div>
      {seg.transcript && <div className="cms-seg-text">{seg.transcript}</div>}
      {seg.has_audio && (
        loading ? (
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>Loading audio…</div>
        ) : src ? (
          <audio src={src} controls />
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Tap to load audio</div>
        )
      )}
    </div>
  );
}

// ── Chapter detail side panel (segments view) ──────────────────────────────────
function ChapterSegmentsPanel({
  chapter, onClose,
}: {
  chapter: CmsChapter;
  onClose: () => void;
}) {
  const [segs, setSegs]       = useState<CmsSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    cmsGetSegments(chapter.id)
      .then(setSegs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [chapter.id]);

  const heading = chapter.title
    ? `Chapter ${chapter.number}: ${chapter.title}`
    : `Chapter ${chapter.number}`;

  return (
    <div className="cms-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cms-ms-panel">
        <div className="cms-ms-head">
          <h2>{heading} — Recordings</h2>
          <div className="cms-ms-head-actions">
            <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div className="cms-ms-body">
          {error && <div className="cms-error-bar">{error}<button onClick={() => setError(null)}>×</button></div>}
          {loading ? (
            <div className="cms-loading"><div className="cms-spinner" /> Loading recordings…</div>
          ) : segs.length === 0 ? (
            <div className="cms-empty">No recordings for this chapter.</div>
          ) : (
            <div className="cms-segs">
              {segs.map((s) => <SegmentRow key={s.id} seg={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main BookDashboard ─────────────────────────────────────────────────────────
export default function BookDashboard({ user, book }: Props) {
  const [chapters, setChapters]   = useState<CmsChapter[]>([]);
  const [segsMap, setSegsMap]     = useState<Record<number, CmsSegment[]>>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileResults, setCompileResults] = useState<CompileResult[] | null>(null);
  const [viewMs, setViewMs]       = useState<CmsChapter | null>(null);
  const [viewSegs, setViewSegs]   = useState<CmsChapter | null>(null);

  useEffect(() => {
    load();
  }, [book.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const chs = await cmsListChapters(book.id);
      setChapters(chs);
      const entries = await Promise.all(
        chs.map(async (ch) => [ch.id, await cmsGetSegments(ch.id)] as [number, CmsSegment[]])
      );
      setSegsMap(Object.fromEntries(entries));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  function handleChapterUpdated(ch: CmsChapter) {
    setChapters((prev) => prev.map((c) => c.id === ch.id ? ch : c));
    if (viewMs?.id === ch.id) setViewMs(ch);
  }

  async function handleCompileAll() {
    setCompiling(true);
    setCompileResults(null);
    setError(null);
    try {
      const res = await cmsCompileBook(book.id);
      setCompileResults(res.results);
      // Refresh chapters to get updated state
      const chs = await cmsListChapters(book.id);
      setChapters(chs);
    } catch (e) { setError(String(e)); }
    finally { setCompiling(false); }
  }

  const doneCount = chapters.filter((c) => c.status === "done").length;
  const recordingWithSegs = chapters.filter(
    (c) => c.status === "recording" && (segsMap[c.id]?.length ?? 0) > 0
  );
  const totalSegs = Object.values(segsMap).reduce((a, v) => a + v.length, 0);

  return (
    <>
      <div className="cms-section-head">
        <div>
          <div className="cms-section-title">{book.title}</div>
          <div className="cms-section-meta" style={{ marginTop: 2 }}>
            {user.name ?? user.email}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="cms-stats">
        <div className="cms-stat">
          <div className="s-val" style={{ color: "var(--blue)" }}>{chapters.length}</div>
          <div className="s-lbl">Chapters</div>
        </div>
        <div className="cms-stat">
          <div className="s-val" style={{ color: "var(--amber)" }}>{totalSegs}</div>
          <div className="s-lbl">Recordings</div>
        </div>
        <div className="cms-stat">
          <div className="s-val" style={{ color: "var(--green)" }}>{doneCount}</div>
          <div className="s-lbl">Complete</div>
        </div>
      </div>

      {error && (
        <div className="cms-error-bar">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Compile results */}
      {compileResults && (
        <div className="cms-compile-results">
          <h3>Compile results</h3>
          {compileResults.map((r) => (
            <div key={r.chapter_id} className="cms-result-row">
              <span className="r-ch">Chapter {r.number}</span>
              <span className={`r-status ${r.status === "done" ? "r-done" : r.status === "error" ? "r-error" : "r-skip"}`}>
                {r.status === "done" ? "✓ Written" : r.status === "skipped" ? "— Skipped" : "✗ Error"}
              </span>
              {r.reason && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{r.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="cms-chapter-controls">
        <button
          className="cms-btn cms-btn-primary"
          onClick={handleCompileAll}
          disabled={compiling || recordingWithSegs.length === 0}
        >
          {compiling
            ? <><div className="cms-spinner" style={{ width: 12, height: 12 }} /> Compiling…</>
            : `✦ Compile All (${recordingWithSegs.length} pending)`}
        </button>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>
          {doneCount}/{chapters.length} complete
        </span>
      </div>

      {loading ? (
        <div className="cms-loading"><div className="cms-spinner" /> Loading chapters…</div>
      ) : chapters.length === 0 ? (
        <div className="cms-empty">No chapters in this book.</div>
      ) : (
        <div className="cms-chapter-grid">
          {chapters.map((ch, i) => (
            <div key={ch.id}>
              <AdminChapterCard
                chapter={ch}
                segments={segsMap[ch.id] ?? []}
                index={i}
                onUpdated={handleChapterUpdated}
                onViewManuscript={setViewMs}
              />
              {/* Recordings link */}
              {(segsMap[ch.id]?.length ?? 0) > 0 && (
                <button
                  onClick={() => setViewSegs(ch)}
                  style={{
                    marginTop: 6, width: "100%", background: "none",
                    border: "1px solid var(--border)", borderRadius: 7,
                    color: "var(--text-3)", fontSize: 11, padding: "5px",
                    cursor: "pointer",
                  }}
                >
                  🎙 View {segsMap[ch.id].length} recording{segsMap[ch.id].length !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manuscript panel */}
      {viewMs && viewMs.generated_text && (
        <ManuscriptPanel
          chapter={viewMs}
          onClose={() => setViewMs(null)}
          onChapterUpdated={handleChapterUpdated}
        />
      )}

      {/* Segments panel */}
      {viewSegs && (
        <ChapterSegmentsPanel
          chapter={viewSegs}
          onClose={() => setViewSegs(null)}
        />
      )}
    </>
  );
}
