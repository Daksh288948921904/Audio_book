import { useEffect, useRef, useState } from "react";
import { removeChapterPdf, uploadAudio, uploadChapterPdf, type Segment } from "../api/client";
import ChapterWriter from "./ChapterWriter";

interface Props {
  chapterId: number;
  partId?: number | null;     // an added part; null/undefined = part 1 (the chapter itself)
  title: string;
  chapterLabel: string;
  recordingCount: number;
  onRemove?: () => void;      // added parts only
  pdfFilename?: string | null;
  hasWritten?: boolean;
  onAdded: (segment: Segment) => void;
  onPdfChanged: (pdfFilename: string | null) => void;
  onWrittenChanged: (hasWritten: boolean) => void;
}

type S = "idle" | "recording" | "uploading";

// Record or upload audio, attach a written PDF, or type the chapter, straight into one chapter — no "which section?" step.
export default function ChapterRecorder({
  chapterId, partId, title, chapterLabel, recordingCount, onRemove,
  pdfFilename, hasWritten, onAdded, onPdfChanged, onWrittenChanged,
}: Props) {
  const [state, setState] = useState<S>("idle");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfInfo, setPdfInfo] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Closing the chapter mid-recording drops the take and releases the mic.
  useEffect(() => () => {
    if (mediaRef.current?.state === "recording") {
      discardRef.current = true;
      mediaRef.current.stop();
    }
  }, []);

  async function upload(files: File[]) {
    setState("uploading");
    setError(null);
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(files.length > 1 ? `Processing ${i + 1} of ${files.length}…` : "Processing your recording…");
      try {
        onAdded(await uploadAudio(chapterId, files[i], partId));
      } catch (e) {
        failed.push(`${files[i].name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failed.length) setError(`Couldn't add ${failed.join("; ")}`);
    setProgress(null);
    setState("idle");
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (discardRef.current) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        upload([new File([blob], `rec_${Date.now()}.webm`, { type: "audio/webm" })]);
      };
      mediaRef.current = rec;
      rec.start();
      setSeconds(0);
      setState("recording");
    } catch {
      setError("Mic access denied — please allow microphone access.");
    }
  }

  async function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pdfFilename && !window.confirm(`Replace "${pdfFilename}" with "${file.name}"?`)) return;
    setState("uploading");
    setProgress("Reading your PDF…");
    setError(null);
    try {
      const r = await uploadChapterPdf(chapterId, file, partId);
      setPdfInfo(`${r.pages} page${r.pages !== 1 ? "s" : ""} · ${r.words.toLocaleString()} words`);
      onPdfChanged(r.pdf_filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      setState("idle");
    }
  }

  async function removePdf() {
    if (!window.confirm(`Remove "${pdfFilename}" from ${chapterLabel}?`)) return;
    setError(null);
    try {
      await removeChapterPdf(chapterId, partId);
      setPdfInfo(null);
      onPdfChanged(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) upload(files);
  }

  const isRec = state === "recording";
  const busy = state === "uploading";
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const attachedPdf = pdfFilename || null;

  return (
    <div className="ch-rec">
      <div className="ch-rec-head">
        <div className="ch-rec-title">{title}</div>
        {recordingCount > 0 && (
          <span className="ch-rec-count">🎙 {recordingCount} recording{recordingCount !== 1 ? "s" : ""}</span>
        )}
        {onRemove && (
          <button className="ch-rec-part-remove" onClick={onRemove} disabled={busy || isRec} title="Remove this part">
            Remove
          </button>
        )}
      </div>
      <div className="ch-rec-row">
        <button
          className={`ch-rec-btn${isRec ? " recording" : ""}`}
          onClick={isRec ? () => mediaRef.current?.stop() : start}
          disabled={busy}
        >
          {isRec ? <>⏹ Stop · {clock}</> : "🎙 Record"}
        </button>
        <button className="ch-rec-upload" onClick={() => fileRef.current?.click()} disabled={busy || isRec}>
          ⬆ Upload audio
        </button>
        <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={handleFiles} />
        <button className="ch-rec-upload" onClick={() => pdfRef.current?.click()} disabled={busy || isRec}
          title="Already wrote this chapter? Attach it — it's polished and becomes the start of the chapter">
          📄 {attachedPdf ? "Replace PDF" : "Upload PDF"}
        </button>
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={handlePdf} />
      </div>
      {attachedPdf && (
        <div className="ch-rec-pdf">
          <span className="ch-rec-pdf-name">📄 {attachedPdf}</span>
          {pdfInfo && <span>· {pdfInfo}</span>}
          <button className="ch-rec-pdf-remove" onClick={removePdf} disabled={busy || isRec} title="Remove PDF">×</button>
          <span className="ch-rec-pdf-note">
            Polished and placed at the start of this part when the chapter is written; recordings continue after it.
          </span>
        </div>
      )}
      <ChapterWriter chapterId={chapterId} partId={partId} hasText={!!hasWritten} afterPdf={!!attachedPdf} onSaved={onWrittenChanged} />
      {busy && (
        <div className="ch-rec-status">
          <span className="spinner" style={{ width: 12, height: 12 }} /> {progress}
        </div>
      )}
      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}
