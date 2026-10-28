import os
import tempfile
import threading
import uuid
from collections import defaultdict
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.db import get_db, AudioSegment, Chapter
from backend.services.pipeline import analyze_audio, save_segment
from backend.services.vector_store import delete_chunk_by_segment, add_chunk, ensure_collection
from backend.services import storage
from backend.config import UPLOAD_DIR
from backend.auth import get_current_user

router = APIRouter(prefix="/audio", tags=["audio"])

os.makedirs(UPLOAD_DIR, exist_ok=True)

_auth = Depends(get_current_user)

# Uploads are held in memory; 150 MB is ~2½ hours of browser recording or ~2 hours of
# 160 kbps MP3/M4A. Uncompressed WAV hits it at ~15 minutes.
_MAX_UPLOAD_BYTES = 150 * 1024 * 1024


# Uploads to the same chapter run one at a time so order_index stays unique and in arrival order.
# Single gunicorn worker, so an in-process lock is enough.
_chapter_locks: dict[int, threading.Lock] = defaultdict(threading.Lock)
_chapter_locks_guard = threading.Lock()


def _chapter_lock(chapter_id: int) -> threading.Lock:
    with _chapter_locks_guard:
        return _chapter_locks[chapter_id]


@router.post("/upload/{chapter_id}")
async def upload_audio(
    chapter_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: dict = _auth,
):
    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Recording is over 150 MB — please export it as MP3 or M4A and upload again.",
        )
    # ffmpeg + transcription + embedding + storage take seconds; doing them on the event
    # loop froze every other request on the (single) worker and got it killed under load.
    return await run_in_threadpool(_process_upload, db, chapter_id, file.filename, file.content_type, content)


def _process_upload(db: Session, chapter_id: int, filename: str | None, content_type: str | None, content: bytes) -> dict:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Chapter is not in recording state")

    # Always write to a local temp file first — pipeline (ffmpeg + Whisper) needs a real path
    suffix = os.path.splitext(filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Transcribe outside the lock — a long recording takes minutes and would
        # hold up every other upload to this chapter.
        transcript, intent_label = analyze_audio(tmp_path)
        db.commit()  # don't hold a pooled connection across the slow part
        with _chapter_lock(chapter_id):
            db.refresh(chapter)
            if chapter.status != "recording":
                raise HTTPException(
                    status_code=409,
                    detail="This chapter started being written while your recording was processing — reopen it and upload again.",
                )
            last = db.query(func.max(AudioSegment.order_index)).filter(AudioSegment.chapter_id == chapter_id).scalar()
            order_index = (last or 0) + 1
            segment = save_segment(db, chapter, tmp_path, transcript, intent_label, order_index)

        # Unique name: order_index alone can repeat after a delete, and storage upserts.
        object_name = f"ch{chapter_id}_seg{order_index}_{uuid.uuid4().hex[:8]}_{filename}"

        # After pipeline succeeds, upload to Supabase and update filename in DB
        if storage.enabled():
            remote_url = storage.upload(object_name, content, content_type or "audio/webm")
            segment.filename = remote_url
            db.commit()
        else:
            # Move temp file to permanent local path
            perm_path = os.path.join(UPLOAD_DIR, object_name)
            os.replace(tmp_path, perm_path)
            segment.filename = perm_path
            db.commit()
            tmp_path = None  # already moved, don't delete
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

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

    if segment.filename:
        if storage.is_remote(segment.filename):
            storage.delete(storage.path_from_url(segment.filename))
        elif os.path.exists(segment.filename):
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
    if not segment.filename:
        raise HTTPException(status_code=410, detail="Audio file has expired or been deleted")
    if storage.is_remote(segment.filename):
        return RedirectResponse(segment.filename)
    if not os.path.exists(segment.filename):
        raise HTTPException(status_code=410, detail="Audio file has expired or been deleted")
    ext = os.path.splitext(segment.filename)[1].lower()
    media_type = _AUDIO_MIME.get(ext, "audio/webm")
    return FileResponse(segment.filename, media_type=media_type)


class ReorderBody(BaseModel):
    chapter_id: int
    segment_ids: List[int]


@router.patch("/segments/reorder")
def reorder_segments(body: ReorderBody, db: Session = Depends(get_db), _: dict = _auth):
    chapter = db.query(Chapter).filter(Chapter.id == body.chapter_id).first()
    if not chapter or chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Chapter not in recording state")
    for new_index, seg_id in enumerate(body.segment_ids, start=1):
        db.query(AudioSegment).filter(
            AudioSegment.id == seg_id,
            AudioSegment.chapter_id == body.chapter_id,
        ).update({"order_index": new_index})
    db.commit()
    return {"status": "ok"}


class MoveBody(BaseModel):
    target_chapter_id: int


@router.patch("/segments/{segment_id}/move")
def move_segment(segment_id: int, body: MoveBody, db: Session = Depends(get_db), _: dict = _auth):
    segment = db.query(AudioSegment).filter(AudioSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    old_chapter = db.query(Chapter).filter(Chapter.id == segment.chapter_id).first()
    new_chapter = db.query(Chapter).filter(Chapter.id == body.target_chapter_id).first()
    if not new_chapter or new_chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Target chapter not in recording state")

    # Move Qdrant chunk: remove from old collection, add to new
    try:
        delete_chunk_by_segment(old_chapter.number, segment_id)
        ensure_collection(new_chapter.number)
        add_chunk(new_chapter.number, segment.transcript or "", segment.intent or "informational",
                  chunk_type="segment", segment_id=segment_id)
    except Exception:
        pass  # vector store errors shouldn't block the move

    last = db.query(func.max(AudioSegment.order_index)).filter(AudioSegment.chapter_id == body.target_chapter_id).scalar()
    new_order = (last or 0) + 1
    segment.chapter_id = body.target_chapter_id
    segment.order_index = new_order
    db.commit()
    db.refresh(segment)

    return {
        "id": segment.id, "order_index": segment.order_index,
        "transcript": segment.transcript, "intent": segment.intent,
        "filename": segment.filename, "has_audio": bool(segment.filename),
        "chapter_id": segment.chapter_id,
    }
