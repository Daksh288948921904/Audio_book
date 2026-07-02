import { useEffect, useRef, useState } from "react";
import type { Segment } from "../api/client";
import { fetchAudioBlob } from "../api/client";

interface Props {
  segment: Segment;
  onDelete: (id: number) => void;
  deleting: boolean;
  onMove?: (id: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  isDragOver?: boolean;
}

const INTENT: Record<string, { color: string; bg: string }> = {
  funny:           { color: "#FBBF24", bg: "rgba(251,191,36,0.12)"  },
  humorous:        { color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  witty:           { color: "#FCD34D", bg: "rgba(252,211,77,0.10)"  },
  sarcastic:       { color: "#FB923C", bg: "rgba(251,146,60,0.12)"  },
  playful:         { color: "#34D399", bg: "rgba(52,211,153,0.10)"  },
  absurd:          { color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  serious:         { color: "#7AADFF", bg: "rgba(122,173,255,0.12)" },
  solemn:          { color: "#94A3B8", bg: "rgba(148,163,184,0.10)" },
  melancholic:     { color: "#93C5FD", bg: "rgba(147,197,253,0.10)" },
  tragic:          { color: "#64748B", bg: "rgba(100,116,139,0.12)" },
  dark:            { color: "#9CA3AF", bg: "rgba(156,163,175,0.08)" },
  grim:            { color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  dramatic:        { color: "#C084FC", bg: "rgba(192,132,252,0.12)" },
  tense:           { color: "#F87171", bg: "rgba(248,113,113,0.12)" },
  suspenseful:     { color: "#E879F9", bg: "rgba(232,121,249,0.12)" },
  thrilling:       { color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
  confrontational: { color: "#DC2626", bg: "rgba(220,38,38,0.08)"   },
  urgent:          { color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  action:          { color: "#10B981", bg: "rgba(16,185,129,0.10)"  },
  adventurous:     { color: "#059669", bg: "rgba(5,150,105,0.10)"   },
  heroic:          { color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  triumphant:      { color: "#FDE047", bg: "rgba(253,224,71,0.10)"  },
  emotional:       { color: "#F472B6", bg: "rgba(244,114,182,0.12)" },
  romantic:        { color: "#FB7185", bg: "rgba(251,113,133,0.12)" },
  nostalgic:       { color: "#A5B4FC", bg: "rgba(165,180,252,0.10)" },
  hopeful:         { color: "#6EE7B7", bg: "rgba(110,231,183,0.10)" },
  heartwarming:    { color: "#FCA5A5", bg: "rgba(252,165,165,0.10)" },
  vulnerable:      { color: "#C4B5FD", bg: "rgba(196,181,253,0.10)" },
  informational:   { color: "#4F8EF7", bg: "rgba(79,142,247,0.10)"  },
  reflective:      { color: "#7DD3FC", bg: "rgba(125,211,252,0.10)" },
  philosophical:   { color: "#8B5CF6", bg: "rgba(139,92,246,0.10)"  },
  mysterious:      { color: "#7C3AED", bg: "rgba(124,58,237,0.10)"  },
  ominous:         { color: "#6D28D9", bg: "rgba(109,40,217,0.12)"  },
};
const DEF = { color: "#5C5C80", bg: "rgba(92,92,128,0.08)" };

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function CustomAudioPlayer({ blobUrl, accentColor }: { blobUrl: string; accentColor: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]       = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]     = useState(0);

  useEffect(() => {
    // autoplay once blob is ready
    audioRef.current?.play().then(() => setPlaying(true)).catch(() => {});
  }, [blobUrl]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="cap-player">
      <audio
        ref={audioRef}
        src={blobUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <button
        className="cap-play"
        onClick={toggle}
        style={{ "--cap-color": accentColor } as React.CSSProperties}
      >
        {playing ? (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <rect x="0" y="0" width="3.5" height="12" rx="1.5"/>
            <rect x="6.5" y="0" width="3.5" height="12" rx="1.5"/>
          </svg>
        ) : (
          <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
            <path d="M0 0L11 6.5L0 13V0Z"/>
          </svg>
        )}
      </button>

      <div className="cap-track">
        <input
          type="range"
          className="cap-range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={seek}
          style={{ "--cap-pct": `${pct}%`, "--cap-color": accentColor } as React.CSSProperties}
        />
      </div>

      <span className="cap-time">{fmt(currentTime)} / {fmt(duration)}</span>
    </div>
  );
}

function AudioPlayerLoader({ segmentId, accentColor }: { segmentId: number; accentColor: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [expired,  setExpired]  = useState(false);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function load() {
    setLoading(true);
    const url = await fetchAudioBlob(segmentId);
    setLoading(false);
    if (!url) { setExpired(true); return; }
    setBlobUrl(url);
  }

  if (expired) return <span className="cap-expired">Audio expired</span>;

  if (!blobUrl) {
    return (
      <button
        className="cap-load-btn"
        onClick={load}
        disabled={loading}
        style={{ "--cap-color": accentColor } as React.CSSProperties}
      >
        {loading ? (
          <div className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5, borderTopColor: accentColor }} />
        ) : (
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
            <path d="M0 0L8 5L0 10V0Z"/>
          </svg>
        )}
        {loading ? "Loading…" : "Play recording"}
      </button>
    );
  }

  return <CustomAudioPlayer blobUrl={blobUrl} accentColor={accentColor} />;
}

export default function SegmentCard({ segment, onDelete, deleting, onMove, dragHandleProps, isDragging, isDragOver }: Props) {
  const s = INTENT[segment.intent?.toLowerCase()] ?? DEF;

  return (
    <div
      className={`seg${isDragging ? " seg-dragging" : ""}${isDragOver ? " seg-drag-over" : ""}`}
      style={{
        opacity: deleting ? 0.35 : 1,
        transition: "opacity .2s",
        pointerEvents: deleting ? "none" : undefined,
      }}
    >
      {/* Header row */}
      <div className="seg-header">
        {/* Drag handle */}
        <div className="seg-drag-handle" {...dragHandleProps} title="Drag to reorder">
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
            <circle cx="3" cy="7"   r="1.2"/><circle cx="7" cy="7"   r="1.2"/>
            <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
          </svg>
        </div>
        <div className="seg-num">{segment.order_index}</div>
        <div
          className="seg-badge"
          style={{ background: s.bg, color: s.color, borderColor: `${s.color}28` }}
        >
          {segment.intent || "unknown"}
        </div>
        {onMove && (
          <button className="seg-move" onClick={() => onMove(segment.id)} title="Move to another section">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 6h8M7 3l3 3-3 3"/>
            </svg>
          </button>
        )}
        <button
          className="seg-del"
          onClick={() => !deleting && onDelete(segment.id)}
          disabled={deleting}
          title="Delete recording"
        >
          <svg width="12" height="13" viewBox="0 0 12 13" fill="currentColor">
            <path d="M1 3h10M4 3V2h4v1M2 3l.7 8.5a1 1 0 001 .9h4.6a1 1 0 001-.9L10 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Audio player */}
      {segment.has_audio && (
        <AudioPlayerLoader segmentId={segment.id} accentColor={s.color} />
      )}

      {/* Transcript */}
      <div className="seg-text">
        {segment.transcript || <em style={{ color: "var(--text-3)" }}>No transcript</em>}
      </div>
    </div>
  );
}
