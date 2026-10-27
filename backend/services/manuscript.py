import io
import logging
import re
import threading
import time
from datetime import datetime, timezone

from backend.db import SessionLocal, Book, Chapter, AudioSegment
from backend.services import llm

log = logging.getLogger(__name__)

# ~1 250 tokens of input per enhancement call, matching llm.py's batch budget.
_PASSAGE_CHARS = 5000

# Used only when the PDF has no recognisable chapter headings.
_FALLBACK_CHAPTER_WORDS = 3500

# Text before the first heading shorter than this is title page / copyright / TOC.
_MIN_PREAMBLE_CHARS = 1500

# A "chapter" shorter than this is almost always a table-of-contents entry.
_MIN_CHAPTER_CHARS = 300

_RETRIES = 3

_NUM_WORDS = (
    r"one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|"
    r"fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[-\s]\w+)?|thirty(?:[-\s]\w+)?|"
    r"forty(?:[-\s]\w+)?|fifty"
)
_CHAPTER_RE = re.compile(
    rf"^\s*chapter\s+(\d+|[ivxlcdm]+|{_NUM_WORDS})\b\s*[.:\-–—]?\s*(.*)$", re.IGNORECASE
)
_SPECIAL_RE = re.compile(r"^\s*(prologue|epilogue)\s*[.:\-–—]?\s*(.*)$", re.IGNORECASE)
_PAGE_NUM_RE = re.compile(r"^\s*(?:page\s+)?\d{1,4}\s*$", re.IGNORECASE)

_active_books: set[int] = set()
_active_lock = threading.Lock()


# ── PDF extraction ────────────────────────────────────────────────────────────

def extract_pdf_text(pdf_bytes: bytes) -> tuple[str, int]:
    """Returns (cleaned text, page count). Raises ValueError for unreadable PDFs."""
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    lines = [
        ln.rstrip()
        for ln in "\n".join(pages).splitlines()
        if not _PAGE_NUM_RE.match(ln)
    ]
    text = "\n".join(lines)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)   # re-join hyphenated line wraps
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text, len(pages)


# ── Chapter detection ────────────────────────────────────────────────────────

def _heading(lines: list[str], i: int) -> tuple[str, str | None] | None:
    """If lines[i] is a chapter heading, return (dedupe key, title or None)."""
    line = lines[i].strip()
    if not line or len(line) > 80:
        return None
    m = _SPECIAL_RE.match(line)
    if m:
        return m.group(1).lower(), m.group(1).capitalize()
    m = _CHAPTER_RE.match(line)
    if not m:
        return None
    key = f"chapter {m.group(1).lower()}"
    title = m.group(2).strip() or None
    if title is None:
        # Title often sits on the next non-blank line: short, no sentence punctuation.
        nxt = next((ln.strip() for ln in lines[i + 1:i + 3] if ln.strip()), "")
        if nxt and len(nxt) <= 60 and nxt[0].isupper() and not nxt.endswith((".", ",", ";", "!", "?", '"')):
            title = nxt
    return key, title


def split_chapters(text: str) -> list[dict]:
    """Split manuscript text into [{"title": str | None, "text": str}, ...]."""
    lines = text.splitlines()
    heads = [(i, h) for i in range(len(lines)) if (h := _heading(lines, i))]

    # A table of contents repeats every heading before the real one — keep the last occurrence.
    last_idx = {key: i for i, (key, _) in heads}
    heads = [(i, title) for i, (key, title) in heads if last_idx[key] == i]

    chapters: list[dict] = []
    if len(heads) >= 2:
        preamble = "\n".join(lines[:heads[0][0]]).strip()
        if len(preamble) >= _MIN_PREAMBLE_CHARS:
            chapters.append({"title": None, "text": preamble})
        for n, (i, title) in enumerate(heads):
            end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
            body_lines = lines[i + 1:end]
            if title and body_lines and body_lines[0].strip() == title:
                body_lines = body_lines[1:]
            elif title and body_lines and not body_lines[0].strip() and len(body_lines) > 1 \
                    and body_lines[1].strip() == title:
                body_lines = body_lines[2:]
            body = "\n".join(body_lines).strip()
            if len(body) >= _MIN_CHAPTER_CHARS:
                chapters.append({"title": title, "text": body})
    if len(chapters) >= 2:
        return chapters

    # No usable headings — cut into roughly equal chapters at the first sentence end past
    # the target length (PDF text often has no blank lines between paragraphs).
    chunks, cur, words = [], [], 0
    for ln in lines:
        cur.append(ln)
        words += len(ln.split())
        if words >= _FALLBACK_CHAPTER_WORDS and ln.rstrip().endswith((".", "!", "?", '"', "”")):
            chunks.append("\n".join(cur)); cur, words = [], 0
    if cur:
        if chunks and words < _FALLBACK_CHAPTER_WORDS // 3:
            chunks[-1] += "\n" + "\n".join(cur)
        else:
            chunks.append("\n".join(cur))
    return [{"title": None, "text": c.strip()} for c in chunks if c.strip()]


