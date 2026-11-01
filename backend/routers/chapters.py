import os
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.db import get_db, Book, Chapter, ChapterPart, AudioSegment
from backend.services import pipeline, manuscript
from backend.routers.audio import delete_segment_files
from backend.services.vector_store import delete_collection
from backend.auth import get_current_user, require_admin

router = APIRouter(prefix="/chapters", tags=["chapters"])

_auth = Depends(get_current_user)


class TextUpdate(BaseModel):
    text: str


@router.post("/bulk")
def create_chapters_bulk(count: int, db: Session = Depends(get_db), _: dict = _auth):
    if count < 1 or count > 50:
        raise HTTPException(status_code=400, detail="count must be 1–50")
    last = db.query(Chapter).order_by(Chapter.number.desc()).first()
    start = (last.number + 1) if last else 1
    created = []
    for i in range(count):
        ch = Chapter(number=start + i, status="recording")
        db.add(ch)
        created.append(ch)
    db.commit()
    for ch in created:
        db.refresh(ch)
    return [{"id": c.id, "number": c.number, "title": c.title, "status": c.status} for c in created]


@router.post("/")
def create_chapter(title: str | None = None, db: Session = Depends(get_db), _: dict = _auth):
    last = db.query(Chapter).order_by(Chapter.number.desc()).first()
    number = (last.number + 1) if last else 1
    chapter = Chapter(number=number, title=title, status="recording")
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return {"id": chapter.id, "number": chapter.number, "title": chapter.title, "status": chapter.status}


@router.get("/")
def list_chapters(db: Session = Depends(get_db), _: dict = _auth):
    chapters = db.query(Chapter).order_by(Chapter.number).all()
    return [
        {"id": c.id, "number": c.number, "title": c.title, "status": c.status,
         "created_at": c.created_at, "finished_at": c.finished_at}
        for c in chapters
    ]


