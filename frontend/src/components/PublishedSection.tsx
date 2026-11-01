import { useState } from "react";
import type { Chapter } from "../api/client";
import ShareToAI from "./ShareToAI";

interface Props {
  chapters: Chapter[];                        // published ones, in book order
  labelFor: (ch: Chapter) => string;
  bookTitle: string;
}

// Chapters the CMS has sent to the author, each shareable to an AI chat app.
export default function PublishedSection({ chapters, labelFor, bookTitle }: Props) {
  const [sharing, setSharing] = useState<Chapter | null>(null);
  if (chapters.length === 0) return null;

  return (
    <div className="pub-section">
      <div className="pub-head">
        <div className="pub-title">📤 Published chapters</div>
        <div className="pub-sub">Sent to you by our editors — share any of them with your AI assistant.</div>
      </div>
      <div className="pub-list">
        {chapters.map((ch) => (
          <div key={ch.id} className="pub-row">
            <div className="pub-row-text">
              <div className="pub-row-title">{labelFor(ch)}</div>
              {ch.published_at && (
                <div className="pub-row-date">Sent {new Date(ch.published_at).toLocaleDateString()}</div>
              )}
            </div>
            <button className="ch-rec-upload" onClick={() => setSharing(ch)}>🤖 Share to AI</button>
          </div>
        ))}
      </div>
      {sharing && (
        <ShareToAI chapterId={sharing.id} label={labelFor(sharing)} bookTitle={bookTitle} onClose={() => setSharing(null)} />
      )}
    </div>
  );
}
