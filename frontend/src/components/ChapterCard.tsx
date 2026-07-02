import { useRef, useState } from "react";
import {
  deleteChapter, reopenChapter,
  updateChapterTitle, deleteSegment,
  reorderSegments, moveSegment,
  pdfUrl, getChapter, type Chapter, type Segment,
} from "../api/client";
import SegmentCard from "./SegmentCard";

const GRADIENTS = [
  "linear-gradient(145deg, #0f1f3d 0%, #1a3a6b 55%, #2a4f8f 100%)",
  "linear-gradient(145deg, #1a0d2e 0%, #3d1a6e 55%, #5a2d9e 100%)",
  "linear-gradient(145deg, #062520 0%, #0d4a3f 55%, #1a7060 100%)",
  "linear-gradient(145deg, #2a0612 0%, #5c0e24 55%, #8a1c3c 100%)",
  "linear-gradient(145deg, #1f1000 0%, #4a2a00 55%, #7a4a0a 100%)",
  "linear-gradient(145deg, #0d0d1f 0%, #1c1c3d 55%, #2c2c6a 100%)",
  "linear-gradient(145deg, #0a1a0a 0%, #1a3a1a 55%, #2d5c2d 100%)",
  "linear-gradient(145deg, #1a1010 0%, #3d1f1f 55%, #6a2828 100%)",
];

const SECTION_ICONS: Record<string, string> = {
  "Dedication": "💌", "Epigraph": "💬", "Foreword": "✍", "Preface": "📝",
  "Author's Note": "🗒", "Acknowledgements": "🙏", "A Note on Sources": "📚",
  "About the Author": "👤",
};

interface Props {
  chapter: Chapter;
  segments: Segment[];
  allChapters: Chapter[];
  index: number;
  displayNum: number | null;
  onChapterUpdated: (ch: Chapter) => void;
  onChapterDeleted: (id: number) => void;
  onSegmentDeleted: (chapterId: number, segId: number) => void;
  onSegmentMoved: (segId: number, fromChapterId: number, toChapterId: number) => void;
  onViewManuscript: (ch: Chapter) => void;
}

