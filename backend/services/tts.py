"""
Text-to-speech via Groq PlayAI.

Long chapter texts are split at sentence boundaries so no single API call
exceeds the model's input limit. The resulting WAV chunks are joined with
ffmpeg (already in the Docker image for audio preprocessing).
"""

import os
import re
import subprocess
import tempfile
import logging

from backend.services.groq_pool import pool

logger = logging.getLogger(__name__)

TTS_MODEL  = "playai-tts"
TTS_VOICE  = "Fritz-PlayAI"   # warm, clear narrator voice
CHUNK_CHARS = 1800             # safe under the 2000-char API limit


def generate_chapter_audio(text: str) -> bytes:
    """Return WAV bytes for the full chapter text."""
    cleaned = _clean(text)
    chunks  = _split(cleaned, CHUNK_CHARS)
    logger.info("tts: %d chunk(s) for %d chars", len(chunks), len(cleaned))

    if len(chunks) == 1:
        return pool.speech(chunks[0], model=TTS_MODEL, voice=TTS_VOICE)

    tmp_files: list[str] = []
    try:
        for chunk in chunks:
            wav = pool.speech(chunk, model=TTS_MODEL, voice=TTS_VOICE)
            f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            f.write(wav)
            f.close()
            tmp_files.append(f.name)
        return _concat(tmp_files)
    finally:
        for path in tmp_files:
            if os.path.exists(path):
                os.unlink(path)


# ── helpers ──────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Strip markdown artefacts that TTS would read literally."""
    text = re.sub(r"#{1,6}\s*", "", text)          # headings
    text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)  # bold/italic
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # links
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split(text: str, max_chars: int) -> list[str]:
    """Split at sentence end (. ! ?) preserving natural pauses."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    buf = ""
    for sent in sentences:
        if buf and len(buf) + 1 + len(sent) > max_chars:
            chunks.append(buf)
            buf = sent
        else:
            buf = (buf + " " + sent).lstrip() if buf else sent
    if buf:
        chunks.append(buf)
    return chunks or [text]


def _concat(paths: list[str]) -> bytes:
    """Join WAV files via ffmpeg concat demuxer."""
    list_file = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    for p in paths:
        list_file.write(f"file '{p}'\n")
    list_file.close()

    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    out.close()

    try:
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-f", "concat", "-safe", "0",
                "-i", list_file.name,
                "-c", "copy", "-y",
                out.name,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        with open(out.name, "rb") as f:
            return f.read()
    finally:
        os.unlink(list_file.name)
        if os.path.exists(out.name):
            os.unlink(out.name)
