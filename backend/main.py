from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import init_db, get_db, User
from backend.routers import audio, chapters, books
from backend.config import CORS_ORIGINS
from backend.auth import verify_google_token, create_app_token, get_current_user

_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Pre-load embedding model at startup so first upload isn't delayed by download
    from backend.services.vector_store import _get_embedder
    _get_embedder()
    yield


app = FastAPI(title="AudioBook API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(books.router)
app.include_router(audio.router)
app.include_router(chapters.router)


class GoogleAuthBody(BaseModel):
    credential: str


@app.post("/auth/google")
def auth_google(body: GoogleAuthBody, db: Session = Depends(get_db)):
    """Verify Google ID token, upsert user, return our own 30-day JWT."""
    info = verify_google_token(body.credential)

    user = db.query(User).filter(User.google_id == info["sub"]).first()
    if user is None:
        user = User(google_id=info["sub"], email=info["email"], name=info["name"])
        db.add(user)
    else:
        user.email = info["email"]
        user.name  = info["name"]
    db.commit()

    token = create_app_token(info["sub"], info["email"], info["name"])
    return {"token": token, "email": info["email"], "name": info["name"]}


@app.get("/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return current_user


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Serve React SPA (production build) ───────────────────────────────────────
# Only mounted when the frontend has been built (i.e. frontend/dist exists).
if _FRONTEND_DIST.exists():
    _assets = _FRONTEND_DIST / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
