import threading
import logging
from groq import Groq, RateLimitError, APIStatusError
from backend.config import GROQ_API_KEYS

logger = logging.getLogger(__name__)


class GroqPool:
    """
    Round-robin Groq client pool. On RateLimitError, rotates to the next key
    and retries until all keys are tried, then raises.
    """

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise RuntimeError("No Groq API keys configured. Set GROQ_API_KEY_1 … in .env")
        self._keys = keys
        self._index = 0
        self._lock = threading.Lock()
        self._clients = [Groq(api_key=k) for k in keys]
        logger.info("GroqPool initialised with %d key(s)", len(keys))

    def _current(self) -> Groq:
        return self._clients[self._index]

    def _rotate(self) -> None:
        with self._lock:
            old = self._index
            self._index = (self._index + 1) % len(self._keys)
            logger.warning("Groq key #%d rate-limited — rotating to key #%d", old + 1, self._index + 1)

    def chat(self, **kwargs):
        for _ in range(len(self._keys)):
            try:
                return self._current().chat.completions.create(**kwargs)
            except RateLimitError:
                self._rotate()
            except APIStatusError as e:
                if e.status_code == 429:
                    self._rotate()
                else:
                    raise
        raise RuntimeError("All Groq API keys exhausted on chat request")

    def speech(self, text: str, model: str = "playai-tts", voice: str = "Fritz-PlayAI") -> bytes:
        """Return raw WAV bytes for the given text."""
        for _ in range(len(self._keys)):
            try:
                response = self._current().audio.speech.create(
                    model=model, voice=voice, input=text, response_format="wav"
                )
                return response.content
            except RateLimitError:
                self._rotate()
            except APIStatusError as e:
                if e.status_code == 429:
                    self._rotate()
                else:
                    raise
        raise RuntimeError("All Groq API keys exhausted on speech request")

    def transcribe(self, file_tuple: tuple, model: str, **kwargs):
        for _ in range(len(self._keys)):
            try:
                return self._current().audio.transcriptions.create(
                    file=file_tuple, model=model, **kwargs
                )
            except RateLimitError:
                self._rotate()
            except APIStatusError as e:
                if e.status_code == 429:
                    self._rotate()
                else:
                    raise
        raise RuntimeError("All Groq API keys exhausted on transcription request")


# Module-level singleton — imported by all services
pool = GroqPool(GROQ_API_KEYS)
