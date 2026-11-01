import logging
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

from backend.db import Book, Chapter, AudioSegment

_SPECIAL_TITLES = {"Prologue", "Epilogue"}
_active_generations: set[int] = set()
_active_lock = threading.Lock()


def _display_number(chapter: Chapter, db: Session) -> int | None:
    """1-based display number for regular chapters; None for front/back matter and special titles."""
    if chapter.section_type != "chapter" or chapter.title in _SPECIAL_TITLES:
        return None
    all_chs = (
        db.query(Chapter)
        .filter(Chapter.book_id == chapter.book_id, Chapter.section_type == "chapter")
        .order_by(Chapter.number)
        .all()
    )
    main = [c for c in all_chs if c.title not in _SPECIAL_TITLES]
    return next((i + 1 for i, c in enumerate(main) if c.id == chapter.id), None)
from backend.services import transcription, intent, vector_store, llm
from backend.services.audio_preprocess import preprocess_audio
from backend.services.pdf import generate_pdf


def analyze_audio(audio_path: str) -> tuple[str, str]:
    """Slow part of an upload (ffmpeg + STT + tone) — returns (transcript, intent)."""
    # Preprocess: HPF + loudnorm + 16 kHz mono. Falls back to original on error.
    processed_path = preprocess_audio(audio_path)
    try:
        transcript = transcription.transcribe(processed_path or audio_path)
    finally:
        if processed_path and os.path.exists(processed_path):
            os.unlink(processed_path)
    return transcript, intent.classify_intent(transcript)


def save_segment(db: Session, chapter: Chapter, audio_path: str, transcript: str,
                 intent_label: str, order_index: int, part_id: int | None = None) -> AudioSegment:
    # Keep the audio file for 2 days, then the cleanup task will remove it
    expires_at = datetime.now(timezone.utc) + timedelta(days=2)

    segment = AudioSegment(
        chapter_id=chapter.id,
        filename=audio_path,
        transcript=transcript,
        intent=intent_label,
        order_index=order_index,
        part_id=part_id,
        file_expires_at=expires_at,
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)

    # Store in this chapter's Qdrant collection
    vector_store.ensure_collection(chapter.number)
    vector_store.add_chunk(
        chapter_number=chapter.number,
        text=transcript,
        intent=intent_label,
        chunk_type="segment",
        segment_id=segment.id,
    )

    return segment


def process_audio_segment(db: Session, chapter_id: int, audio_path: str, order_index: int) -> AudioSegment:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    transcript, intent_label = analyze_audio(audio_path)
    return save_segment(db, chapter, audio_path, transcript, intent_label, order_index)


def finish_chapter(db: Session, chapter_id: int) -> tuple[str, bytes]:
    """
    Generates the chapter text, creates a summary, and returns (generated_text, pdf_bytes).
    """
    with _active_lock:
        if chapter_id in _active_generations:
            raise RuntimeError(f"Chapter {chapter_id} is already generating — duplicate request ignored")
        _active_generations.add(chapter_id)

    try:
        return _do_finish_chapter(db, chapter_id)
    finally:
        with _active_lock:
            _active_generations.discard(chapter_id)


def _do_finish_chapter(db: Session, chapter_id: int) -> tuple[str, bytes]:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    chapter.status = "generating"
    db.commit()

    # Build the LLM input from the DB, scoped to this book. Qdrant collections are
    # keyed by chapter *number*, which every book shares (each book has a chapter 4),
    # so reading them mixed other authors' recordings into this chapter.
    segs = (
        db.query(AudioSegment)
        .filter(AudioSegment.chapter_id == chapter_id)
        .order_by(AudioSegment.order_index, AudioSegment.id)
        .all()
    )
    prev_chapters = (
        db.query(Chapter)
        .filter(
            Chapter.book_id == chapter.book_id,
            Chapter.section_type == "chapter",
            Chapter.number < chapter.number,
            Chapter.summary.isnot(None),
        )
        .order_by(Chapter.number)
        .all()
    )
    summaries = [
        {"type": "summary", "text": prev.summary, "intent": "informational"}
        for prev in prev_chapters
    ]

    def seg_chunks(part_id):
        return [
            {"type": "segment", "text": seg.transcript, "intent": seg.intent or "informational", "segment_id": seg.id}
            for seg in segs if seg.transcript and seg.part_id == part_id
        ]

    # Part 1 is the chapter's own PDF/text/recordings; "+ Add more" parts follow in order.
    parts = [(chapter.pdf_text, chapter.written_text, seg_chunks(None))] + [
        (p.pdf_text, p.written_text, seg_chunks(p.id)) for p in chapter.parts
    ]
    number, base_text = chapter.number, chapter.base_text
    book = db.query(Book).filter(Book.id == chapter.book_id).first() if chapter.book_id else None
    genre = (book.genre if book else None) or "fiction"
    # Release the DB connection while the LLM runs (minutes) so other requests can use the pool.
    # Don't touch ORM attributes until the next commit — that would reload and re-hold a connection.
    db.commit()

    # Manuscript chapters open with their uploaded text. Then each part in order:
    # the author's own writing (attached PDF, then typed text) is polished, same as
    # manuscript chapters, and its recordings are written as a continuation.
    from backend.services.manuscript import _passages
    pieces: list[str] = [base_text] if base_text else []
    first_call = True
    for i, (pdf_text, written_text, part_segs) in enumerate(parts):
        own_text = "\n\n".join(t for t in (pdf_text, written_text) if t)
        for passage in _passages(own_text) if own_text else []:
            if not first_call:
                time.sleep(llm._BATCH_DELAY)
            first_call = False
            tail = "\n\n".join(pieces)[-600:]
            pieces.append(llm.enhance_passage(passage, tail, genre))
        if part_segs:
            if not first_call:
                time.sleep(llm._BATCH_DELAY)
            # Earlier chapters' summaries go with the chapter's first recordings only.
            context = summaries if not any(p[2] for p in parts[:i]) else []
            first_call = False
            prose = llm.generate_chapter(context + part_segs, number, lead_in="\n\n".join(pieces))
            if prose:
                pieces.append(prose)
    generated_text = "\n\n".join(pieces)

    # Summarize
    summary = llm.summarize_chapter(generated_text, number)

    # Persist. Parts keep their PDF/text, so a re-record rewrites the chapter in the same order.
    chapter.generated_text = generated_text
    chapter.summary = summary
    chapter.status = "done"
    chapter.finished_at = datetime.now(timezone.utc)
    db.commit()

    disp_num = _display_number(chapter, db)
    pdf_bytes = generate_pdf(chapter.number, chapter.title, generated_text, display_number=disp_num)

    return generated_text, pdf_bytes


