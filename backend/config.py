from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent / ".env")

# --- Groq Key Pool ---
# Collects GROQ_API_KEY_1 … GROQ_API_KEY_N in order, skipping blanks
GROQ_API_KEYS: list[str] = [
    v for v in (
        os.getenv(f"GROQ_API_KEY_{i}") for i in range(1, 20)
    ) if v
]
if not GROQ_API_KEYS:
    # Fallback: single key under legacy name
    _single = os.getenv("GROQ_API_KEY", "")
    if _single:
        GROQ_API_KEYS = [_single]

GROQ_STT_MODEL    = os.getenv("GROQ_STT_MODEL",    "whisper-large-v3-turbo")
GROQ_INTENT_MODEL = os.getenv("GROQ_INTENT_MODEL", "llama-3.1-8b-instant")
GROQ_LLM_MODEL    = os.getenv("GROQ_LLM_MODEL",    "llama-3.3-70b-versatile")

# --- Vector DB (Qdrant Cloud or local) ---
QDRANT_URL     = os.getenv("QDRANT_URL",     "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")   # None = local Docker (no auth)

# --- Database ---
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./audiobook.db")

# --- File Storage ---
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# --- App ---
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# --- Auth ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET       = os.getenv("JWT_SECRET", "change-this-secret-in-production")
JWT_EXPIRE_DAYS  = int(os.getenv("JWT_EXPIRE_DAYS", "30"))
