import glob
import logging
import os
import shutil
import subprocess
import tempfile
import time

from backend.config import GROQ_STT_MODEL
from backend.services.groq_pool import pool

log = logging.getLogger(__name__)

# Groq rejects audio files over 25 MB. Preprocessed audio is 16 kHz mono WAV
# (~1.9 MB/min), so anything past ~13 minutes is cut into 10-minute pieces.
_MAX_BYTES = 24 * 1024 * 1024
_PIECE_SECONDS = 600
_RETRY_WAITS = (20, 40, 60)


def transcribe(audio_path: str) -> str:
    if os.path.getsize(audio_path) <= _MAX_BYTES:
        return _transcribe_file(audio_path)

    tmpdir = tempfile.mkdtemp(prefix="stt_")
    try:
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", audio_path,
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                "-f", "segment", "-segment_time", str(_PIECE_SECONDS),
                os.path.join(tmpdir, "part_%03d.wav"),
            ],
            check=True, capture_output=True, timeout=900,
        )
        pieces = sorted(glob.glob(os.path.join(tmpdir, "part_*.wav")))
        log.info("transcribe: %s split into %d pieces", audio_path, len(pieces))
        return " ".join(t for t in (_transcribe_file(p) for p in pieces) if t)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _transcribe_file(path: str) -> str:
    with open(path, "rb") as f:
        data = f.read()
    filename = os.path.basename(path)
    for attempt, wait in enumerate((*_RETRY_WAITS, None)):
        try:
            result = pool.transcribe(
                file_tuple=(filename, data),
                model=GROQ_STT_MODEL,
                response_format="text",
            )
            return result.strip() if isinstance(result, str) else result.text.strip()
        except RuntimeError:
            # Every key is rate-limited (Groq caps audio-seconds per hour) — wait it out.
            if wait is None:
                raise
            log.warning("transcribe: all keys rate-limited, retry %d in %ds", attempt + 1, wait)
            time.sleep(wait)
