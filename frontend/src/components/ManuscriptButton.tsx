import { useRef, useState } from "react";
import { uploadManuscript, type Book } from "../api/client";

interface Props {
  book: Book;
  onUploaded: (patch: Partial<Book>) => void;
}

const STATUS_TEXT: Record<string, string> = {
  uploaded:   "Uploaded — our editors will turn it into chapters",
  processing: "Creating chapters from your manuscript…",
  done:       "Chapters created from your manuscript",
  error:      "Couldn't create chapters — try uploading again",
};

export default function ManuscriptButton({ book, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = book.manuscript_status;
  const locked = status === "processing";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (status && !window.confirm(`Replace "${book.manuscript_filename}" with "${file.name}"?`)) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadManuscript(book.id, file);
      onUploaded(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="ms-upload">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        className="ms-upload-btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || locked}
        title={locked ? "Chapters are being created from your manuscript" : "Upload a PDF of a book you've written"}
      >
        {uploading
          ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Uploading…</>
          : status ? "📄 Replace Manuscript PDF" : "📄 Upload Manuscript PDF"}
      </button>
      {status && !uploading && (
        <div className={`ms-upload-status ms-upload-${status}`}>
          {status === "processing" && <span className="pip-gen" />}
          <span className="ms-upload-file">{book.manuscript_filename}</span>
          <span>· {status === "processing" && book.manuscript_progress ? book.manuscript_progress : STATUS_TEXT[status]}</span>
        </div>
      )}
      {error && <div className="ms-upload-error">{error}</div>}
    </div>
  );
}
