import { useState } from "react";
import { cmsFinishChapter, cmsGetChapter, cmsDownloadPdf, type CmsChapter, type CmsSegment } from "../api/adminClient";

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

interface Props {
  chapter: CmsChapter;
  segments: CmsSegment[];
  index: number;
  onUpdated: (ch: CmsChapter) => void;
  onViewManuscript: (ch: CmsChapter) => void;
}

export default function AdminChapterCard({ chapter, segments, index, onUpdated, onViewManuscript }: Props) {
  const [writing, setWriting] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const isGenerating = writing || chapter.status === "generating";
  const gradient     = GRADIENTS[index % GRADIENTS.length];
  const statusLabel  = isGenerating ? "Writing" : chapter.status === "done" ? "Complete" : "Recording";

  async function handleWrite() {
    setWriting(true);
    setError(null);
    try {
      const r   = await cmsFinishChapter(chapter.id);
      const full = await cmsGetChapter(chapter.id);
      onUpdated({ ...full, generated_text: r.generated_text });
    } catch (e) { setError(String(e)); }
    finally { setWriting(false); }
  }

  async function handlePdf(e: React.MouseEvent) {
    e.stopPropagation();
    try { await cmsDownloadPdf(chapter.id, chapter.number); }
    catch (e) { setError(String(e)); }
  }

  return (
    <div className="adm-card" style={{ background: gradient }}>
      <div>
        <div className={`adm-badge adm-badge-${isGenerating ? "generating" : chapter.status}`}>
          {chapter.status === "recording" && !isGenerating && <span className="pip-rec" />}
          {isGenerating && <span className="pip-gen" />}
          {chapter.status === "done" && !isGenerating && <span className="pip-done" />}
          {statusLabel}
        </div>

        <div className="adm-num">{String(chapter.number).padStart(2, "0")}</div>
        <div className="adm-title">{chapter.title || `Chapter ${chapter.number}`}</div>
        <div className="adm-segs">{segments.length} recording{segments.length !== 1 ? "s" : ""}</div>

        {chapter.status === "done" && chapter.generated_text && (
          <div className="adm-excerpt">
            {chapter.generated_text.replace(/\n+/g, " ").slice(0, 90)}…
          </div>
        )}

        {isGenerating && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#fbbf24" }}>
            <div className="cms-spinner" style={{ borderTopColor: "#fbbf24", width: 12, height: 12, borderWidth: 1.5 }} />
            Writing… (20–60 s)
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: "#fb7185", marginTop: 6, lineHeight: 1.4 }}>
            {error}
          </div>
        )}
      </div>

      {!isGenerating && (
        <div className="adm-actions">
          {chapter.status === "recording" && segments.length > 0 && (
            <button className="adm-btn adm-btn-write" onClick={handleWrite} disabled={writing}>
              ✦ Write Chapter
            </button>
          )}
          {chapter.status === "done" && (
            <>
              <button className="adm-btn adm-btn-view" onClick={() => onViewManuscript(chapter)}>
                View Manuscript
              </button>
              <button className="adm-btn adm-btn-pdf" onClick={handlePdf}>
                ↓ PDF
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
