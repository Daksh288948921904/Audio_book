from backend.config import GROQ_STT_MODEL
from backend.services.groq_pool import pool


def transcribe(audio_path: str) -> str:
    with open(audio_path, "rb") as f:
        filename = audio_path.split("/")[-1]
        result = pool.transcribe(
            file_tuple=(filename, f.read()),
            model=GROQ_STT_MODEL,
            response_format="text",
        )
    return result.strip() if isinstance(result, str) else result.text.strip()
