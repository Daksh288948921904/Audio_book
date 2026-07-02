import { useEffect, useRef, useState } from "react";
import {
  cmsListChapters, cmsGetSegments, cmsCompileBook, cmsUpdateChapterText, cmsDownloadPdf,
  cmsFetchAudioBlob, cmsReorderSegments, cmsMoveSegment,
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

  const heading = chapter.section_type !== "chapter"
    ? (chapter.title ?? `Section ${chapter.number}`)
    : chapter.title
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
function SegmentRow({
  seg, draggable: canDrag, isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd, onMove,
}: {
  seg: CmsSegment;
  draggable?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onMove?: (id: number) => void;
}) {
  const [src, setSrc]         = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState(false);

  async function loadAudio() {
    if (src || !seg.has_audio || loading) return;
    setLoading(true);
    setLoadErr(false);
    const url = await cmsFetchAudioBlob(seg.id);
    if (url) { setSrc(url); } else { setLoadErr(true); }
    setLoading(false);
  }

  return (
    <div
      className={`cms-seg${isDragging ? " cms-seg-dragging" : ""}${isDragOver ? " cms-seg-drag-over" : ""}`}
      onClick={loadAudio}
    >
      <div className="cms-seg-head">
        {canDrag && (
          <div
            className="cms-seg-drag-handle"
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onClick={e => e.stopPropagation()}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
              <circle cx="3" cy="7"   r="1.2"/><circle cx="7" cy="7"   r="1.2"/>
              <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
            </svg>
          </div>
        )}
        <span className="cms-seg-idx">#{seg.order_index}</span>
        {seg.intent && <span className="cms-intent-badge">{seg.intent}</span>}
        {onMove && (
          <button
            className="cms-seg-move-btn"
            onClick={e => { e.stopPropagation(); onMove(seg.id); }}
            title="Move to another section"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 6h8M7 3l3 3-3 3"/>
            </svg>
          </button>
        )}
      </div>
      {seg.transcript && <div className="cms-seg-text">{seg.transcript}</div>}

      {seg.has_audio ? (
        loading ? (
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>Loading audio…</div>
        ) : src ? (
          <audio src={src} controls />
        ) : loadErr ? (
          <div style={{ fontSize: 11, color: "#fb923c", marginTop: 6 }}>
            Audio unavailable — file may have been cleared on server restart.
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>▶ Tap to load audio</div>
        )
      ) : (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, fontStyle: "italic" }}>
          No audio file (cleared after server restart)
        </div>
      )}
    </div>
  );
}

