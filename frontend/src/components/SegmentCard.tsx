import { useEffect, useState } from "react";
import type { Segment } from "../api/client";
import { fetchAudioBlob } from "../api/client";

interface Props {
  segment: Segment;
  onDelete: (id: number) => void;
  deleting: boolean;
}

const INTENT: Record<string, { color: string; bg: string }> = {
  funny:           { color: "#FBBF24", bg: "rgba(251,191,36,0.1)"  },
  humorous:        { color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  witty:           { color: "#FCD34D", bg: "rgba(252,211,77,0.08)" },
  sarcastic:       { color: "#FB923C", bg: "rgba(251,146,60,0.1)"  },
  playful:         { color: "#34D399", bg: "rgba(52,211,153,0.08)" },
  absurd:          { color: "#A78BFA", bg: "rgba(167,139,250,0.1)" },
  serious:         { color: "#7AADFF", bg: "rgba(122,173,255,0.1)" },
  solemn:          { color: "#94A3B8", bg: "rgba(148,163,184,0.08)"},
  melancholic:     { color: "#93C5FD", bg: "rgba(147,197,253,0.08)"},
  tragic:          { color: "#64748B", bg: "rgba(100,116,139,0.1)" },
  dark:            { color: "#9CA3AF", bg: "rgba(156,163,175,0.06)"},
  grim:            { color: "#6B7280", bg: "rgba(107,114,128,0.08)"},
  dramatic:        { color: "#C084FC", bg: "rgba(192,132,252,0.1)" },
  tense:           { color: "#F87171", bg: "rgba(248,113,113,0.1)" },
  suspenseful:     { color: "#E879F9", bg: "rgba(232,121,249,0.1)" },
  thrilling:       { color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
  confrontational: { color: "#DC2626", bg: "rgba(220,38,38,0.06)"  },
  urgent:          { color: "#F97316", bg: "rgba(249,115,22,0.1)"  },
  action:          { color: "#10B981", bg: "rgba(16,185,129,0.08)" },
  adventurous:     { color: "#059669", bg: "rgba(5,150,105,0.08)"  },
  heroic:          { color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  triumphant:      { color: "#FDE047", bg: "rgba(253,224,71,0.08)" },
  emotional:       { color: "#F472B6", bg: "rgba(244,114,182,0.1)" },
  romantic:        { color: "#FB7185", bg: "rgba(251,113,133,0.1)" },
  nostalgic:       { color: "#A5B4FC", bg: "rgba(165,180,252,0.08)"},
  hopeful:         { color: "#6EE7B7", bg: "rgba(110,231,183,0.08)"},
  heartwarming:    { color: "#FCA5A5", bg: "rgba(252,165,165,0.08)"},
  vulnerable:      { color: "#C4B5FD", bg: "rgba(196,181,253,0.08)"},
  informational:   { color: "#4F8EF7", bg: "rgba(79,142,247,0.08)" },
  reflective:      { color: "#7DD3FC", bg: "rgba(125,211,252,0.08)"},
  philosophical:   { color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
  mysterious:      { color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
  ominous:         { color: "#6D28D9", bg: "rgba(109,40,217,0.1)"  },
};
const DEF = { color: "#5C5C80", bg: "rgba(92,92,128,0.06)" };

function AudioPlayer({ segmentId }: { segmentId: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  async function load() {
    setLoading(true);
    const url = await fetchAudioBlob(segmentId);
    setLoading(false);
    if (!url) { setExpired(true); return; }
    setBlobUrl(url);
  }

  if (expired) {
    return <span className="audio-expired">Audio expired</span>;
  }

  if (!blobUrl) {
    return (
      <button className="audio-load-btn" onClick={load} disabled={loading}>
        {loading
          ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
          : <span>▶</span>}
        {loading ? "Loading…" : "Play"}
      </button>
    );
  }

  return <audio className="audio-player" src={blobUrl} controls autoPlay />;
}

export default function SegmentCard({ segment, onDelete, deleting }: Props) {
  const s = INTENT[segment.intent?.toLowerCase()] ?? DEF;
  return (
    <div
      className="seg"
      style={{
        "--seg-color": s.color,
        opacity: deleting ? 0.35 : 1,
        transition: "opacity .2s",
        pointerEvents: deleting ? "none" : undefined,
      } as React.CSSProperties}
    >
      <div className="seg-idx">{segment.order_index}</div>
      <div className="seg-body">
        <div className="seg-top">
          <div className="seg-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}22` }}>
            {segment.intent || "unknown"}
          </div>
          {segment.has_audio && <AudioPlayer segmentId={segment.id} />}
        </div>
        <div className="seg-text">
          {segment.transcript || <em style={{ color: "var(--text-3)" }}>No transcript</em>}
        </div>
      </div>
      <button className="seg-del" onClick={() => !deleting && onDelete(segment.id)} disabled={deleting}>
        🗑
      </button>
    </div>
  );
}
