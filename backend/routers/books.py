import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.db import get_db, Book, Chapter, AudioSegment
from backend.services.vector_store import delete_collection
from backend.services import manuscript
from backend.auth import get_current_user

router = APIRouter(prefix="/books", tags=["books"])


FRONT_MATTER = {
    "memoir":  ["Dedication", "Epigraph", "Foreword", "Preface", "Author's Note"],
    "fiction": ["Dedication", "Epigraph", "Foreword"],
}
BACK_MATTER = {
    "memoir":  ["Acknowledgements", "A Note on Sources", "About the Author"],
    "fiction": ["Acknowledgements", "About the Author"],
}


def _chapter_row(c: Chapter) -> dict:
    return {
        "id": c.id,
        "book_id": c.book_id,
        "number": c.number,
        "title": c.title,
        "section_type": c.section_type or "chapter",
        "status": c.status,
        "generated_text": c.generated_text,
        "summary": c.summary,
        "from_manuscript": c.base_text is not None,
        "created_at": c.created_at,
        "finished_at": c.finished_at,
    }


_MAX_PDF_BYTES = 50 * 1024 * 1024


def manuscript_info(b: Book) -> dict:
    return {
        "manuscript_filename": b.manuscript_filename,
        "manuscript_status":   b.manuscript_status,
        "manuscript_progress": b.manuscript_progress,
    }


@router.get("/")
def list_books(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    books = (
        db.query(Book)
        .filter(Book.user_id == current_user["sub"])
        .order_by(Book.created_at)
        .all()
    )
    return [
        {
            "id": b.id,
            "title": b.title,
            "genre": b.genre or "fiction",
            "created_at": b.created_at,
            "chapter_count": len(b.chapters),
            "done_count": sum(1 for c in b.chapters if c.status == "done"),
            **manuscript_info(b),
        }
        for b in books
    ]


@router.post("/")
def create_book(
    title: str,
    genre: str = "fiction",
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if genre not in ("fiction", "memoir"):
        genre = "fiction"
    book = Book(title=title, genre=genre, user_id=current_user["sub"])
    db.add(book)
    db.commit()
    db.refresh(book)
    return {"id": book.id, "title": book.title, "genre": book.genre, "created_at": book.created_at, "chapter_count": 0, "done_count": 0}


@router.delete("/all")
def clear_all(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete only the current user's data."""
    user_books = db.query(Book).filter(Book.user_id == current_user["sub"]).all()

    for book in user_books:
        for ch in book.chapters:
            for seg in ch.segments:
                if seg.filename and os.path.exists(seg.filename):
                    try:
                        os.remove(seg.filename)
                    except OSError:
                        pass
            try:
                delete_collection(ch.number)
            except Exception:
                pass

    book_ids = [b.id for b in user_books]
    if book_ids:
        chapter_ids = [
            c.id
            for b in user_books
            for c in b.chapters
        ]
        if chapter_ids:
            db.query(AudioSegment).filter(AudioSegment.chapter_id.in_(chapter_ids)).delete(synchronize_session=False)
        db.query(Chapter).filter(Chapter.book_id.in_(book_ids)).delete(synchronize_session=False)
        db.query(Book).filter(Book.id.in_(book_ids)).delete(synchronize_session=False)

    db.commit()
    return {"status": "cleared"}


@router.delete("/{book_id}")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.user_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Not your book")

    for ch in book.chapters:
        for seg in ch.segments:
            if seg.filename and os.path.exists(seg.filename):
                try:
                    os.remove(seg.filename)
                except OSError:
                    pass
        try:
            delete_collection(ch.number)
        except Exception:
            pass

    db.delete(book)
    db.commit()
    return {"status": "deleted"}


@router.get("/{book_id}/chapters")
def list_book_chapters(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.user_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Not your book")

    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.number).all()
    return [_chapter_row(c) for c in chapters]


@router.post("/{book_id}/chapters")
def create_book_chapters(
    book_id: int,
    count: int,
    include_prologue: bool = False,
    include_epilogue: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if count < 0 or count > 50:
        raise HTTPException(status_code=400, detail="count must be 0–50")

    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.user_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Not your book")

    genre = book.genre or "fiction"
    last = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.number.desc()).first()
    num = (last.number + 1) if last else 1
    sections = []

    def add(title: str | None, stype: str):
        nonlocal num
        ch = Chapter(book_id=book_id, number=num, title=title, section_type=stype, status="recording")
        db.add(ch); sections.append(ch); num += 1

    # Front matter
    for t in FRONT_MATTER.get(genre, FRONT_MATTER["fiction"]):
        add(t, "front_matter")

    # Prologue
    if include_prologue:
        add("Prologue", "chapter")

    # Main chapters (untitled, author names them)
    for _ in range(count):
        add(None, "chapter")

    # Epilogue
    if include_epilogue:
        add("Epilogue", "chapter")

    # Back matter
    for t in BACK_MATTER.get(genre, BACK_MATTER["fiction"]):
        add(t, "back_matter")

    db.commit()
    for ch in sections:
        db.refresh(ch)
    return [_chapter_row(c) for c in sections]


@router.post("/{book_id}/manuscript")
async def upload_manuscript(
    book_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.user_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Not your book")
    if book.manuscript_status == "processing" and manuscript.is_running(book_id):
        raise HTTPException(status_code=409, detail="Chapters are being created from your current manuscript")
    if not (file.filename or "").lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    content = await file.read()
    if len(content) > _MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is larger than 50 MB")
    try:
        text, pages = manuscript.extract_pdf_text(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if len(text.split()) < 50:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this PDF. Scanned/image-only PDFs aren't supported yet.",
        )

    book.manuscript_filename    = file.filename
    book.manuscript_text        = text
    book.manuscript_pages       = pages
    book.manuscript_status      = "uploaded"
    book.manuscript_progress    = None
    book.manuscript_uploaded_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": book.id, **manuscript_info(book)}
