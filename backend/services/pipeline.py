import os
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from backend.db import Chapter, AudioSegment
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
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    chapter.status = "generating"
    db.commit()

    # Retrieve all chunks (live segments + previous chapter summary chunks)
    chunks = vector_store.retrieve_all_chunks(chapter.number)

    # Sort live segments by segment_id to preserve recording order
    chunks.sort(key=lambda c: (c.get("type") != "summary", c.get("segment_id") or 0))

    # Generate chapter text
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

    pdf_bytes = generate_pdf(chapter.number, chapter.title, generated_text)
    return generated_text, pdf_bytes