export default function ChapterCard({
  chapter, segments, allChapters, index, displayNum,
  onChapterUpdated, onChapterDeleted, onSegmentDeleted, onSegmentMoved, onViewManuscript,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [deletingSegs, setDeletingSegs] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop reorder
  const [localSegs, setLocalSegs] = useState<Segment[]>(segments);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Sync local order when segments prop changes (new upload, delete, etc.)
  if (localSegs.length !== segments.length ||
      localSegs.some((s, i) => s.id !== segments[i]?.id && !localSegs.find(x => x.id === segments[i]?.id))) {
    setLocalSegs(segments);
  }

  function handleDragStart(idx: number, segId: number) {
    dragIdx.current = idx;
    setDraggingId(segId);
  }

  function handleDragOver(e: React.DragEvent, idx: number, segId: number) {
    e.preventDefault();
    dragOverIdx.current = idx;
    setDragOverId(segId);
  }

  function handleDrop() {
    const from = dragIdx.current;
    const to   = dragOverIdx.current;
    if (from === null || to === null || from === to) {
      setDraggingId(null); setDragOverId(null); return;
    }
    const next = [...localSegs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reindexed = next.map((s, i) => ({ ...s, order_index: i + 1 }));
    setLocalSegs(reindexed);
    setDraggingId(null); setDragOverId(null);
    dragIdx.current = null; dragOverIdx.current = null;
    reorderSegments(chapter.id, reindexed.map(s => s.id))
      .catch(() => { setLocalSegs(segments); setError("Reorder failed — reverted."); });
  }

  function handleDragEnd() {
    setDraggingId(null); setDragOverId(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }

  // Move segment to another chapter
  const [movingSegId, setMovingSegId] = useState<number | null>(null);
  const [movingToId, setMovingToId]   = useState<number | null>(null);

  async function handleMove(targetChapterId: number) {
    if (!movingSegId) return;
    setMovingToId(targetChapterId);
    try {
      await moveSegment(movingSegId, targetChapterId);
      onSegmentMoved(movingSegId, chapter.id, targetChapterId);
    } catch (e) { setError(String(e)); }
    finally { setMovingSegId(null); setMovingToId(null); }
  }

  const moveTargets = allChapters.filter(
    c => c.id !== chapter.id && c.status === "recording"
  );

  const isGenerating = chapter.status === "generating";
  const gradient = GRADIENTS[index % GRADIENTS.length];
  const statusLabel = isGenerating ? "Writing" : chapter.status === "done" ? "Complete" : "Recording";

  async function handleDelete() {
    if (!window.confirm(`Delete "${chapter.title || `Chapter ${chapter.number}`}"? Cannot be undone.`)) return;
    try {
      await deleteChapter(chapter.id);
      onChapterDeleted(chapter.id);
      setOpen(false);
    } catch (e) { setError(String(e)); }
  }

  async function handleReopen() {
    try {
      await reopenChapter(chapter.id);
      onChapterUpdated({ ...chapter, status: "recording", generated_text: undefined, summary: undefined });
    } catch (e) { setError(String(e)); }
  }

  function startEdit() {
    setTitleDraft(chapter.title ?? "");
    setEditTitle(true);
    setTimeout(() => titleRef.current?.focus(), 20);
  }

  async function saveTitle() {
    if (titleDraft.trim()) {
      try {
        await updateChapterTitle(chapter.id, titleDraft.trim());
        onChapterUpdated({ ...chapter, title: titleDraft.trim() });
      } catch (e) { setError(String(e)); }
    }
    setEditTitle(false);
  }

  async function handleDelSeg(segId: number) {
    setDeletingSegs((s) => new Set(s).add(segId));
    try { await deleteSegment(segId); onSegmentDeleted(chapter.id, segId); }
    catch (e) { setError(String(e)); }
    finally { setDeletingSegs((s) => { const n = new Set(s); n.delete(segId); return n; }); }
  }

  function downloadPdf(e: React.MouseEvent) {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = pdfUrl(chapter.id);
    a.download = `chapter_${chapter.number}.pdf`;
    a.click();
  }

  async function openAndView() {
    const full = await getChapter(chapter.id);
    onViewManuscript(full);
  }

  return (
    <>
      {/* ── Grid card face ── */}
      <div
        className={`cc cc-${chapter.status}`}
        style={{ background: gradient, animationDelay: `${index * 60}ms` }}
        onClick={() => setOpen(true)}
      >
        <div className={`cc-badge cc-badge-${chapter.status}`}>
          {chapter.status === "recording" && <span className="pip-rec" />}
          {chapter.status === "generating" && <span className="pip-gen" />}
          {chapter.status === "done" && <span className="pip-done" />}
          {statusLabel}
        </div>

        {chapter.section_type !== "chapter" ? (
          <div className="cc-section-icon">{SECTION_ICONS[chapter.title ?? ""] ?? "📄"}</div>
        ) : displayNum !== null ? (
          <div className="cc-big-num">{String(displayNum).padStart(2, "0")}</div>
        ) : null}

        {chapter.status === "done" && chapter.generated_text && (
          <div className="cc-card-excerpt">
            {chapter.generated_text.replace(/\n+/g, " ").slice(0, 110)}…
          </div>
        )}

        <div className="cc-foot">
          <div className="cc-foot-title">
            {chapter.title || `Chapter ${chapter.number}`}
          </div>
          <div className="cc-foot-meta">
            {segments.length} recording{segments.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* ── Detail modal ── */}
      {open && (
        <div className="cc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="cc-modal">
            <div className="cc-modal-head" style={{ background: gradient }}>
              {chapter.section_type !== "chapter" ? (
                <div className="cc-section-icon" style={{ fontSize: 28, margin: "0 12px 0 0" }}>
                  {SECTION_ICONS[chapter.title ?? ""] ?? "📄"}
                </div>
              ) : (
                <div className="cc-modal-num">
                  {displayNum !== null ? String(displayNum).padStart(2, "0") : String(chapter.number).padStart(2, "0")}
                </div>
              )}
              <div className="cc-modal-head-info">
                {chapter.section_type === "chapter" && editTitle ? (
                  <input
                    ref={titleRef}
                    className="cc-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditTitle(false); }}
                    onBlur={saveTitle}
                  />
                ) : (
                  <div
                    className="cc-modal-title"
                    onDoubleClick={chapter.section_type === "chapter" && chapter.status === "recording" ? startEdit : undefined}
                    title={chapter.section_type === "chapter" && chapter.status === "recording" ? "Double-click to rename" : undefined}
                  >
                    {chapter.title || (chapter.section_type === "chapter" ? `Chapter ${displayNum ?? chapter.number}` : `Section ${chapter.number}`)}
                  </div>
                )}
                <div className={`cc-badge cc-badge-${chapter.status}`} style={{ marginTop: 6, width: "fit-content" }}>
                  {chapter.status === "recording" && <span className="pip-rec" />}
                  {chapter.status === "generating" && <span className="pip-gen" />}
                  {chapter.status === "done" && <span className="pip-done" />}
                  {statusLabel}
                </div>
              </div>
              <button className="cc-modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="cc-modal-body">
              {error && (
                <div className="error-bar">
                  {error}<button onClick={() => setError(null)}>×</button>
                </div>
              )}

              {isGenerating && (
                <div className="cc-generating">
                  <div className="spinner" style={{ borderTopColor: "var(--amber)" }} />
                  Writing your chapter… this usually takes 20–60 seconds.
                </div>
              )}

              {chapter.status === "done" && chapter.generated_text && !isGenerating && (
                <div className="cc-excerpt">
                  {chapter.generated_text.replace(/\n+/g, " ").slice(0, 400)}…
                </div>
              )}

              {!isGenerating && localSegs.length > 0 && (
                <div className="cc-segs-list">
                  <div className="cc-segs-label">
                    {localSegs.length} Recording{localSegs.length !== 1 ? "s" : ""}
                    {chapter.status === "recording" && (
                      <span className="cc-segs-hint">· drag to reorder</span>
                    )}
                  </div>
                  {localSegs.map((seg, idx) => (
                    <SegmentCard
                      key={seg.id}
                      segment={seg}
                      onDelete={handleDelSeg}
                      deleting={deletingSegs.has(seg.id)}
                      onMove={chapter.status === "recording" && moveTargets.length > 0 ? setMovingSegId : undefined}
                      isDragging={draggingId === seg.id}
                      isDragOver={dragOverId === seg.id}
                      dragHandleProps={chapter.status === "recording" ? {
                        draggable: true,
                        onDragStart: () => handleDragStart(idx, seg.id),
                        onDragOver:  (e: React.DragEvent) => handleDragOver(e, idx, seg.id),
                        onDrop:      handleDrop,
                        onDragEnd:   handleDragEnd,
                      } : {}}
                    />
                  ))}
                </div>
              )}

              {/* Move picker overlay */}
              {movingSegId && (
                <div className="cc-move-overlay" onClick={() => setMovingSegId(null)}>
                  <div className="cc-move-picker" onClick={e => e.stopPropagation()}>
                    <div className="cc-move-title">Move to section</div>
                    {moveTargets.map(t => (
                      <button
                        key={t.id}
                        className="cc-move-item"
                        disabled={movingToId === t.id}
                        onClick={() => handleMove(t.id)}
                      >
                        {movingToId === t.id ? (
                          <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, borderTopColor: "var(--blue)", display: "inline-block" }} />
                        ) : "→"}
                        <span>{t.title || `Chapter ${t.number}`}</span>
                      </button>
                    ))}
                    <button className="cc-move-cancel" onClick={() => setMovingSegId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {!isGenerating && segments.length === 0 && chapter.status === "recording" && (
                <div className="cc-empty-segs">
                  No recordings yet — record above and assign this chapter.
                </div>
              )}

              {!isGenerating && (
                <div className="cc-actions">
                  {chapter.status === "done" && (
                    <>
                      <button className="cc-view" onClick={openAndView}>View Manuscript</button>
                      <button className="cc-pdf" onClick={downloadPdf}>↓ PDF</button>
                      <button className="cc-reopen" onClick={handleReopen}>← Re-record</button>
                    </>
                  )}
                  {chapter.status === "recording" && chapter.section_type === "chapter" && (
                    <button className="cc-rename" onClick={startEdit}>✏ Rename</button>
                  )}
                  <button className="cc-delete" onClick={handleDelete}>🗑</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
