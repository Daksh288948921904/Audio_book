"""
Audio preprocessing pipeline for improved STT accuracy.

Steps (in order):
  1. High-pass filter at 80 Hz   — removes desk rumble, AC hum, handling noise
  2. Low-pass filter at 8 kHz    — strips ultrasonic noise above the voice range
  3. EBU R128 loudness normalise  — two-pass loudnorm to −16 LUFS so every
                                    recording hits Whisper at a consistent level
  4. Resample to 16 kHz mono     — Whisper's native format; saves ~75 % bandwidth

Requires ffmpeg in PATH (installed in Dockerfile).
Falls back silently to the original file on any error so STT still runs.
"""

import json
import logging
import os
import re
import subprocess

logger = logging.getLogger(__name__)

_TARGET_I   = "-16"   # integrated loudness (LUFS)
_TARGET_LRA = "11"    # loudness range
_TARGET_TP  = "-1.5"  # true peak (dBFS)


def preprocess_audio(src_path: str) -> str | None:
    """
    Return path to a processed 16 kHz mono WAV, or None if preprocessing fails.
    The caller should fall back to src_path when None is returned.
    The returned file is a temp file — caller is responsible for deleting it.
    """
    dst_path = src_path + "_clean.wav"

    try:
        af_pass2 = _build_filter(src_path)

        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-y", "-i", src_path,
                "-af", af_pass2,
                "-ac", "1",
                "-ar", "16000",
                "-c:a", "pcm_s16le",
                dst_path,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )

        logger.info("audio_preprocess: %s -> %s (ok)", src_path, dst_path)
        return dst_path

    except Exception as exc:
        logger.warning("audio_preprocess failed, using original: %s", exc)
        if os.path.exists(dst_path):
            os.unlink(dst_path)
        return None


# ── internals ────────────────────────────────────────────────────────────────

def _build_filter(src_path: str) -> str:
    """
    Run loudnorm pass-1 to measure the file's integrated loudness, then build a
    linear two-pass loudnorm filter string. Falls back to single-pass on error.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner",
                "-i", src_path,
                "-af", f"loudnorm=I={_TARGET_I}:LRA={_TARGET_LRA}:TP={_TARGET_TP}:print_format=json",
                "-f", "null", "-",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        stats = _parse_loudnorm_json(result.stderr)
        if stats:
            loudnorm = (
                f"loudnorm=I={_TARGET_I}:LRA={_TARGET_LRA}:TP={_TARGET_TP}"
                f":measured_I={stats['input_i']}"
                f":measured_LRA={stats['input_lra']}"
                f":measured_TP={stats['input_tp']}"
                f":measured_thresh={stats['input_thresh']}"
                f":offset={stats['target_offset']}"
                f":linear=true"
            )
            logger.debug("loudnorm stats: %s", stats)
        else:
            loudnorm = f"loudnorm=I={_TARGET_I}:LRA={_TARGET_LRA}:TP={_TARGET_TP}"

    except Exception as exc:
        logger.warning("loudnorm pass-1 failed (%s), using single-pass", exc)
        loudnorm = f"loudnorm=I={_TARGET_I}:LRA={_TARGET_LRA}:TP={_TARGET_TP}"

    return f"highpass=f=80,lowpass=f=8000,{loudnorm}"


def _parse_loudnorm_json(stderr: str) -> dict | None:
    """ffmpeg prints the loudnorm JSON block to stderr — extract it."""
    try:
        match = re.search(r"\{[^{}]+\}", stderr, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group())
    except Exception:
        return None
