import { useEffect, useRef, useState } from "react";
import { pdfUrl, updateChapterText } from "../api/client";

interface Props {
  chapterId: number;
  chapterNumber: number;
  title: string | null;
  text: string;
  summary: string;
  onReopen: () => void;
  onClose?: () => void;
}

// ── Clean text for TTS ────────────────────────────────────────────────────────
function cleanForSpeech(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Pick the best available voice ─────────────────────────────────────────────
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const PREFER = [
    "Google UK English Male", "Google US English",
    "Samantha",               // macOS
    "Daniel",                 // macOS UK
    "Karen",                  // macOS AU
    "Microsoft David",        // Windows
    "Microsoft Mark",         // Windows
  ];
  for (const name of PREFER) {
    const v = voices.find((v) => v.name.startsWith(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? null;
}

// ── Voice player using Web Speech API ────────────────────────────────────────
function VoicePlayer({ text }: { text: string }) {
  const [playing,  setPlaying]  = useState(false);
  const [started,  setStarted]  = useState(false);
  const [progress, setProgress] = useState(0);   // 0–100 rough word %
  const wordCountRef = useRef(0);
  const wordsSpokenRef = useRef(0);

  // Cancel on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  function speak() {
    window.speechSynthesis.cancel();
    const cleaned   = cleanForSpeech(text);
    const words     = cleaned.split(/\s+/);
    wordCountRef.current   = words.length;
    wordsSpokenRef.current = 0;

    const u = new SpeechSynthesisUtterance(cleaned);
    u.rate  = 0.92;   // slightly slower — memoir narration pace
    u.pitch = 1.0;
    const voice = pickVoice();
    if (voice) u.voice = voice;

    u.onboundary = (e) => {
      if (e.name === "word") {
        wordsSpokenRef.current += 1;
        setProgress(Math.round((wordsSpokenRef.current / wordCountRef.current) * 100));
      }
    };
    u.onstart = () => { setPlaying(true); setStarted(true); };
    u.onend   = () => { setPlaying(false); setProgress(100); };
    u.onerror = () => setPlaying(false);

    window.speechSynthesis.speak(u);
  }

  function toggle() {
    if (!started) { speak(); return; }
    if (playing) {
      window.speechSynthesis.pause();
      setPlaying(false);
    } else {
      window.speechSynthesis.resume();
      setPlaying(true);
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    setPlaying(false);
    setStarted(false);
    setProgress(0);
  }

  return (
    <div className="vp-player">
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

      <div className="vp-label">
        {!started ? "AI Narrator" : playing ? "Reading…" : "Paused"}
      </div>

      {/* Progress bar — word boundary driven */}
      <div className="vp-progress-track">
        <div className="vp-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <span className="vp-pct">{started ? `${progress}%` : ""}</span>

      <button className="vp-close" onClick={stop} title="Stop">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 1l6 6M7 1l-6 6"/>
        </svg>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChapterViewer({
  chapterId, chapterNumber, title, text: initialText, summary, onReopen, onClose,
}: Props) {
  const [editing,     setEditing]     = useState(false);
  const [text,        setText]        = useState(initialText);
  const [draft,       setDraft]       = useState(initialText);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [showPlayer,  setShowPlayer]  = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setText(initialText); setDraft(initialText); }, [initialText]);

  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editing, draft]);

  // Stop speech when player is hidden or user starts editing
  useEffect(() => {
    if (!showPlayer || editing) window.speechSynthesis.cancel();
  }, [showPlayer, editing]);

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
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^chapter\s+\d+/i.test(p));

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
              >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M0 0L10 6L0 12V0Z"/>
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
          <VoicePlayer key={chapterId} text={text} />
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