@router.get("/{chapter_id}")
def get_chapter(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {
        "id": chapter.id, "number": chapter.number, "title": chapter.title,
        "status": chapter.status, "generated_text": chapter.generated_text,
        "summary": chapter.summary, "from_manuscript": chapter.base_text is not None,
        "pdf_filename": chapter.pdf_filename if chapter.pdf_text else None,
        "has_written": bool(chapter.written_text),
        "parts": part_rows(chapter),
        "created_at": chapter.created_at,
        "finished_at": chapter.finished_at,
    }


_MAX_CHAPTER_PDF_BYTES = 20 * 1024 * 1024
# ~25k words — a long chapter. A whole book belongs in the book-level manuscript upload.
_MAX_CHAPTER_PDF_CHARS = 150_000


def part_rows(chapter: Chapter) -> list[dict]:
    """Parts 2, 3, … of a chapter (part 1 is the chapter's own fields)."""
    return [
        {"id": p.id, "position": p.position,
         "pdf_filename": p.pdf_filename if p.pdf_text else None,
         "has_written": bool(p.written_text)}
        for p in chapter.parts
    ]


def has_own_text(chapter: Chapter) -> bool:
    """Any attached PDF or typed text, in any part — enough to write the chapter."""
    return bool(chapter.pdf_text or chapter.written_text
                or any(p.pdf_text or p.written_text for p in chapter.parts))


def _target(db: Session, chapter: Chapter, part_id: int | None):
    """The chapter itself (part 1) or one of its added parts — both carry pdf_* and written_text."""
    if part_id is None:
        return chapter
    part = db.query(ChapterPart).filter(ChapterPart.id == part_id, ChapterPart.chapter_id == chapter.id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


def _own_recording_chapter(db: Session, chapter_id: int, user: dict) -> Chapter:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    book = db.query(Book).filter(Book.id == chapter.book_id).first() if chapter.book_id else None
    if book and book.user_id != user["sub"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Not your book")
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Chapter is not in recording state")
    return chapter


@router.post("/{chapter_id}/pdf")
async def upload_chapter_pdf(
    chapter_id: int,
    file: UploadFile = File(...),
    part_id: int | None = None,
    db: Session = Depends(get_db),
    user: dict = _auth,
):
    """Attach the author's written text for this chapter (or one of its parts). It's
    polished and placed at the start of the part when written; recordings continue after it."""
    chapter = _own_recording_chapter(db, chapter_id, user)
    target = _target(db, chapter, part_id)
    if not (file.filename or "").lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    content = await file.read(_MAX_CHAPTER_PDF_BYTES + 1)
    if len(content) > _MAX_CHAPTER_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is larger than 20 MB")
    try:
        text, pages = await run_in_threadpool(manuscript.extract_pdf_text, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    words = len(text.split())
    if words < 20:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this PDF. Scanned/image-only PDFs aren't supported yet.",
        )
    if len(text) > _MAX_CHAPTER_PDF_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"This PDF has {words:,} words — too long for one chapter. "
                   "For a whole book, use \"Upload Manuscript PDF\" at the top of the book.",
        )
    target.pdf_filename = file.filename or "chapter.pdf"
    target.pdf_text = text
    db.commit()
    return {"id": chapter.id, "pdf_filename": target.pdf_filename, "pages": pages, "words": words}


@router.delete("/{chapter_id}/pdf")
def remove_chapter_pdf(chapter_id: int, part_id: int | None = None, db: Session = Depends(get_db), user: dict = _auth):
    chapter = _own_recording_chapter(db, chapter_id, user)
    target = _target(db, chapter, part_id)
    target.pdf_filename = None
    target.pdf_text = None
    db.commit()
    return {"id": chapter.id, "pdf_filename": None}


@router.get("/{chapter_id}/written")
def get_written_text(chapter_id: int, part_id: int | None = None, db: Session = Depends(get_db), user: dict = _auth):
    chapter = _own_recording_chapter(db, chapter_id, user)
    return {"text": _target(db, chapter, part_id).written_text or ""}


@router.put("/{chapter_id}/written")
def save_written_text(chapter_id: int, body: TextUpdate, part_id: int | None = None,
                      db: Session = Depends(get_db), user: dict = _auth):
    """Save what the author typed for this chapter (or part); empty clears it. Handled
    like an attached PDF and placed after it, then the part's recordings."""
    chapter = _own_recording_chapter(db, chapter_id, user)
    target = _target(db, chapter, part_id)
    text = body.text.strip()
    if len(text) > _MAX_CHAPTER_PDF_CHARS:
        raise HTTPException(status_code=413, detail="This is too long for one chapter")
    target.written_text = text or None
    db.commit()
    return {"id": chapter.id, "has_written": bool(target.written_text)}


@router.post("/{chapter_id}/parts")
def add_part(chapter_id: int, db: Session = Depends(get_db), user: dict = _auth):
    """"+ Add more": a new part after the existing ones, with its own audio, PDF and text."""
    chapter = _own_recording_chapter(db, chapter_id, user)
    last = max((p.position for p in chapter.parts), default=1)
    part = ChapterPart(chapter_id=chapter.id, position=last + 1)
    db.add(part)
    db.commit()
    return {"id": chapter.id, "parts": part_rows(chapter)}


@router.delete("/{chapter_id}/parts/{part_id}")
def remove_part(chapter_id: int, part_id: int, db: Session = Depends(get_db), user: dict = _auth):
    """Remove a part with its PDF, text and recordings."""
    chapter = _own_recording_chapter(db, chapter_id, user)
    part = _target(db, chapter, part_id)
    for seg in db.query(AudioSegment).filter(AudioSegment.part_id == part.id).all():
        delete_segment_files(chapter, seg)
        db.delete(seg)
    db.delete(part)
    db.commit()
    db.refresh(chapter)
    return {"id": chapter.id, "parts": part_rows(chapter)}


@router.post("/{chapter_id}/finish", status_code=202)
def finish(chapter_id: int, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status == "done":
        raise HTTPException(status_code=400, detail="Chapter is already done")
    # Generation runs in the background (long chapters take many minutes); poll the
    # chapter until its status leaves "generating". A chapter shown as "generating"
    # but not queued (shouldn't happen — restarts re-queue) is simply queued again.
    if not pipeline.enqueue(db, [chapter_id]):
        raise HTTPException(status_code=409, detail="Chapter is already being written")
    return {"status": "generating"}


@router.get("/{chapter_id}/pdf")
def download_pdf(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "done" or not chapter.generated_text:
        raise HTTPException(status_code=400, detail="Chapter not yet generated")
    from backend.services.pdf import generate_pdf
    pdf_bytes = generate_pdf(chapter.number, chapter.title, chapter.generated_text)
    filename = f"chapter_{chapter.number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{chapter_id}/text")
def update_text(chapter_id: int, body: TextUpdate, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "done":
        raise HTTPException(status_code=400, detail="Chapter not yet generated")
    chapter.generated_text = body.text
    if chapter.base_text is not None and not chapter.segments:
        chapter.base_text = body.text  # keep edits when audio is added later
    db.commit()
    return {"status": "updated"}


@router.delete("/{chapter_id}")
def delete_chapter(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    segments = db.query(AudioSegment).filter(AudioSegment.chapter_id == chapter_id).all()
    for seg in segments:
        if seg.filename and os.path.exists(seg.filename):
            os.remove(seg.filename)
    delete_collection(chapter.number)
    db.delete(chapter)
    db.commit()
    return {"status": "deleted", "chapter_id": chapter_id}


@router.patch("/{chapter_id}/reopen")
def reopen_chapter(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter.status = "recording"
    chapter.finished_at = None
    db.commit()
    return {"id": chapter.id, "status": chapter.status}


@router.patch("/{chapter_id}/title")
def update_title(chapter_id: int, title: str, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter.title = title
    db.commit()
    return {"id": chapter.id, "title": chapter.title}
