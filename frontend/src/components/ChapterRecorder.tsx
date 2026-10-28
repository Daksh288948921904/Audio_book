import { useEffect, useRef, useState } from "react";
import { uploadAudio, type Segment } from "../api/client";

interface Props {
  chapterId: number;
  chapterLabel: string;
  onAdded: (segment: Segment) => void;
}

type S = "idle" | "recording" | "uploading";

// Record or upload audio straight into one chapter — no "which section?" step.
export default function ChapterRecorder({ chapterId, chapterLabel, onAdded }: Props) {
  const [state, setState] = useState<S>("idle");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        onAdded(await uploadAudio(chapterId, files[i]));
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

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) upload(files);
  }

  const isRec = state === "recording";
  const busy = state === "uploading";
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="ch-rec">
      <div className="ch-rec-title">Add audio to {chapterLabel}</div>
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
      </div>
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
