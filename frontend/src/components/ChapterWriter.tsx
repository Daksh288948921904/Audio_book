import { useEffect, useRef, useState } from "react";
import { getWrittenText, saveWrittenText } from "../api/client";

interface Props {
  chapterId: number;
  hasText: boolean;
  onSaved: (pdfFilename: string | null) => void;
}

const SAVE_AFTER_MS = 1200;

// Type the chapter here. Saves as you go, and when the chapter is closed; it's
// handled like an attached PDF: polished and placed at the start of the chapter.
export default function ChapterWriter({ chapterId, hasText, onSaved }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(hasText);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef("");
  const latestRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!hasText) return;
    getWrittenText(chapterId)
      .then((t) => {
        savedRef.current = latestRef.current = t;
        setText(t);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // Only on open: saving flips hasText, and the box already holds that text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // One save at a time, in order, so an older save can't land last.
  function save() {
    clearTimeout(timerRef.current);
    queueRef.current = queueRef.current.then(async () => {
      const value = latestRef.current;
      if (value === savedRef.current) return;
      setStatus("saving");
      try {
        const name = await saveWrittenText(chapterId, value);
        savedRef.current = value;
        setError(null);
        setStatus("saved");
        onSavedRef.current(name);
      } catch (e) {
        setStatus("");
        setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function change(value: string) {
    latestRef.current = value;
    setText(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_AFTER_MS);
  }

  // Closing the chapter must not lose the last few words.
  useEffect(() => () => save(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="ch-write">
      <textarea
        className="ch-write-box"
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={save}
        disabled={loading}
        placeholder={loading ? "Loading…" : "Or write this chapter here…"}
        aria-label="Write this chapter"
      />
      <div className="ch-write-meta">
        <span>{words > 0 ? `${words.toLocaleString()} word${words !== 1 ? "s" : ""}` : ""}</span>
        <span>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}</span>
      </div>
      {words > 0 && (
        <span className="ch-rec-pdf-note">
          Polished and placed at the start of this chapter when it's written; recordings continue after it.
        </span>
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
