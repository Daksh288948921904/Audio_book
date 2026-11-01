import { useEffect, useState } from "react";
import { fetchChapterPdf, getChapter, saveBlob } from "../api/client";

interface Props {
  chapterId: number;
  label: string;      // "Chapter 3: The Storm"
  bookTitle: string;
  onClose: () => void;
}

const AIS = [
  { name: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { name: "Claude",  url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: "Gemini",  url: () => "https://gemini.google.com/app" },  // no prompt prefill
];

// Take a published chapter into an AI chat app. Sites can't receive a file through
// a link, so on desktop we download the PDF, copy the text and open the chat with a
// prompt; on phones the native share sheet hands the PDF straight to the app.
export default function ShareToAI({ chapterId, label, bookTitle, onClose }: Props) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filename = `${bookTitle} - ${label}.pdf`.replace(/[\\/:*?"<>|]+/g, " ");
  const prompt = `I'm sharing ${label} of my book "${bookTitle}". I'll attach the PDF (or paste the text). ` +
    "Please read it and give me feedback.";

  useEffect(() => {
    Promise.all([fetchChapterPdf(chapterId), getChapter(chapterId)])
      .then(([blob, ch]) => {
        setPdf(new File([blob], filename, { type: "application/pdf" }));
        setText(ch.generated_text ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const canShareFile = !!pdf && !!navigator.canShare?.({ files: [pdf] });

  async function copyText(): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }

  async function shareFile() {
    if (!pdf) return;
    try {
      await navigator.share({ files: [pdf], title: filename, text: prompt });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(String(e));
    }
  }

  async function openIn(ai: typeof AIS[number]) {
    if (!pdf) return;
    // Open first: browsers block pop-ups that aren't opened directly in the click.
    window.open(ai.url(prompt), "_blank", "noopener");
    saveBlob(pdf, filename);
    const copied = await copyText();
    setNote(`PDF downloaded${copied ? " and text copied" : ""} — attach the PDF${copied ? " or paste the text" : ""} in ${ai.name}.`);
  }

  return (
    <div className="share-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="share-box">
        <div className="share-head">
          <div>
            <div className="share-title">Share to AI</div>
            <div className="share-sub">{label} · {bookTitle}</div>
          </div>
          <button className="share-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="ch-rec-status"><span className="spinner" style={{ width: 12, height: 12 }} /> Preparing your PDF…</div>
        ) : pdf && (
          <>
            {canShareFile && (
              <button className="share-primary" onClick={shareFile}>📤 Share PDF to an app…</button>
            )}
            <div className="share-label">{canShareFile ? "Or open in" : "Open in"}</div>
            <div className="share-row">
              {AIS.map((ai) => (
                <button key={ai.name} className="ch-rec-upload" onClick={() => openIn(ai)}>{ai.name}</button>
              ))}
            </div>
            {note && <div className="share-note">{note}</div>}
            <div className="share-row share-row-minor">
              <button className="share-link" onClick={() => saveBlob(pdf, filename)}>↓ Download PDF</button>
              <button className="share-link" onClick={async () => setNote(await copyText() ? "Text copied." : "Couldn't copy — your browser blocked it.")}>
                Copy text
              </button>
            </div>
          </>
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
