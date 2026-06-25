import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import get_db, Chapter, AudioSegment
from backend.services.pipeline import finish_chapter
from backend.services.vector_store import delete_collection
from backend.auth import get_current_user

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
        "summary": chapter.summary, "created_at": chapter.created_at,
        "finished_at": chapter.finished_at,
    }


@router.post("/{chapter_id}/finish")
def finish(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail=f"Chapter status is '{chapter.status}', expected 'recording'")
    generated_text, _ = finish_chapter(db, chapter_id)
    return {"status": "done", "generated_text": generated_text}


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