// ── Chapter detail side panel (segments view) ──────────────────────────────────
function ChapterSegmentsPanel({
  chapter, allChapters, onClose,
}: {
  chapter: CmsChapter;
  allChapters: CmsChapter[];
  onClose: () => void;
}) {
  const [segs, setSegs]       = useState<CmsSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const dragIdx     = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [movingSegId, setMovingSegId]   = useState<number | null>(null);
  const [movingToId,  setMovingToId]    = useState<number | null>(null);

  useEffect(() => {
    cmsGetSegments(chapter.id)
      .then(setSegs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [chapter.id]);

  const canReorder = chapter.status === "recording";
  const moveTargets = allChapters.filter(c => c.id !== chapter.id && c.status === "recording");

  async function handleMove(targetChapterId: number) {
    if (!movingSegId) return;
    setMovingToId(targetChapterId);
    try {
      await cmsMoveSegment(movingSegId, targetChapterId);
      setSegs(prev => prev.filter(s => s.id !== movingSegId));
    } catch (e) { setError(String(e)); }
    finally { setMovingSegId(null); setMovingToId(null); }
  }

  function handleDragStart(idx: number, id: number) {
    dragIdx.current = idx; setDraggingId(id);
  }
  function handleDragOver(e: React.DragEvent, idx: number, id: number) {
    e.preventDefault(); dragOverIdx.current = idx; setDragOverId(id);
  }
  function handleDrop() {
    const from = dragIdx.current; const to = dragOverIdx.current;
    if (from === null || to === null || from === to) {
      setDraggingId(null); setDragOverId(null); return;
    }
    const next = [...segs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reindexed = next.map((s, i) => ({ ...s, order_index: i + 1 }));
    setSegs(reindexed);
    setDraggingId(null); setDragOverId(null);
    dragIdx.current = null; dragOverIdx.current = null;
    cmsReorderSegments(chapter.id, reindexed.map(s => s.id))
      .catch(() => { setSegs(segs); setError("Reorder failed — reverted."); });
  }
  function handleDragEnd() {
    setDraggingId(null); setDragOverId(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }

  const heading = chapter.section_type !== "chapter"
    ? (chapter.title ?? `Section ${chapter.number}`)
    : chapter.title
      ? `Chapter ${chapter.number}: ${chapter.title}`
      : `Chapter ${chapter.number}`;

  return (
    <div className="cms-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cms-ms-panel">
        <div className="cms-ms-head">
          <h2>{heading} — Recordings {canReorder && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· drag to reorder</span>}</h2>
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
              {segs.map((s, i) => (
                <SegmentRow
                  key={s.id} seg={s}
                  draggable={canReorder}
                  isDragging={draggingId === s.id}
                  isDragOver={dragOverId === s.id}
                  onDragStart={() => handleDragStart(i, s.id)}
                  onDragOver={(e) => handleDragOver(e, i, s.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onMove={canReorder && moveTargets.length > 0 ? setMovingSegId : undefined}
                />
              ))}
            </div>
          )}

          {/* Move picker */}
          {movingSegId && (
            <div className="cms-move-overlay" onClick={() => setMovingSegId(null)}>
              <div className="cms-move-picker" onClick={e => e.stopPropagation()}>
                <div className="cms-move-title">Move to section</div>
                <div className="cms-move-list">
                  {moveTargets.map(t => (
                    <button
                      key={t.id}
                      className="cms-move-item"
                      disabled={movingToId === t.id}
                      onClick={() => handleMove(t.id)}
                    >
                      {movingToId === t.id
                        ? <div className="cms-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                        : "→"}
                      <span>{t.title || `Chapter ${t.number}`}</span>
                    </button>
                  ))}
                </div>
                <button className="cms-move-cancel" onClick={() => setMovingSegId(null)}>Cancel</button>
              </div>
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

  const frontMatter  = chapters.filter((c) => c.section_type === "front_matter");
  const mainChapters = chapters.filter((c) => c.section_type === "chapter");
  const backMatter   = chapters.filter((c) => c.section_type === "back_matter");

  const doneCount = chapters.filter((c) => c.status === "done").length;
  const recordingWithSegs = chapters.filter(
    (c) => c.status === "recording" && (segsMap[c.id]?.length ?? 0) > 0
  );
  const totalSegs = Object.values(segsMap).reduce((a, v) => a + v.length, 0);

  return (
    <>
      <div className="cms-section-head">
        <div>
          <div className="cms-section-title">
            {book.title}
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.5px", padding: "2px 7px", borderRadius: 5,
              background: book.genre === "memoir" ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.12)",
              color: book.genre === "memoir" ? "#a78bfa" : "#93c5fd",
              verticalAlign: "middle",
            }}>
              {book.genre === "memoir" ? "Memoir" : "Fiction"}
            </span>
          </div>
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
        <>
          {frontMatter.length > 0 && (
            <>
              <div className="cms-group-label">Front Matter</div>
              <div className="cms-chapter-grid">
                {frontMatter.map((ch, i) => (
                  <div key={ch.id}>
                    <AdminChapterCard chapter={ch} segments={segsMap[ch.id] ?? []} index={i}
                      onUpdated={handleChapterUpdated} onViewManuscript={setViewMs} />
                    {(segsMap[ch.id]?.length ?? 0) > 0 && (
                      <button onClick={() => setViewSegs(ch)} className="cms-segs-link">
                        🎙 View {segsMap[ch.id].length} recording{segsMap[ch.id].length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {mainChapters.length > 0 && (
            <>
              <div className="cms-group-label">Chapters</div>
              <div className="cms-chapter-grid">
                {mainChapters.map((ch, i) => (
                  <div key={ch.id}>
                    <AdminChapterCard chapter={ch} segments={segsMap[ch.id] ?? []} index={i}
                      onUpdated={handleChapterUpdated} onViewManuscript={setViewMs} />
                    {(segsMap[ch.id]?.length ?? 0) > 0 && (
                      <button onClick={() => setViewSegs(ch)} className="cms-segs-link">
                        🎙 View {segsMap[ch.id].length} recording{segsMap[ch.id].length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {backMatter.length > 0 && (
            <>
              <div className="cms-group-label">Back Matter</div>
              <div className="cms-chapter-grid">
                {backMatter.map((ch, i) => (
                  <div key={ch.id}>
                    <AdminChapterCard chapter={ch} segments={segsMap[ch.id] ?? []} index={i}
                      onUpdated={handleChapterUpdated} onViewManuscript={setViewMs} />
                    {(segsMap[ch.id]?.length ?? 0) > 0 && (
                      <button onClick={() => setViewSegs(ch)} className="cms-segs-link">
                        🎙 View {segsMap[ch.id].length} recording{segsMap[ch.id].length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
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
          allChapters={chapters}
          onClose={() => setViewSegs(null)}
        />
      )}
    </>
  );
}