# ── Background generation ────────────────────────────────────────────────────
# Writing a chapter from long recordings takes many minutes (one throttled LLM
# call per ~5 000 chars of notes), far longer than a browser or proxy will hold
# a request open. Requests queue the work and return; the CMS polls status.
#
# One worker thread per book, taking that book's queued chapters lowest number
# first, so each chapter is written after the one before it has its summary.
# Books run in parallel up to _MAX_PARALLEL, which bounds load on the Groq keys.
# In-process state is fine: gunicorn runs a single worker.

from backend.config import GROQ_API_KEYS
from backend.db import SessionLocal

_MAX_PARALLEL = max(1, min(len(GROQ_API_KEYS), 3))
_slots = threading.BoundedSemaphore(_MAX_PARALLEL)
_queue_lock = threading.Lock()
_book_queues: dict[int, dict[int, int]] = {}  # book_id -> {chapter_id: chapter number}
_running: set[int] = set()
_errors: dict[int, str] = {}


def is_busy(chapter_id: int) -> bool:
    with _queue_lock:
        return chapter_id in _running or any(chapter_id in q for q in _book_queues.values())


def last_error(chapter_id: int) -> str | None:
    return _errors.get(chapter_id)


def enqueue(db: Session, chapter_ids: list[int]) -> list[int]:
    """Mark chapters 'generating' and queue them. Returns the ids actually queued."""
    queued: list[int] = []
    start: list[int] = []
    chapters = db.query(Chapter).filter(Chapter.id.in_(chapter_ids)).all()
    for ch in chapters:
        if is_busy(ch.id):
            continue
        ch.status = "generating"
        _errors.pop(ch.id, None)
        queued.append(ch.id)
    db.commit()
    with _queue_lock:
        for ch in chapters:
            if ch.id not in queued:
                continue
            key = ch.book_id or 0
            if key not in _book_queues:
                _book_queues[key] = {}
                start.append(key)
            _book_queues[key][ch.id] = ch.number
    for key in start:
        threading.Thread(target=_book_worker, args=(key,), daemon=True, name=f"gen-book-{key}").start()
    return queued


def _book_worker(book_key: int) -> None:
    while True:
        with _queue_lock:
            pending = _book_queues.get(book_key)
            if not pending:
                _book_queues.pop(book_key, None)
                return
            chapter_id = min(pending, key=pending.get)
            del pending[chapter_id]
            _running.add(chapter_id)
            # Keep the (now possibly empty) dict in place until the chapter is done, so a
            # chapter queued meanwhile joins this worker instead of starting a second one.
        try:
            with _slots:
                _run_one(chapter_id)
        finally:
            with _queue_lock:
                _running.discard(chapter_id)


def _run_one(chapter_id: int) -> None:
    db = SessionLocal()
    try:
        finish_chapter(db, chapter_id)
        log.info("generation: chapter %d done", chapter_id)
    except Exception as exc:
        log.exception("generation: chapter %d failed", chapter_id)
        _errors[chapter_id] = str(exc) or exc.__class__.__name__
        db.rollback()
        ch = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if ch and ch.status == "generating":
            ch.status = "recording"
            db.commit()
    finally:
        db.close()


def resume_interrupted() -> None:
    """Re-queue chapters left 'generating' by a restart or deploy."""
    db = SessionLocal()
    try:
        ids = [c.id for c in db.query(Chapter).filter(Chapter.status == "generating").all()]
        if ids:
            log.info("generation: resuming %d interrupted chapter(s)", len(ids))
            # enqueue() skips chapters it thinks are busy; nothing is at startup.
            enqueue(db, ids)
    finally:
        db.close()
