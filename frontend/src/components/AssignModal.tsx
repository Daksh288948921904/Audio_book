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

  return (
    <div
      className="assign-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onCancel(); }}
    >
      <div className="assign-box">
        <div className="assign-head">
          <div>
            <div className="assign-title">Which chapter?</div>
            <div className="assign-sub">
              Assign this recording to a chapter. It will be processed automatically.
            </div>
          </div>
          {!uploading && (
            <button className="assign-close" onClick={onCancel}>×</button>
          )}
        </div>

        {uploading ? (
          <div className="assign-uploading">
            <div className="spinner" />
            <span>
              Processing your recording for Chapter {targetChapter?.number}…
            </span>
          </div>
        ) : (
          <div className="assign-grid">
            {chapters.map((ch) => {
              const locked = ch.status !== "recording";
              const n = segmentCounts[ch.id] ?? 0;
              return (
                <button
                  key={ch.id}
                  className="assign-ch"
                  onClick={() => !locked && assign(ch.id)}
                  disabled={locked}
                >
                  <div className="assign-ch-n">{ch.number}</div>
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
