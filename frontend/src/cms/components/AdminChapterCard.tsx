import { useEffect, useRef, useState } from "react";
import { cmsFinishChapter, cmsGetChapter, cmsDownloadPdf, type CmsChapter, type CmsSegment } from "../api/adminClient";

const SECTION_ICONS: Record<string, string> = {
  "Dedication": "💌", "Epigraph": "💬", "Foreword": "✍", "Preface": "📝",
  "Author's Note": "🗒", "Acknowledgements": "🙏", "A Note on Sources": "📚",
  "About the Author": "👤", "Prologue": "🌅", "Epilogue": "🌇",
};

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

  // TTS state — browser Web Speech API
  const [voices, setVoices]       = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused]   = useState(false);
  const keepAliveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function load() {
      const v = window.speechSynthesis.getVoices();
      if (v.length === 0) return;
      setVoices(v);
      // prefer an English voice as default
      const eng = v.find((x) => x.lang.startsWith("en")) ?? v[0];
      setVoiceName((prev) => prev || eng.name);
    }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
      if (keepAliveRef.current) clearTimeout(keepAliveRef.current);
    };
  }, []);

  const isActivelyWriting = writing;
  const isStuck           = chapter.status === "generating" && !writing;
  const gradient          = GRADIENTS[index % GRADIENTS.length];

  async function handleWrite() {
    setWriting(true);
    setError(null);
    try {
      const r    = await cmsFinishChapter(chapter.id);
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

  function startTts() {
    if (!chapter.generated_text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(chapter.generated_text);
    const chosen = voices.find((v) => v.name === voiceName);
    if (chosen) utt.voice = chosen;

    // Chrome pauses after ~15 s on long texts — keepalive workaround
    function keepAlive() {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
      keepAliveRef.current = setTimeout(keepAlive, 10_000);
    }

    utt.onstart = () => { setTtsPlaying(true); setTtsPaused(false); keepAlive(); };
    utt.onend   = () => { setTtsPlaying(false); setTtsPaused(false); if (keepAliveRef.current) clearTimeout(keepAliveRef.current); };
    utt.onerror = () => { setTtsPlaying(false); setTtsPaused(false); if (keepAliveRef.current) clearTimeout(keepAliveRef.current); };
    window.speechSynthesis.speak(utt);
  }

  function togglePause() {
    if (ttsPaused) { window.speechSynthesis.resume(); setTtsPaused(false); }
    else           { window.speechSynthesis.pause();  setTtsPaused(true);  }
  }

  function stopTts() {
    window.speechSynthesis.cancel();
    setTtsPlaying(false);
    setTtsPaused(false);
    if (keepAliveRef.current) clearTimeout(keepAliveRef.current);
  }

  function badgeClass() {
    if (isActivelyWriting) return "adm-badge adm-badge-generating";
    if (isStuck)           return "adm-badge adm-badge-stuck";
    return `adm-badge adm-badge-${chapter.status}`;
  }

  function badgeLabel() {
    if (isActivelyWriting) return "Writing";
    if (isStuck)           return "Stuck";
    return chapter.status === "done" ? "Complete" : "Recording";
  }

  return (
    <div className="adm-card" style={{ background: gradient }}>
      <div>
        <div className={badgeClass()}>
          {chapter.status === "recording" && !isActivelyWriting && !isStuck && <span className="pip-rec" />}
          {isActivelyWriting && <span className="pip-gen" />}
          {isStuck && <span className="pip-stuck" />}
          {chapter.status === "done" && !isStuck && <span className="pip-done" />}
          {badgeLabel()}
        </div>

        {chapter.section_type !== "chapter" ? (
          <div className="adm-num" style={{ fontSize: 24 }}>{SECTION_ICONS[chapter.title ?? ""] ?? "📄"}</div>
        ) : (
          <div className="adm-num">{String(chapter.number).padStart(2, "0")}</div>
        )}
        <div className="adm-title">{chapter.title || `Chapter ${chapter.number}`}</div>
        <div className="adm-segs">{segments.length} recording{segments.length !== 1 ? "s" : ""}</div>

        {chapter.status === "done" && chapter.generated_text && (
          <div className="adm-excerpt">
            {chapter.generated_text.replace(/\n+/g, " ").slice(0, 90)}…
          </div>
        )}

        {isActivelyWriting && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#fbbf24" }}>
            <div className="cms-spinner" style={{ borderTopColor: "#fbbf24", width: 12, height: 12, borderWidth: 1.5 }} />
            Writing… (20–60 s)
          </div>
        )}

        {isStuck && (
          <div style={{ fontSize: 11, color: "#fb923c", marginTop: 6, lineHeight: 1.45 }}>
            Previous generation got stuck. Click Retry to try again.
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: "#fb7185", marginTop: 6, lineHeight: 1.4 }}>
            {error}
          </div>
        )}
      </div>

      {!isActivelyWriting && (
        <div className="adm-actions">
          {(chapter.status === "recording" || isStuck) && segments.length > 0 && (
            <button className="adm-btn adm-btn-write" onClick={handleWrite} disabled={writing}>
              {isStuck ? "↺ Retry Write" : chapter.section_type === "chapter" ? "✦ Write Chapter" : "✦ Write Section"}
            </button>
          )}
          {chapter.status === "done" && !isStuck && (
            <>
              <button className="adm-btn adm-btn-view" onClick={() => onViewManuscript(chapter)}>
                View Manuscript
              </button>
              <button className="adm-btn adm-btn-pdf" onClick={handlePdf}>
                ↓ PDF
              </button>

              {/* TTS — browser Web Speech API */}
              <div className="adm-tts">
                <div className="adm-tts-label">Read Aloud</div>
                {voices.length > 0 && (
                  <select
                    className="adm-select"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    disabled={ttsPlaying}
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                    ))}
                  </select>
                )}
                {!ttsPlaying ? (
                  <button className="adm-btn adm-btn-tts" onClick={startTts}>
                    ▶ Read Chapter
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="adm-btn adm-btn-tts" style={{ flex: 1 }} onClick={togglePause}>
                      {ttsPaused ? "▶ Resume" : "⏸ Pause"}
                    </button>
                    <button className="adm-btn adm-btn-view" style={{ flex: 1 }} onClick={stopTts}>
                      ■ Stop
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
