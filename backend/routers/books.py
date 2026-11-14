import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.db import get_db, Book, Chapter
import logging

from backend.services import storage, vector_store
from backend.services import manuscript
from backend.auth import get_current_user
from backend.routers.chapters import part_rows, MAX_TITLE_CHARS

log = logging.getLogger(__name__)

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
        "pdf_filename": c.pdf_filename if c.pdf_text else None,
        "has_written": bool(c.written_text),
        "parts": part_rows(c),
        "published_at": c.published_at,
        "created_at": c.created_at,
        "finished_at": c.finished_at,
    }


_MAX_PDF_BYTES = 50 * 1024 * 1024


def chapter_counts(db: Session, book_ids: list[int]) -> dict[int, tuple[int, int]]:
    """{book_id: (chapters, done)} in one query — without loading every chapter's text."""
    if not book_ids:
        return {}
    rows = (
        db.query(Chapter.book_id, func.count(Chapter.id),
                 func.sum(case((Chapter.status == "done", 1), else_=0)))
        .filter(Chapter.book_id.in_(book_ids))
        .group_by(Chapter.book_id)
        .all()
    )
    return {bid: (int(n), int(done or 0)) for bid, n, done in rows}


def manuscript_info(b: Book) -> dict:
    return {
        "manuscript_filename": b.manuscript_filename,
        "manuscript_status":   b.manuscript_status,
        "manuscript_progress": b.manuscript_progress,
    }


def _purge_book_files(book: Book) -> None:
    """Best-effort removal of a book's stored audio and vector points (DB rows are the caller's)."""
    remote: list[str] = []
    for ch in book.chapters:
        for seg in ch.segments:
            if not seg.filename:
                continue
            if storage.is_remote(seg.filename):
                remote.append(storage.path_from_url(seg.filename))
            elif os.path.exists(seg.filename):
                try:
                    os.remove(seg.filename)
                except OSError:
                    pass
        try:
            vector_store.delete_segments(ch.number, [seg.id for seg in ch.segments])
        except Exception:
            log.warning("delete book %s: vector points for chapter %s not removed", book.id, ch.id, exc_info=True)
    if remote:
        try:
            storage.delete_many(remote)
        except Exception:
            log.warning("delete book %s: %d stored recordings not removed", book.id, len(remote), exc_info=True)


def _clean_title(title: str) -> str:
    title = " ".join(title.split())
    if not title:
        raise HTTPException(status_code=422, detail="Please give the book a title")
    if len(title) > MAX_TITLE_CHARS:
        raise HTTPException(status_code=422, detail=f"Title must be at most {MAX_TITLE_CHARS} characters")
    return title


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
    counts = chapter_counts(db, [b.id for b in books])
    return [
        {
            "id": b.id,
            "title": b.title,
            "genre": b.genre or "fiction",
            "created_at": b.created_at,
            "chapter_count": counts.get(b.id, (0, 0))[0],
            "done_count": counts.get(b.id, (0, 0))[1],
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
    title = _clean_title(title)
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
        _purge_book_files(book)
        db.delete(book)  # ORM cascade: chapters → parts, recordings
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

    _purge_book_files(book)
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
        text, pages = await run_in_threadpool(manuscript.extract_pdf_text, content)
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
