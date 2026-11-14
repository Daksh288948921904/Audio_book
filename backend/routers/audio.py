import asyncio
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db import get_db, SessionLocal, AudioSegment, Chapter, ChapterPart
from backend.services.pipeline import analyze_audio, save_segment
from backend.services.vector_store import delete_chunk_by_segment, add_chunk, ensure_collection
from backend.services import storage
from backend.config import UPLOAD_DIR
from backend.auth import get_current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/audio", tags=["audio"])

os.makedirs(UPLOAD_DIR, exist_ok=True)

_auth = Depends(get_current_user)

# 150 MB is ~2½ hours of browser recording or ~2 hours of 160 kbps MP3/M4A.
# Uncompressed WAV hits it at ~15 minutes.
_MAX_UPLOAD_BYTES = 150 * 1024 * 1024

# Recordings are processed (ffmpeg + transcription) on their own small pool, so a burst
# of long uploads can't take every request thread and freeze the rest of the app, or
# hold dozens of files in memory at once on a 2 GB instance. Past _MAX_WAITING the
# server says it's busy instead of queueing work it can't finish in reasonable time.
_ANALYSIS_WORKERS = int(os.getenv("AUDIO_WORKERS", "4"))
# Uploads in progress (receiving or queued), by count and by declared size. Short voice
# clips can queue in the hundreds; a pile of 150 MB files hits the byte budget first
# (they're spooled to temp disk while they wait).
_MAX_ACTIVE = int(os.getenv("AUDIO_MAX_ACTIVE", "300"))
_MAX_ACTIVE_BYTES = int(os.getenv("AUDIO_MAX_ACTIVE_MB", "2500")) * 1024 * 1024
_analysis_pool = ThreadPoolExecutor(max_workers=_ANALYSIS_WORKERS, thread_name_prefix="audio")
_TOO_LARGE = "Recording is over 150 MB — please export it as MP3 or M4A and upload again."
_BUSY = "Lots of recordings are being processed right now — please try again in a minute."


class UploadGate:
    """ASGI middleware for POST /audio/upload/*, applied before the body is read: refuses
    oversized bodies by Content-Length, and answers 503 when too many uploads (or bytes)
    are already in progress. Without it every upload is spooled to disk in full before
    the handler could say no."""

    def __init__(self, app):
        self.app = app
        self.active = 0        # single event loop: no lock needed
        self.active_bytes = 0

    async def __call__(self, scope, receive, send):
        if not (scope["type"] == "http" and scope["method"] == "POST"
                and scope["path"].startswith("/audio/upload/")):
            return await self.app(scope, receive, send)
        length = dict(scope["headers"]).get(b"content-length", b"")
        size = int(length) if length.isdigit() else _MAX_UPLOAD_BYTES  # unknown: assume the worst
        if size > _MAX_UPLOAD_BYTES + 1024 * 1024:  # + multipart framing
            return await JSONResponse({"detail": _TOO_LARGE}, status_code=413)(scope, receive, send)
        if self.active >= _MAX_ACTIVE or (self.active and self.active_bytes + size > _MAX_ACTIVE_BYTES):
            return await JSONResponse({"detail": _BUSY}, status_code=503,
                                      headers={"Retry-After": "30"})(scope, receive, send)
        self.active += 1
        self.active_bytes += size
        try:
            await self.app(scope, receive, send)
        finally:
            self.active -= 1
            self.active_bytes -= size


# Uploads to the same chapter run one at a time so order_index stays unique and in arrival order.
# Single gunicorn worker, so an in-process lock is enough.
_chapter_locks: dict[int, threading.Lock] = defaultdict(threading.Lock)
_chapter_locks_guard = threading.Lock()


def _chapter_lock(chapter_id: int) -> threading.Lock:
    with _chapter_locks_guard:
        return _chapter_locks[chapter_id]


def _owned(db: Session, chapter_id: int, user: dict) -> Chapter:
    from backend.routers.chapters import owned_chapter  # chapters imports this module
    return owned_chapter(db, chapter_id, user)


