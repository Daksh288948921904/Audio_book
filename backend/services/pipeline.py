import logging
import os
import threading
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

from backend.db import Chapter, AudioSegment

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


def process_audio_segment(db: Session, chapter_id: int, audio_path: str, order_index: int) -> AudioSegment:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()

    # Preprocess: HPF + loudnorm + 16 kHz mono. Falls back to original on error.
    processed_path = preprocess_audio(audio_path)
    try:
        transcript = transcription.transcribe(processed_path or audio_path)
    finally:
        if processed_path and os.path.exists(processed_path):
            os.unlink(processed_path)

    intent_label = intent.classify_intent(transcript)

    # Keep the audio file for 2 days, then the cleanup task will remove it
    expires_at = datetime.now(timezone.utc) + timedelta(days=2)

    segment = AudioSegment(
        chapter_id=chapter_id,
        filename=audio_path,
        transcript=transcript,
        intent=intent_label,
        order_index=order_index,
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


def finish_chapter(db: Session, chapter_id: int) -> tuple[str, bytes]:
    """
    Generates the chapter text, creates a summary, wipes the Qdrant collection,
    and returns (generated_text, pdf_bytes).
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

    # Retrieve chunks from Qdrant. If empty (e.g. after server restart wipes
    # in-memory Qdrant), rebuild the collection from DB transcripts first.
    chunks = vector_store.retrieve_all_chunks(chapter.number)
    if not chunks:
        segs = (
            db.query(AudioSegment)
            .filter(AudioSegment.chapter_id == chapter_id)
            .order_by(AudioSegment.order_index)
            .all()
        )
        if segs:
            vector_store.ensure_collection(chapter.number)
            for seg in segs:
                if seg.transcript:
                    vector_store.add_chunk(
                        chapter_number=chapter.number,
                        text=seg.transcript,
                        intent=seg.intent or "informational",
                        chunk_type="segment",
                        segment_id=seg.id,
                    )
            prev_chapters = (
                db.query(Chapter)
                .filter(Chapter.number < chapter.number, Chapter.summary.isnot(None))
                .order_by(Chapter.number)
                .all()
            )
            for prev in prev_chapters:
                vector_store.add_chunk(
                    chapter_number=chapter.number,
                    text=prev.summary,
                    intent="informational",
                    chunk_type="summary",
                )
            chunks = vector_store.retrieve_all_chunks(chapter.number)

    # Sort live segments by segment_id to preserve recording order
    chunks.sort(key=lambda c: (c.get("type") != "summary", c.get("segment_id") or 0))

    # Generate chapter text. Manuscript chapters keep their uploaded text and
    # the recorded material is written as a continuation of it.
    if chapter.base_text:
        has_segments = any(c.get("type") == "segment" for c in chunks)
        new_prose = llm.generate_chapter(chunks, chapter.number, lead_in=chapter.base_text) if has_segments else ""
        generated_text = "\n\n".join(t for t in (chapter.base_text, new_prose) if t)
    else:
        generated_text = llm.generate_chapter(chunks, chapter.number)

    # Summarize
    summary = llm.summarize_chapter(generated_text, chapter.number)

    # Persist to SQLite
    chapter.generated_text = generated_text
    chapter.summary = summary
    chapter.status = "done"
    chapter.finished_at = datetime.now(timezone.utc)
    db.commit()

    # Wipe the Qdrant collection for this chapter
    vector_store.delete_collection(chapter.number)

    # Inject this chapter's summary into the NEXT chapter's collection
    next_chapter_number = chapter.number + 1
    vector_store.ensure_collection(next_chapter_number)
    vector_store.add_chunk(
        chapter_number=next_chapter_number,
        text=summary,
        intent="informational",
        chunk_type="summary",
    )

    # Also carry over all previous summary chunks to the next chapter's collection
    # (they were already wiped with this chapter — retrieve from SQLite instead)
    previous_chapters = (
        db.query(Chapter)
        .filter(Chapter.number < chapter.number, Chapter.summary.isnot(None))
        .order_by(Chapter.number)
        .all()
    )
    for prev in previous_chapters:
        vector_store.add_chunk(
            chapter_number=next_chapter_number,
            text=prev.summary,
            intent="informational",
            chunk_type="summary",
        )

    disp_num = _display_number(chapter, db)
    pdf_bytes = generate_pdf(chapter.number, chapter.title, generated_text, display_number=disp_num)

    return generated_text, pdf_bytes
