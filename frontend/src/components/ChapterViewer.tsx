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

export default function ChapterViewer({
  chapterId, chapterNumber, title, text: initialText, summary, onReopen, onClose,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [draft, setDraft] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const heading = title ? `Chapter ${chapterNumber}: ${title}` : `Chapter ${chapterNumber}`;
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
              {onClose && <button className="btn-back" onClick={onClose}>← Back</button>}
            </>
          )}
        </div>
      </div>

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