def _owned_segment(db: Session, segment_id: int, user: dict) -> tuple[AudioSegment, Chapter]:
    segment = db.query(AudioSegment).filter(AudioSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    try:
        chapter = _owned(db, segment.chapter_id, user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Segment not found")
    return segment, chapter


def _safe_name(filename: str | None) -> str:
    """Basename with only harmless characters — it becomes part of a storage path."""
    base = os.path.basename((filename or "").replace("\\", "/")) or "audio.webm"
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")[:60] or "audio"
    ext = re.sub(r"[^A-Za-z0-9.]", "", ext)[:8] or ".webm"
    return stem + ext


def _has_audio_stream(path: str) -> bool:
    """False when ffprobe finds no audio in the file (empty, corrupt, not audio).
    True if ffprobe itself isn't available — transcription will be the judge then."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
             "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=60,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True
    return "audio" in out.stdout


@router.post("/upload/{chapter_id}")
async def upload_audio(
    chapter_id: int,
    file: UploadFile = File(...),
    part_id: int | None = None,  # an added part of the chapter; None = part 1
    user: dict = _auth,
):
    # The body is already spooled to disk by the multipart parser (UploadGate has
    # turned away obviously oversized or excess uploads before that).
    if file.size is not None and file.size > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=_TOO_LARGE)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _analysis_pool, _process_upload, chapter_id, user, file.filename, file.content_type, file.file, part_id,
    )


def _process_upload(chapter_id: int, user: dict, filename: str | None, content_type: str | None,
                    src, part_id: int | None = None) -> dict:
    db = SessionLocal()
    tmp_path = None
    try:
        chapter = _owned(db, chapter_id, user)
        if part_id is not None and not db.query(ChapterPart).filter(
            ChapterPart.id == part_id, ChapterPart.chapter_id == chapter_id
        ).first():
            raise HTTPException(status_code=404, detail="Part not found")
        if chapter.status != "recording":
            raise HTTPException(status_code=400, detail="Chapter is not in recording state")
        db.commit()  # release the pooled connection before the slow part (minutes for long audio)

        # Copy to a real file — ffmpeg and Whisper need a path. Streamed, never all in memory.
        name = _safe_name(filename)
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(name)[1], delete=False) as tmp:
            tmp_path = tmp.name
            src.seek(0)
            shutil.copyfileobj(src, tmp, 1024 * 1024)
            size = tmp.tell()
        if size > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=_TOO_LARGE)
        if size == 0 or not _has_audio_stream(tmp_path):
            raise HTTPException(
                status_code=400,
                detail="We couldn't read any audio in this file. Please upload a recording (MP3, M4A, WAV, WebM…).",
            )

        # Transcribe outside the lock — a long recording takes minutes and would
        # hold up every other upload to this chapter.
        transcript, intent_label = analyze_audio(tmp_path)
        with _chapter_lock(chapter_id):
            db.refresh(chapter)
            if chapter.status != "recording":
                raise HTTPException(
                    status_code=409,
                    detail="This chapter started being written while your recording was processing — reopen it and upload again.",
                )
            last = db.query(func.max(AudioSegment.order_index)).filter(AudioSegment.chapter_id == chapter_id).scalar()
            order_index = (last or 0) + 1
            segment = save_segment(db, chapter, tmp_path, transcript, intent_label, order_index, part_id)

        # The transcript is saved — from here on nothing may fail the request, or the
        # author would retry and get the recording twice. Keeping the audio is best-effort.
        object_name = f"ch{chapter_id}_seg{order_index}_{uuid.uuid4().hex[:8]}_{name}"
        try:
            if storage.enabled():
                segment.filename = storage.upload_file(object_name, tmp_path, content_type or "audio/webm")
            else:
                perm_path = os.path.join(UPLOAD_DIR, object_name)
                shutil.move(tmp_path, perm_path)
                tmp_path = None  # moved, don't delete
                segment.filename = perm_path
        except Exception:
            log.exception("upload: keeping audio for segment %s failed; transcript kept", segment.id)
            segment.filename = ""
            segment.file_expires_at = None
        db.commit()

        return {
            "id": segment.id,
            "order_index": segment.order_index,
            "transcript": segment.transcript,
            "intent": segment.intent,
            "filename": segment.filename,
            "has_audio": bool(segment.filename),
            "part_id": segment.part_id,
        }
    finally:
        db.close()
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def delete_segment_files(chapter: Chapter, segment: AudioSegment) -> None:
    """Remove a recording's vector chunk and stored audio (the DB row is the caller's).
    Best-effort: a storage or Qdrant hiccup must not block deleting the recording."""
    try:
        delete_chunk_by_segment(chapter.number, segment.id)
    except Exception:
        log.warning("delete: vector chunk for segment %s not removed", segment.id, exc_info=True)
    try:
        if segment.filename:
            if storage.is_remote(segment.filename):
                storage.delete(storage.path_from_url(segment.filename))
            elif os.path.exists(segment.filename):
                os.remove(segment.filename)
    except Exception:
        log.warning("delete: audio file for segment %s not removed", segment.id, exc_info=True)


@router.delete("/segments/{segment_id}")
def delete_segment(segment_id: int, db: Session = Depends(get_db), user: dict = _auth):
    segment, chapter = _owned_segment(db, segment_id, user)
    if chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Cannot delete segment after chapter is finalized")

    delete_segment_files(chapter, segment)
    db.delete(segment)
    db.commit()
    return {"status": "deleted", "segment_id": segment_id}


@router.get("/segments/{chapter_id}")
def get_segments(chapter_id: int, db: Session = Depends(get_db), user: dict = _auth):
    _owned(db, chapter_id, user)
    segments = (
        db.query(AudioSegment)
        .filter(AudioSegment.chapter_id == chapter_id)
        .order_by(AudioSegment.order_index)
        .all()
    )
    return [
        {"id": s.id, "order_index": s.order_index, "transcript": s.transcript,
         "intent": s.intent, "filename": s.filename, "has_audio": bool(s.filename),
         "part_id": s.part_id}
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
def get_audio_file(segment_id: int, db: Session = Depends(get_db), user: dict = _auth):
    segment, _ = _owned_segment(db, segment_id, user)
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
def reorder_segments(body: ReorderBody, db: Session = Depends(get_db), user: dict = _auth):
    chapter = _owned(db, body.chapter_id, user)
    if chapter.status != "recording":
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
def move_segment(segment_id: int, body: MoveBody, db: Session = Depends(get_db), user: dict = _auth):
    segment, old_chapter = _owned_segment(db, segment_id, user)
    new_chapter = _owned(db, body.target_chapter_id, user)
    if new_chapter.status != "recording":
        raise HTTPException(status_code=400, detail="Target chapter not in recording state")

    # Move Qdrant chunk: remove from old collection, add to new
    try:
        delete_chunk_by_segment(old_chapter.number, segment_id)
        ensure_collection(new_chapter.number)
        add_chunk(new_chapter.number, segment.transcript or "", segment.intent or "informational",
                  chunk_type="segment", segment_id=segment_id)
    except Exception:
        pass  # vector store errors shouldn't block the move

    with _chapter_lock(body.target_chapter_id):
        _move_into(db, segment, body.target_chapter_id)
    db.refresh(segment)

    return {
        "id": segment.id, "order_index": segment.order_index,
        "transcript": segment.transcript, "intent": segment.intent,
        "filename": segment.filename, "has_audio": bool(segment.filename),
        "chapter_id": segment.chapter_id,
    }


def _move_into(db: Session, segment: AudioSegment, target_chapter_id: int) -> None:
    last = db.query(func.max(AudioSegment.order_index)).filter(AudioSegment.chapter_id == target_chapter_id).scalar()
    new_order = (last or 0) + 1
    segment.chapter_id = target_chapter_id
    segment.order_index = new_order
    segment.part_id = None  # parts belong to the old chapter; join the new one's first part
    db.commit()