def _passages(text: str) -> list[str]:
    """Split chapter text into ~_PASSAGE_CHARS pieces at line boundaries."""
    out, cur = [], ""
    for ln in text.splitlines(keepends=True):
        if len(cur) + len(ln) > _PASSAGE_CHARS and cur.strip():
            out.append(cur); cur = ""
        cur += ln
    if cur.strip():
        out.append(cur)
    return out


# ── Background job ───────────────────────────────────────────────────────────

def is_running(book_id: int) -> bool:
    with _active_lock:
        return book_id in _active_books


def reserve(book_id: int) -> bool:
    """Atomically claim the job slot for this book. False if a job already holds it."""
    with _active_lock:
        if book_id in _active_books:
            return False
        _active_books.add(book_id)
        return True


def release(book_id: int) -> None:
    with _active_lock:
        _active_books.discard(book_id)


def launch(book_id: int) -> None:
    """Start the background job for a book already claimed with reserve(); it releases the slot when done."""
    threading.Thread(target=_run, args=(book_id,), daemon=True).start()


def _with_retry(fn, *args, **kwargs):
    for attempt in range(_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception:
            if attempt == _RETRIES - 1:
                raise
            log.warning("Manuscript LLM call failed (attempt %d) — retrying in 60 s", attempt + 1, exc_info=True)
            time.sleep(60)


def _run(book_id: int) -> None:
    db = SessionLocal()
    try:
        _create_chapters(db, book_id)
    except Exception as exc:
        log.exception("Manuscript chapter creation failed for book %s", book_id)
        db.rollback()
        book = db.query(Book).filter(Book.id == book_id).first()
        if book:
            book.manuscript_status = "error"
            book.manuscript_progress = f"Failed: {exc}"
            db.commit()
    finally:
        db.close()
        release(book_id)


def _create_chapters(db, book_id: int) -> None:
    book = db.query(Book).filter(Book.id == book_id).first()
    genre = book.genre or "fiction"
    parts = split_chapters(book.manuscript_text or "")

    # Resume support: chapters already written from this upload by an interrupted run.
    already = (
        db.query(Chapter)
        .filter(
            Chapter.book_id == book_id,
            Chapter.base_text.isnot(None),
            Chapter.created_at >= book.manuscript_uploaded_at,
        )
        .count()
    )

    if already == 0:
        # Drop the untouched placeholder chapters from "New Book" — the manuscript defines the chapters now.
        placeholders = (
            db.query(Chapter)
            .filter(
                Chapter.book_id == book_id,
                Chapter.section_type == "chapter",
                Chapter.status == "recording",
                Chapter.generated_text.is_(None),
                Chapter.base_text.is_(None),
            )
            .all()
        )
        for ch in placeholders:
            if db.query(AudioSegment).filter(AudioSegment.chapter_id == ch.id).count() == 0:
                db.delete(ch)

    book.manuscript_status = "processing"
    db.commit()

    for idx, part in enumerate(parts):
        if idx < already:
            continue
        passages = _passages(part["text"])
        polished: list[str] = []
        for p_idx, passage in enumerate(passages):
            book.manuscript_progress = (
                f"Enhancing chapter {idx + 1} of {len(parts)} (part {p_idx + 1}/{len(passages)})"
            )
            db.commit()
            prev_tail = polished[-1][-600:] if polished else ""
            polished.append(_with_retry(llm.enhance_passage, passage, prev_tail, genre))
            time.sleep(llm._BATCH_DELAY)  # stay inside Groq's TPM limit

        text = "\n\n".join(polished)
        summary = _with_retry(llm.summarize_chapter, text, idx + 1)

        # New chapters go after everything else; main chapters are ordered by number
        # within their section, so back matter staying lower-numbered is fine.
        last = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.number.desc()).first()
        now = datetime.now(timezone.utc)
        db.add(Chapter(
            book_id=book_id,
            number=(last.number + 1) if last else 1,
            title=part["title"],
            section_type="chapter",
            generated_text=text,
            base_text=text,
            summary=summary,
            status="done",
            finished_at=now,
        ))
        db.commit()

    book.manuscript_status = "done"
    book.manuscript_progress = f"Created {len(parts)} chapter{'s' if len(parts) != 1 else ''}"
    db.commit()
