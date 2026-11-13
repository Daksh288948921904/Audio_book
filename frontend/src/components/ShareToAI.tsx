import { useEffect, useState } from "react";
import { fetchChapterPdf, getChapter, saveBlob } from "../api/client";

interface Props {
  chapterId: number;
  label: string;      // "Chapter 3: The Storm"
  bookTitle: string;
  onClose: () => void;
}

const AIS = [
  { name: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, prefill: true },
  { name: "Claude",  url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, prefill: true },
  { name: "Gemini",  url: () => "https://gemini.google.com/app", prefill: false },  // no prompt prefill
];

// Both chat sites sit behind Cloudflare, which rejects URLs over ~16 KB; keep the
// filled-in prompt well under that (~8–9k characters of chapter text).
const MAX_PREFILL_BYTES = 12_000;

const PASTE_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";

// Take a published chapter into an AI chat app. A site can't attach a file inside
// another site, and browsers only copy text/images — so on desktop the chapter text
// goes straight into the chat box (or the clipboard if it's too long for a link),
// and the PDF is downloaded to drag in. On phones the native share sheet hands the
// PDF itself to the ChatGPT / Claude / Gemini app.
export default function ShareToAI({ chapterId, label, bookTitle, onClose }: Props) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filename = `${bookTitle} - ${label}.pdf`.replace(/[\\/:*?"<>|]+/g, " ");
  const intro = `Here is ${label} of my book "${bookTitle}". Please read it and give me feedback.`;
  const withText = `${intro}\n\n---\n\n${text}`;
  const fitsInLink = encodeURIComponent(withText).length <= MAX_PREFILL_BYTES;

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
      await navigator.share({ files: [pdf], title: filename, text: intro });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(String(e));
    }
  }

  async function openIn(ai: typeof AIS[number]) {
    if (!pdf) return;
    const inline = ai.prefill && fitsInLink;
    // Start the copy while this page still has focus, but don't await it before
    // window.open — pop-up blockers only allow tabs opened straight from the click.
    const copying = inline ? Promise.resolve(true) : copyText();
    window.open(ai.url(inline ? withText : `${intro}\n\n`), "_blank", "noopener");
    saveBlob(pdf, filename);
    const copied = await copying;
    setNote(inline
      ? `Opened ${ai.name} with the chapter filled in — just press send. The PDF also downloaded if you'd rather drag it in.`
      : copied
        ? `In ${ai.name}, click the message box and press ${PASTE_KEY} to paste the chapter, then send. The PDF also downloaded — you can drag it in instead.`
        : `Your browser blocked copying. The PDF downloaded — drag it into ${ai.name}, or use "Copy text" below.`);
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
            <div className="share-hint">
              {fitsInLink
                ? "ChatGPT and Claude open with the whole chapter already in the message box."
                : `This chapter is too long to fill in automatically — it's copied for you; press ${PASTE_KEY} in the chat box.`}
            </div>
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
