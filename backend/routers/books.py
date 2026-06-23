import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db import get_db, Book, Chapter, AudioSegment
from backend.services.vector_store import delete_collection
from backend.auth import get_current_user

router = APIRouter(prefix="/books", tags=["books"])


def _chapter_row(c: Chapter) -> dict:
    return {
        "id": c.id,
        "book_id": c.book_id,
        "number": c.number,
        "title": c.title,
        "status": c.status,
        "generated_text": c.generated_text,
        "summary": c.summary,
        "created_at": c.created_at,
        "finished_at": c.finished_at,
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
            "created_at": b.created_at,
            "chapter_count": len(b.chapters),
            "done_count": sum(1 for c in b.chapters if c.status == "done"),
        }
        for b in books
    ]


@router.post("/")
def create_book(
    title: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    book = Book(title=title, user_id=current_user["sub"])
    db.add(book)
    db.commit()
    db.refresh(book)
    return {"id": book.id, "title": book.title, "created_at": book.created_at, "chapter_count": 0, "done_count": 0}


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
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if count < 1 or count > 50:
        raise HTTPException(status_code=400, detail="count must be 1–50")

    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.user_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Not your book")

    last = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.number.desc()).first()
    start = (last.number + 1) if last else 1

    chapters = []
    for i in range(count):
        ch = Chapter(book_id=book_id, number=start + i, status="recording")
        db.add(ch)
        chapters.append(ch)
    db.commit()
    for ch in chapters:
        db.refresh(ch)
    return [_chapter_row(c) for c in chapters]
