import os
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.db import get_db, AudioSegment, Chapter
from backend.services.pipeline import process_audio_segment
from backend.services.vector_store import delete_chunk_by_segment
from backend.config import UPLOAD_DIR
from backend.auth import get_current_user

router = APIRouter(prefix="/audio", tags=["audio"])

os.makedirs(UPLOAD_DIR, exist_ok=True)

_auth = Depends(get_current_user)


@router.post("/upload/{chapter_id}")
async def upload_audio(
    chapter_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: dict = _auth,
):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Chapter is not in recording state")

    existing_count = db.query(AudioSegment).filter(AudioSegment.chapter_id == chapter_id).count()
    order_index = existing_count + 1

    filename = f"ch{chapter_id}_seg{order_index}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    segment = process_audio_segment(db, chapter_id, file_path, order_index)

    return {
        "id": segment.id,
        "order_index": segment.order_index,
        "transcript": segment.transcript,
        "intent": segment.intent,
        "filename": segment.filename,
        "has_audio": bool(segment.filename),
    }


@router.delete("/segments/{segment_id}")
def delete_segment(segment_id: int, db: Session = Depends(get_db), _: dict = _auth):
    segment = db.query(AudioSegment).filter(AudioSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    chapter = db.query(Chapter).filter(Chapter.id == segment.chapter_id).first()
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Cannot delete segment after chapter is finalized")

    delete_chunk_by_segment(chapter.number, segment_id)

    if os.path.exists(segment.filename):
        os.remove(segment.filename)

    db.delete(segment)
    db.commit()
    return {"status": "deleted", "segment_id": segment_id}


@router.get("/segments/{chapter_id}")
def get_segments(chapter_id: int, db: Session = Depends(get_db), _: dict = _auth):
    segments = (
        db.query(AudioSegment)
        .filter(AudioSegment.chapter_id == chapter_id)
        .order_by(AudioSegment.order_index)
        .all()
    )
    return [
        {"id": s.id, "order_index": s.order_index, "transcript": s.transcript,
         "intent": s.intent, "filename": s.filename, "has_audio": bool(s.filename)}
        for s in segments
    ]


_AUDIO_MIME: dict[str, str] = {
    ".webm": "audio/webm",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".mp4":  "audio/mp4",
}


@router.get("/file/{segment_id}")
def get_audio_file(segment_id: int, db: Session = Depends(get_db), _: dict = _auth):
    segment = db.query(AudioSegment).filter(AudioSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    if not segment.filename or not os.path.exists(segment.filename):
        raise HTTPException(status_code=410, detail="Audio file has expired or been deleted")
    ext = os.path.splitext(segment.filename)[1].lower()
    media_type = _AUDIO_MIME.get(ext, "audio/webm")
    return FileResponse(segment.filename, media_type=media_type)
