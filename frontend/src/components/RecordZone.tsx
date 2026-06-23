import { useRef, useState } from "react";

interface Props {
  onRecorded: (blob: Blob, filename: string) => void;
}

type S = "idle" | "recording" | "processing";

export default function RecordZone({ onRecorded }: Props) {
  const [state, setState] = useState<S>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setState("idle");
        onRecorded(blob, `rec_${Date.now()}.webm`);
      };
      mediaRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setError("Mic access denied — please allow microphone access.");
      setState("idle");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setState("processing");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    onRecorded(f, f.name);
    e.target.value = "";
  }

  const isRec = state === "recording";
  const isProc = state === "processing";

  return (
    <div className="record-zone">
      <div className="rz-label">
        {isRec ? "● Recording…" : isProc ? "Processing…" : "Record a segment"}
      </div>

      <div className={`waveform ${isRec ? "active" : ""}`}>
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="waveform-bar" />)}
      </div>

      <div className="rec-wrap">
        {isRec && (
          <div className="rec-rings">
            <div className="rec-ring" />
            <div className="rec-ring" />
            <div className="rec-ring" />
          </div>
        )}

        <button
          className={`rec-btn ${isRec ? "recording" : "idle"}`}
          onClick={isRec ? stop : start}
          disabled={isProc}
        >
          {isProc
            ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3, borderTopColor: "var(--blue)" }} />
            : isRec ? "⏹" : "🎙"}
        </button>

        <div className={`rec-label ${isRec ? "rec-active" : ""}`}>
          {isProc ? "Finishing…" : isRec ? "Tap to stop" : "Tap to record"}
        </div>
      </div>

      {error && (
        <div className="error-bar" style={{ maxWidth: 400 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {state === "idle" && (
        <div className="upload-row">
          <span>or</span>
          <button className="upload-link" onClick={() => fileRef.current?.click()}>upload audio file</button>
          <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}
