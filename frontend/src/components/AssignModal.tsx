import { useState } from "react";
import { uploadAudio, type Chapter, type Segment } from "../api/client";

interface Props {
  blob: Blob;
  filename: string;
  chapters: Chapter[];
  segmentCounts: Record<number, number>;
  onAssigned: (chapterId: number, segment: Segment) => void;
  onCancel: () => void;
}

const SECTION_ICONS: Record<string, string> = {
  "Dedication": "💌", "Epigraph": "💬", "Foreword": "✍", "Preface": "📝",
  "Author's Note": "🗒", "Acknowledgements": "🙏", "A Note on Sources": "📚",
  "About the Author": "👤", "Prologue": "🌅", "Epilogue": "🌇",
};

let chapterCounter = 0;

export default function AssignModal({ blob, filename, chapters, segmentCounts, onAssigned, onCancel }: Props) {
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(chapterId: number) {
    setUploading(chapterId);
    setError(null);
    try {
      const file = new File([blob], filename, { type: blob.type || "audio/webm" });
      const seg = await uploadAudio(chapterId, file);
      onAssigned(chapterId, seg);
    } catch (e) {
      setError(String(e));
      setUploading(null);
    }
  }

  const targetChapter = chapters.find((c) => c.id === uploading);
  const uploadingLabel = targetChapter
    ? targetChapter.section_type === "chapter"
      ? `Chapter ${targetChapter.number}`
      : (targetChapter.title ?? `Section ${targetChapter.number}`)
    : "…";

  const frontMatter  = chapters.filter((c) => c.section_type === "front_matter");
  const mainChapters = chapters.filter((c) => c.section_type === "chapter");
  const backMatter   = chapters.filter((c) => c.section_type === "back_matter");

  // Build a display number map for chapters only (1-based, excluding prologue/epilogue)
  const chapterDisplayNum: Record<number, number> = {};
  chapterCounter = 0;
  for (const ch of mainChapters) {
    if (ch.title !== "Prologue" && ch.title !== "Epilogue") {
      chapterDisplayNum[ch.id] = ++chapterCounter;
    }
  }

  function renderGroup(group: Chapter[], label: string) {
    if (group.length === 0) return null;
    return (
      <div className="assign-group">
        <div className="assign-group-label">{label}</div>
        <div className="assign-grid">
          {group.map((ch) => {
            const locked = ch.status !== "recording";
            const n = segmentCounts[ch.id] ?? 0;
            const isChapter = ch.section_type === "chapter";
            const dispNum = isChapter ? chapterDisplayNum[ch.id] : null;

            return (
              <button
                key={ch.id}
                className="assign-ch"
                onClick={() => !locked && assign(ch.id)}
                disabled={locked}
              >
                {dispNum != null ? (
                  <div className="assign-ch-n">{dispNum}</div>
                ) : (
                  <div className="assign-ch-icon">
                    {SECTION_ICONS[ch.title ?? ""] ?? "📄"}
                  </div>
                )}
                <div className="assign-ch-name">{ch.title || `Chapter ${ch.number}`}</div>
                <div className="assign-ch-s">
                  {locked ? (
                    <span style={{ color: ch.status === "done" ? "var(--green)" : "var(--amber)" }}>
                      {ch.status === "done" ? "✓ done" : "writing…"}
                    </span>
                  ) : `${n} seg${n !== 1 ? "s" : ""}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="assign-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onCancel(); }}
    >
      <div className="assign-box">
        <div className="assign-head">
          <div>
            <div className="assign-title">Which section?</div>
            <div className="assign-sub">
              Assign this recording to a section. It will be processed automatically.
            </div>
          </div>
          {!uploading && (
            <button className="assign-close" onClick={onCancel}>×</button>
          )}
        </div>

        {uploading ? (
          <div className="assign-uploading">
            <div className="spinner" />
            <span>Processing your recording for {uploadingLabel}…</span>
          </div>
        ) : (
          <div className="assign-groups">
            {renderGroup(frontMatter, "Front Matter")}
            {renderGroup(mainChapters, "Chapters")}
            {renderGroup(backMatter, "Back Matter")}
          </div>
        )}

        {error && (
          <div className="error-bar">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
      </div>
    </div>
  );
}
