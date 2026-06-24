from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from backend.config import DATABASE_URL

# SQLite needs check_same_thread=False; PostgreSQL does not accept it
_is_sqlite = DATABASE_URL.startswith("sqlite")
_engine_kwargs: dict = {"pool_pre_ping": True}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id        = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, nullable=False, index=True)
    email     = Column(String, nullable=False)
    name      = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Book(Base):
    __tablename__ = "books"

    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String, nullable=False)
    user_id    = Column(String, nullable=True, index=True)  # Google sub
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id             = Column(Integer, primary_key=True, index=True)
    book_id        = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=True, index=True)
    number         = Column(Integer, nullable=False)
    title          = Column(String, nullable=True)
    generated_text = Column(Text, nullable=True)
    summary        = Column(Text, nullable=True)
    status         = Column(String, default="recording")  # recording | generating | done
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at    = Column(DateTime, nullable=True)

    book     = relationship("Book", back_populates="chapters")
    segments = relationship("AudioSegment", back_populates="chapter", cascade="all, delete-orphan")


class AudioSegment(Base):
    __tablename__ = "audio_segments"

    id              = Column(Integer, primary_key=True, index=True)
    chapter_id      = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    filename        = Column(String, nullable=False)
    transcript      = Column(Text, nullable=True)
    intent          = Column(String, nullable=True)
    order_index     = Column(Integer, nullable=False)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    file_expires_at = Column(DateTime, nullable=True)  # null once file has been deleted

    chapter = relationship("Chapter", back_populates="segments")


def _sqlite_migrate():
    """SQLite-only incremental migrations (not needed for fresh PostgreSQL)."""
    with engine.connect() as conn:
        book_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(books)")).fetchall()]
        if "user_id" not in book_cols:
            conn.execute(text("ALTER TABLE books ADD COLUMN user_id VARCHAR"))
            conn.commit()

        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(chapters)")).fetchall()]
        if "book_id" not in cols:
            conn.execute(text(
                "ALTER TABLE chapters ADD COLUMN book_id INTEGER REFERENCES books(id) ON DELETE CASCADE"
            ))
            conn.commit()

        indexes = conn.execute(text("PRAGMA index_list(chapters)")).fetchall()
        has_unique_num = any(
            idx[2] == 1
            and any(
                r[2] == "number"
                for r in conn.execute(text(f"PRAGMA index_info('{idx[1]}')")).fetchall()
            )
            for idx in indexes
        )

        if has_unique_num:
            conn.execute(text("DROP TABLE IF EXISTS _chapters_tmp"))
            conn.execute(text("""
                CREATE TABLE _chapters_tmp (
                    id INTEGER NOT NULL PRIMARY KEY, book_id INTEGER, number INTEGER NOT NULL,
                    title VARCHAR, generated_text TEXT, summary TEXT, status VARCHAR,
                    created_at DATETIME, finished_at DATETIME)
            """))
            conn.execute(text("""
                INSERT INTO _chapters_tmp
                SELECT id, book_id, number, title, generated_text,
                       summary, status, created_at, finished_at FROM chapters
            """))
            conn.execute(text("DROP TABLE chapters"))
            conn.execute(text("ALTER TABLE _chapters_tmp RENAME TO chapters"))
            for (book_id,) in conn.execute(text("SELECT id FROM books")).fetchall():
                ch_ids = [r[0] for r in conn.execute(
                    text("SELECT id FROM chapters WHERE book_id = :b ORDER BY number, id"), {"b": book_id}
                ).fetchall()]
                for new_num, ch_id in enumerate(ch_ids, 1):
                    conn.execute(text("UPDATE chapters SET number = :n WHERE id = :id"), {"n": new_num, "id": ch_id})
            conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _postgres_migrate():
    """Add columns introduced after initial schema creation."""
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE audio_segments ADD COLUMN IF NOT EXISTS file_expires_at TIMESTAMP WITH TIME ZONE"
        ))
        conn.commit()


def init_db():
    Base.metadata.create_all(bind=engine)  # creates all tables on fresh DB (SQLite or PostgreSQL)
    if _is_sqlite:
        _sqlite_migrate()
    else:
        _postgres_migrate()
