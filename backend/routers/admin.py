import io
import os
import re
import wave
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import get_db, User, Book, Chapter, AudioSegment
from backend.auth import require_admin
from backend.services.pipeline import finish_chapter
from backend.services.pdf import generate_pdf

router = APIRouter(prefix="/admin", tags=["admin"])

_admin = Depends(require_admin)

_AUDIO_MIME: dict[str, str] = {
    ".webm": "audio/webm",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".mp4":  "audio/mp4",
}


class TextUpdate(BaseModel):
    text: str


class TtsRequest(BaseModel):
    model: str = "canopylabs/orpheus-v1-english"
    voice: str = "austin"


def _split_text(text: str, max_chars: int = 190) -> list[str]:
    """Split text into chunks at sentence boundaries, staying under max_chars."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            # Oversized sentence — split at word boundaries
            for word in sentence.split():
                if not current:
                    current = word
                elif len(current) + 1 + len(word) <= max_chars:
                    current += " " + word
                else:
                    chunks.append(current)
                    current = word
        elif not current:
            current = sentence
        elif len(current) + 1 + len(sentence) <= max_chars:
            current += " " + sentence
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks


def _concat_wavs(wav_bytes_list: list[bytes]) -> bytes:
    """Concatenate a list of WAV byte strings into a single WAV."""
    if len(wav_bytes_list) == 1:
        return wav_bytes_list[0]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        for i, raw in enumerate(wav_bytes_list):
            with wave.open(io.BytesIO(raw), "rb") as src:
                if i == 0:
                    out.setparams(src.getparams())
                out.writeframes(src.readframes(src.getnframes()))
    return buf.getvalue()


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: dict = _admin):
    users = db.query(User).order_by(User.created_at).all()
    result = []
    for u in users:
        book_count = db.query(Book).filter(Book.user_id == u.google_id).count()
        result.append({
            "id":         u.id,
            "google_id":  u.google_id,
            "name":       u.name,
            "email":      u.email,
            "book_count": book_count,
            "created_at": u.created_at,
        })
    return result


@router.get("/users/{google_id}/books")
def list_user_books(google_id: str, db: Session = Depends(get_db), _: dict = _admin):
    books = (
        db.query(Book)
        .filter(Book.user_id == google_id)
        .order_by(Book.created_at)
        .all()
    )
    return [
        {
            "id":            b.id,
            "title":         b.title,
            "genre":         b.genre or "fiction",
            "created_at":    b.created_at,
            "chapter_count": len(b.chapters),
            "done_count":    sum(1 for c in b.chapters if c.status == "done"),
        }
        for b in books
    ]


@router.get("/books/{book_id}/chapters")
def list_book_chapters(book_id: int, db: Session = Depends(get_db), _: dict = _admin):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.number)
        .all()
    )
    return [
        {
            "id":            c.id,
            "book_id":       c.book_id,
            "number":        c.number,
            "title":         c.title,
            "status":        c.status,
            "generated_text": c.generated_text,
            "summary":       c.summary,
            "segment_count": db.query(AudioSegment).filter(AudioSegment.chapter_id == c.id).count(),
            "created_at":    c.created_at,
            "finished_at":   c.finished_at,
        }
        for c in chapters
    ]


@router.get("/chapters/{chapter_id}")
def get_chapter(chapter_id: int, db: Session = Depends(get_db), _: dict = _admin):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {
        "id":            chapter.id,
        "book_id":       chapter.book_id,
        "number":        chapter.number,
        "title":         chapter.title,
        "status":        chapter.status,
        "generated_text": chapter.generated_text,
        "summary":       chapter.summary,
        "created_at":    chapter.created_at,
        "finished_at":   chapter.finished_at,
    }


@router.post("/books/{book_id}/compile")
def compile_book(book_id: int, db: Session = Depends(get_db), _: dict = _admin):
    """Sequentially finish all 'recording' chapters with segments for a book."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id, Chapter.status == "recording")
        .order_by(Chapter.number)
        .all()
    )

    results = []
    for ch in chapters:
        seg_count = db.query(AudioSegment).filter(AudioSegment.chapter_id == ch.id).count()
        if seg_count == 0:
            results.append({"chapter_id": ch.id, "number": ch.number, "status": "skipped", "reason": "no segments"})
            continue
        try:
            generated_text, _ = finish_chapter(db, ch.id)
            # Refresh after finish so we get updated status
            db.refresh(ch)
            results.append({"chapter_id": ch.id, "number": ch.number, "status": "done", "generated_text": generated_text})
        except Exception as e:
            results.append({"chapter_id": ch.id, "number": ch.number, "status": "error", "reason": str(e)})

    return {"book_id": book_id, "results": results}


@router.get("/chapters/{chapter_id}/pdf")
def download_pdf(chapter_id: int, db: Session = Depends(get_db), _: dict = _admin):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "done" or not chapter.generated_text:
        raise HTTPException(status_code=400, detail="Chapter not yet generated")
    pdf_bytes = generate_pdf(chapter.number, chapter.title, chapter.generated_text)
    filename = f"chapter_{chapter.number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/chapters/{chapter_id}/tts")
def generate_tts(chapter_id: int, body: TtsRequest, db: Session = Depends(get_db), _: dict = _admin):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    text = (chapter.generated_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Chapter text not available")
    from backend.services.groq_pool import pool
    chunks = _split_text(text)
    wav_parts = [pool.speech(chunk, model=body.model, voice=body.voice) for chunk in chunks]
    audio_bytes = _concat_wavs(wav_parts)
    filename = f"chapter_{chapter.number}.wav"
    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/chapters/{chapter_id}/text")
def update_text(chapter_id: int, body: TextUpdate, db: Session = Depends(get_db), _: dict = _admin):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "done":
        raise HTTPException(status_code=400, detail="Chapter not yet generated")
    chapter.generated_text = body.text
    db.commit()
    return {"status": "updated"}


@router.get("/audio/segments/{chapter_id}")
def get_segments(chapter_id: int, db: Session = Depends(get_db), _: dict = _admin):
    segments = (
        db.query(AudioSegment)
        .filter(AudioSegment.chapter_id == chapter_id)
        .order_by(AudioSegment.order_index)
        .all()
    )
    return [
        {
            "id":          s.id,
            "order_index": s.order_index,
            "transcript":  s.transcript,
            "intent":      s.intent,
            "filename":    s.filename,
            "has_audio":   bool(s.filename and os.path.exists(s.filename)),
        }
        for s in segments
    ]


@router.get("/audio/file/{segment_id}")
def get_audio_file(segment_id: int, db: Session = Depends(get_db), _: dict = _admin):
    segment = db.query(AudioSegment).filter(AudioSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    if not segment.filename or not os.path.exists(segment.filename):
        raise HTTPException(status_code=410, detail="Audio file has expired or been deleted")
    ext = os.path.splitext(segment.filename)[1].lower()
    media_type = _AUDIO_MIME.get(ext, "audio/webm")
    return FileResponse(segment.filename, media_type=media_type)
