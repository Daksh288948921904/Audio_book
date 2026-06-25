import { useEffect, useRef, useState } from "react";
import { pdfUrl, updateChapterText, fetchChapterSpeech } from "../api/client";

interface Props {
  chapterId: number;
  chapterNumber: number;
  title: string | null;
  text: string;
  summary: string;
  onReopen: () => void;
  onClose?: () => void;
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function VoicePlayer({ chapterId }: { chapterId: number }) {
  const audioRef                   = useRef<HTMLAudioElement>(null);
  const [blobUrl, setBlobUrl]       = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [playing, setPlaying]       = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]     = useState(0);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function load() {
    setLoading(true);
    setError(null);
    const url = await fetchChapterSpeech(chapterId);
    setLoading(false);
    if (!url) { setError("Failed to generate audio. Try again."); return; }
    setBlobUrl(url);
  }

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

  function dismiss() {
    audioRef.current?.pause();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) return (
    <div className="vp-error">
      {error}
      <button onClick={() => setError(null)}>×</button>
    </div>
  );

  if (!blobUrl) return (
    <button className="btn-listen" onClick={load} disabled={loading}>
      {loading ? (
        <>
          <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5, borderTopColor: "#C084FC" }} />
          Generating audio…
        </>
      ) : (
        <>
          <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
            <path d="M0 0L11 6.5L0 13V0Z"/>
          </svg>
          Listen
        </>
      )}
    </button>
  );

  return (
    <div className="vp-player">
      <audio
        ref={audioRef}
        src={blobUrl}
        autoPlay
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />

      <button className="vp-pp" onClick={toggle}>
        {playing ? (
          <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor">
            <rect x="0" y="0" width="3" height="11" rx="1.2"/>
            <rect x="6" y="0" width="3" height="11" rx="1.2"/>
          </svg>
        ) : (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <path d="M0 0L10 6L0 12V0Z"/>
          </svg>
        )}
      </button>

      <div className="vp-label">AI Narrator</div>

      <input
        type="range"
        className="vp-range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={seek}
        style={{ "--vp-pct": `${pct}%` } as React.CSSProperties}
      />

      <span className="vp-time">{fmt(currentTime)} / {fmt(duration)}</span>

      <button className="vp-close" onClick={dismiss} title="Stop">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        </svg>
      </button>
    </div>
  );
}

export default function ChapterViewer({
  chapterId, chapterNumber, title, text: initialText, summary, onReopen, onClose,
}: Props) {
  const [editing, setEditing]     = useState(false);
  const [text, setText]           = useState(initialText);
  const [draft, setDraft]         = useState(initialText);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setText(initialText); setDraft(initialText); }, [initialText]);

  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editing, draft]);

  function startEdit() {
    setDraft(text);
    setSaveError(null);
    setEditing(true);
    setTimeout(() => taRef.current?.focus(), 50);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateChapterText(chapterId, draft);
      setText(draft);
      setEditing(false);
    } catch (e) { setSaveError(String(e)); }
    finally { setSaving(false); }
  }

  function downloadPdf() {
    const a = document.createElement("a");
    a.href = pdfUrl(chapterId);
    a.download = `chapter_${chapterNumber}.pdf`;
    a.click();
  }

  const heading    = title ? `Chapter ${chapterNumber}: ${title}` : `Chapter ${chapterNumber}`;
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean).filter((p) => !/^chapter\s+\d+/i.test(p));

  return (
    <div className="output-view">
      <div className="output-bar">
        <div className="output-bar-l">Manuscript</div>
        <div className="output-bar-r">
          {editing ? (
            <>
              {saveError && <span style={{ fontSize: 12, color: "var(--rose)" }}>{saveError}</span>}
              <button className="btn-cancel" onClick={() => { setDraft(text); setEditing(false); }} disabled={saving}>Cancel</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: "#fff" }} /> Saving…</> : "Save"}
              </button>
            </>
          ) : (
            <>
              <button className="btn-reopen" onClick={onReopen}>← Re-record</button>
              <button className="btn-edit" onClick={startEdit}>✏ Edit</button>
              <button className="btn-pdf" onClick={downloadPdf}>↓ PDF</button>
              <button
                className={`btn-listen-toggle${showPlayer ? " active" : ""}`}
                onClick={() => setShowPlayer((v) => !v)}
                title="Listen to this chapter"
              >
                <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M0 0L11 6.5L0 13V0Z"/>
                </svg>
                Listen
              </button>
              {onClose && <button className="btn-back" onClick={onClose}>← Back</button>}
            </>
          )}
        </div>
      </div>

      {showPlayer && !editing && (
        <div className="vp-bar">
          <VoicePlayer key={chapterId} chapterId={chapterId} />
        </div>
      )}

      <div className="manuscript-wrap">
        <div className="manuscript">
          <h1 className="manuscript-title">{heading}</h1>
          <div className="manuscript-rule" />

          {editing ? (
            <textarea
              ref={taRef}
              className="manuscript-editor"
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

      {summary && !editing && (
        <details className="summary-panel">
          <summary>Chapter Summary — used as context for the next chapter</summary>
          <div className="summary-body">{summary}</div>
        </details>
      )}
    </div>
  );
}
